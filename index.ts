/* V3.0.0 2024-12-20

______                  ______       _ _     _
| ___ \                 | ___ \     (_) |   | |
| |_/ /___ _ __   ___   | |_/ /_   _ _| | __| | ___ _ __
|    // _ \ '_ \ / _ \  | ___ \ | | | | |/ _` |/ _ \ '__|
| |\ \  __/ |_) | (_) | | |_/ / |_| | | | (_| |  __/ |
\_| \_\___| .__/ \___/  \____/ \__,_|_|_|\__,_|\___|_|
          | |
          |_|

 */
import axios from 'axios';
import { getHash } from './lib/hash';
import { uploadOneFile } from './lib/sftp';
import { readUrl } from './lib/readUrl';
import { readNpmStats, updatePublished, readNpmIoPack, getNpmVersions, getNpmVersion } from './lib/npm';
import { extractLicenseInfo, getIoPack, readGithubStats } from './lib/github';
import { generateStableBadges, generateCountBadges } from './lib/badges';
import { generateForumStats, generateMap } from './lib/triggerIotServer';
import { readHashesFromS3, writeHashesToS3 } from './lib/hashes';
import { readReposFromS3, writeReposToS3 } from './lib/repos';
import { config } from './config';
import type { IoBrokerStatistics, Message, RepoAdapterObject, RepoInfo, StoredRepoAdapterObject } from './types';
import extend from 'extend';

const FAST_TEST = process.env.FAST_TEST === 'true';
const DEBUG = process.env.DEBUG === 'true';
const MAX_HISTORY_LENGTH = 7;

function findPath(path: string, url: string | undefined): string {
    if (!url) {
        return '';
    }
    if (url.substring(0, 'http://'.length) === 'http://' || url.substring(0, 'https://'.length) === 'https://') {
        return url;
    }
    if (path.substring(0, 'http://'.length) === 'http://' || path.substring(0, 'https://'.length) === 'https://') {
        return (path + url).replace(/\/\//g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
    }
    if (url && url[0] === '/') {
        return `${__dirname}/..${url}`;
    }
    return `${__dirname}/../${path}${url}`;
}

function sortRepo(sources: Record<string, StoredRepoAdapterObject>): Record<string, RepoAdapterObject> {
    // rebuild order
    const names = Object.keys(sources);
    const __sources: Record<string, RepoAdapterObject> = {};
    names.sort();
    names.forEach(name => {
        const obj = sources[name];

        if (name.startsWith('_')) {
            __sources[name] = obj as RepoAdapterObject;
        } else {
            __sources[name] = {
                meta: obj.meta,
                icon: obj.icon,
                type: obj.type,
                version: obj.version,
            } as RepoAdapterObject;
            // delete empty attributes
            Object.keys(__sources[name]).forEach(attr => {
                if (!(__sources[name] as Record<string, any>)[attr]) {
                    delete (__sources[name] as Record<string, any>)[attr];
                }
            });
        }
    });
    return __sources;
}

async function readInstallStatistics(sources: Record<string, RepoAdapterObject>): Promise<IoBrokerStatistics | null> {
    if (FAST_TEST) {
        return null;
    }

    try {
        const response = await axios(config.usageStatisticsURL, {
            timeout: 15000,
            validateStatus: status => status < 400,
        });
        const body: IoBrokerStatistics = response.data;
        if (body?.adapters) {
            Object.keys(body.adapters).forEach(
                adapter => sources[adapter] && (sources[adapter].stat = body.adapters[adapter]),
            );
        }
        return body;
    } catch (error) {
        console.warn(
            `Cannot readInstallStatistics: ${error.response ? error.response.data : error.message || error.code}`,
        );
        return null;
    }
}

function getLatestRepositoryFile(
    sources: Record<string, RepoAdapterObject>,
    path: string,
): Promise<Record<string, RepoAdapterObject>> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const failCounter = [];
        const count = Object.keys(sources).length;
        let timeout: NodeJS.Timeout | null = setTimeout(() => {
            if (timeout) {
                timeout = null;
                reject(new Error(`Timeout by read all package.json (${count * 2}) seconds`));
            }
        }, count * 2000);

        for (const name in sources) {
            if (!Object.prototype.hasOwnProperty.call(sources, name) || name.startsWith('_')) {
                continue;
            }
            if (FAST_TEST && name !== 'meteoalarm') {
                continue;
            }

            if (sources[name].url) {
                sources[name].url = findPath(path, sources[name].url);
            }
            if (sources[name].meta) {
                sources[name].meta = findPath(path, sources[name].meta);
            }
            if (sources[name].icon) {
                sources[name].icon = findPath(path, sources[name].icon);
            }

            if (timeout && sources[name].meta) {
                if (DEBUG) {
                    console.log(`Read io-package for "${name}"...`);
                }
                sources[name].name = name;

                // Read data from npm
                let version: null | string = null;
                try {
                    // Read the latest tag on npm
                    version = await getNpmVersion(name);
                } catch (error) {
                    console.error(`Cannot read latest version for "${name}": ${error}`);
                }
                if (version) {
                    let source = sources[name];
                    try {
                        const packs = await readNpmIoPack(name, version);
                        const pack = packs['package.json'];
                        const ioPack = packs['io-package.json'];
                        // validate the pack file
                        if (!packs['package.json']?.version) {
                            throw new Error(`package.json is invalid for ${source.name}`);
                        }
                        // validate the io-pack file
                        if (
                            !ioPack.common?.version ||
                            !ioPack.common.name ||
                            (!ioPack.native && source.name !== 'js-controller')
                        ) {
                            throw new Error(`io-package.json is invalid for ${source.name}`);
                        }

                        if (ioPack?.common) {
                            // remember the type from repo
                            const type = source.type;
                            source = extend(true, source, ioPack.common);

                            // write into common the node requirements
                            if (pack?.engines?.node) {
                                source.node = pack.engines.node;
                            }

                            // overwrite type of adapter from repository
                            if (type) {
                                source.type = type;
                            }

                            const licenseInfo = extractLicenseInfo({ ioPackJson: ioPack, packJson: pack });
                            source.licenseInformation = licenseInfo;

                            // license and licenseUrl now contained in licenseInfo, but keep it for backward compatibility (14.02.2024)
                            source.license = licenseInfo.license;
                            if (licenseInfo.link) {
                                source.licenseUrl = licenseInfo.link;
                            }

                            // To optimize the size of the repo, store the license information only if it is not free
                            // Later on if admin 6.14.0 is old enough, we should remove license/licenseUrl and publish licenseInfo ALWAYS instead
                            if (
                                source.licenseInformation &&
                                (source.licenseInformation.type === 'free' ||
                                    source.licenseInformation.type === undefined)
                            ) {
                                delete source.licenseInformation;
                            }
                        }

                        source.version = version;
                        sources[name] = source;
                    } catch (error) {
                        console.warn(`Cannot read io-package "${name}" from npm: ${error}`);
                    }
                } else {
                    // read data from GitHub
                    try {
                        const source = await getIoPack(sources[name]);
                        if (!source) {
                            failCounter.push(name);
                            if (failCounter.length > 10) {
                                clearTimeout(timeout);

                                reject(new Error('Looks like there is no internet.'));
                            }
                        } else {
                            sources[name] = source;
                        }
                    } catch (err) {
                        console.error(`Cannot read "${name}": ${err}`);
                        failCounter.push(name);
                        if (failCounter.length > 10) {
                            clearTimeout(timeout);

                            reject(new Error('Looks like there is no internet.'));
                        }
                    }
                }
            }
            if (!timeout) {
                break;
            }
        }

        // all packages are processed
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
            if (failCounter.length) {
                console.error(`Following packages cannot be read: ${failCounter.join(', ')}`);
            }

            resolve(sources);
        }
    });
}

async function getStableRepositoryFile(
    sources: Record<string, RepoAdapterObject>,
    path: string,
): Promise<Record<string, RepoAdapterObject>> {
    let last;
    try {
        // read actual repository
        last = await readReposFromS3(null, '');
    } catch (e) {
        console.error(`Cannot read stable repository file: ${e}`);
        last = {};
    }
    const count = Object.keys(sources).length;

    // remove deleted adapters
    const names = Object.keys(last);
    const newNames = Object.keys(sources);
    names.forEach(name => {
        if (!newNames.includes(name)) {
            delete last[name];
        }
    });

    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        const failCounter = [];
        let timeout: NodeJS.Timeout | null = setTimeout(() => {
            if (timeout) {
                timeout = null;
                reject(new Error(`Timeout by read all package.json (${count * 2}) seconds`));
            }
        }, count * 2000);

        for (const name in sources) {
            if (!Object.prototype.hasOwnProperty.call(sources, name)) {
                continue;
            }
            if (FAST_TEST && name !== 'meteoalarm') {
                continue;
            }
            // if new or changed
            let changed = !last[name] || !last[name].name;
            if (changed) {
                console.log(`Update info for ${name} because new`);
            } else if (
                last[name] &&
                sources[name] &&
                last[name].url &&
                last[name].url !== findPath(path, sources[name].url)
            ) {
                console.log(
                    `Update info for ${name} because URL changed from ${last[name].url} to ${findPath(path, sources[name].url)}`,
                );
                changed = true;
            } else if (
                last[name] &&
                sources[name] &&
                last[name].meta &&
                last[name].meta !== findPath(path, sources[name].meta)
            ) {
                console.log(
                    `Update info for ${name} because META changed from ${last[name].meta} to ${findPath(path, sources[name].meta)}`,
                );
                changed = true;
            } else if (
                last[name] &&
                sources[name] &&
                last[name].icon &&
                last[name].icon !== findPath(path, sources[name].icon)
            ) {
                console.log(
                    `Update info for ${name} because ICON changed from ${last[name].icon} to ${findPath(path, sources[name].icon)}`,
                );
                changed = true;
            } else if (last[name] && sources[name] && last[name].version !== sources[name].version) {
                // if a version was changed
                console.log(
                    `Update info for ${name} because VERSION changed from ${last[name].version} to ${sources[name].version}`,
                );
                changed = true;
            }
            if (changed) {
                if (DEBUG) {
                    console.log(`Read io-package from npm for "${name}"...`);
                }

                // read data from npm
                try {
                    const data = await readNpmIoPack(name, sources[name].version);
                    const oldData = {
                        url: sources[name].url,
                        icon: sources[name].icon,
                        meta: sources[name].meta,
                    };

                    if (data['io-package.json'] && data['io-package.json'].common) {
                        sources[name] = data['io-package.json'].common as RepoAdapterObject;
                    }
                    if (data['package.json'] && data['package.json'].engines && data['package.json'].engines.node) {
                        sources[name].node = data['package.json'].engines.node;
                    }

                    if (oldData.url) {
                        sources[name].url = findPath(path, oldData.url);
                    } else {
                        delete sources[name].url;
                    }
                    if (oldData.icon) {
                        sources[name].icon = findPath(path, oldData.icon);
                    }
                    if (oldData.meta) {
                        sources[name].meta = findPath(path, oldData.meta);
                    }
                } catch (err) {
                    failCounter.push(`Cannot read ${name}: ${err}`);

                    if (failCounter.length > 10) {
                        break;
                    }
                }
            } else {
                sources[name] = last[name];
            }
        }

        // all packages are processed
        if (timeout) {
            clearTimeout(timeout);
            timeout = null;
            if (failCounter.length) {
                if (failCounter.length > 10) {
                    reject(new Error('Looks like there is no internet.'));
                    return;
                }
                console.error(`Following packages cannot be read: ${failCounter.join(', ')}`);
            }

            resolve(sources);
        }
    });
}

async function updatePublishes(
    latest: Record<string, RepoAdapterObject>,
    stable: Record<string, RepoAdapterObject>,
): Promise<void> {
    if (FAST_TEST) {
        return;
    }
    for (const name in latest) {
        if (!Object.prototype.hasOwnProperty.call(latest, name) || name.startsWith('_')) {
            continue;
        }
        // take the published date from the latest repo and write it into stable repo
        if (latest[name].published && stable[name] && !stable[name].published) {
            stable[name].published = latest[name].published;
        }
        if (!latest[name].published || !latest[name].versionDate || (stable[name] && !stable[name].versionDate)) {
            try {
                await updatePublished(name, latest[name], stable[name]);
            } catch {
                // ignore
            }
        }
    }
}

async function cutHistory(adapter: RepoAdapterObject, name: string): Promise<void> {
    if (!adapter?.news) {
        console.error(`Adapter ${name} is invalid: ${!adapter ? 'No adapter object' : 'No news found'}`);
        return;
    }
    const versions = Object.keys(adapter.news);
    const oldLen = versions.length;
    if (oldLen > MAX_HISTORY_LENGTH) {
        versions.splice(MAX_HISTORY_LENGTH, oldLen - MAX_HISTORY_LENGTH);
        const obj = adapter.news;
        adapter.news = {};
        versions.forEach(v => (adapter.news![v] = obj[v]));
        console.warn(`News for REPO ${adapter.name} were cut from ${oldLen} to ${Object.keys(versions).length}`);
    }
    // check that the versions exist on npm
    const npmVersions = await getNpmVersions(name);
    if (npmVersions) {
        versions.forEach(v => {
            if (!npmVersions.includes(v)) {
                console.warn(`Version ${v} of ${name} does not exist on npm.`);
                delete adapter.news![v];
            }
        });
    }
}

// eslint-disable-next-line
async function onlyNews() {
    let hashes = await readHashesFromS3();
    hashes = hashes || {};
    // read news
    const jsonNews: Message[] = (await readUrl(
        'https://raw.githubusercontent.com/ioBroker/ioBroker.docs/master/info/news.json',
    )) as Message[];
    await uploadOneFile('/repo/news.json', JSON.stringify(jsonNews), hashes);
    // write stable file hash on server
    const date = new Date().toISOString();
    const jsonNewsStr = JSON.stringify(jsonNews);
    const hashNews = getHash(jsonNewsStr);

    const jsonHashNews = JSON.stringify({
        hash: hashNews,
        date,
        name: 'news.json',
    });
    if (DEBUG) {
        console.log(jsonHashNews);
    }
    await uploadOneFile('/repo/news-hash.json', jsonHashNews, hashes);
}

export async function post(req: { body: string }): Promise<{ statusCode: number; body: string }> {
    if (DEBUG) {
        console.log(JSON.stringify(req));
    }

    let body: { commits: { modified: string[] }[] } | undefined;
    try {
        body = req?.body && JSON.parse(req.body);
    } catch {
        console.warn('Cannot parse body. May be it is time trigger.');
    }

    if (!DEBUG) {
        console.log(JSON.stringify(req.body));
    }

    if (
        !body ||
        !body.commits ||
        body.commits.find(c =>
            c.modified.find(file => file === 'sources-dist.json' || file === 'sources-dist-stable.json'),
        )
    ) {
        // read latest repo
        try {
            const _latest: Record<string, StoredRepoAdapterObject> = (await readUrl(
                'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json',
            )) as Record<string, StoredRepoAdapterObject>;
            // read stable repo
            const _stable: Record<string, StoredRepoAdapterObject> = (await readUrl(
                'https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json',
            )) as Record<string, StoredRepoAdapterObject>;
            // read news
            const jsonNews: Message[] = (await readUrl(
                'https://raw.githubusercontent.com/ioBroker/ioBroker.docs/master/info/news.json',
            )) as Message[];
            // read actual repository to take GitHub statistics
            const actualLatest: Record<string, RepoAdapterObject> = (await readUrl(
                'https://iobroker.live/repo/sources-dist-latest.json',
            )) as Record<string, RepoAdapterObject>;
            // read badges hashes
            let hashes = await readHashesFromS3();
            hashes = hashes || {};
            let stable: Record<string, RepoAdapterObject> = sortRepo(_stable);
            let latest: Record<string, RepoAdapterObject> = sortRepo(_latest);
            const MAX_STEPS = 19;

            console.log(`------------ STEP 1 of ${MAX_STEPS}: readGithubStats --------------------`);
            // take GitHub statistics from current repo. Because of the rate limit, we can read only 10 adapters per session.
            if (actualLatest) {
                Object.keys(latest).forEach(adapter => {
                    if (!actualLatest[adapter]) {
                        return;
                    }
                    if (actualLatest[adapter].stars !== -1 && actualLatest[adapter].stars !== undefined) {
                        latest[adapter].stars = actualLatest[adapter].stars;
                    }
                    if (actualLatest[adapter].issues !== undefined) {
                        latest[adapter].issues = actualLatest[adapter].issues;
                    }
                    if (actualLatest[adapter].score !== undefined) {
                        latest[adapter].score = actualLatest[adapter].score;
                    }
                });
            }
            await readGithubStats(latest);

            console.log(`------------ STEP 2 of ${MAX_STEPS}: readNpmStats --------------------`);
            await readNpmStats(latest);

            console.log(`------------ STEP 3 of ${MAX_STEPS}: readInstallStatistics --------------------`);
            const stat = await readInstallStatistics(latest);

            console.log(`------------ STEP 4 of ${MAX_STEPS}: getLatestRepositoryFile --------------------`);
            try {
                latest = await getLatestRepositoryFile(latest, '');
            } catch (e) {
                console.error(`Cannot get latest repository file: ${e}`);
            }

            console.log(`------------ STEP 5 of ${MAX_STEPS}: getStableRepositoryFile --------------------`);
            try {
                stable = await getStableRepositoryFile(stable, '');
            } catch (e) {
                console.error(`Cannot get stable repository file: ${e}`);
            }
            console.log(`------------ STEP 6 of ${MAX_STEPS}: updatePublishes --------------------`);
            await updatePublishes(latest, stable);

            // combine latest and stable repos
            const keys = Object.keys(stable);
            for (let k = 0; k < keys.length; k++) {
                const a = keys[k];
                if (a.startsWith('_')) {
                    continue;
                }

                // ignore all history over 7 entries
                await cutHistory(stable[a], a);

                if (latest[a]) {
                    if (latest[a].$schema) {
                        delete latest[a].$schema;
                    }
                    if (stable[a].$schema) {
                        delete stable[a].$schema;
                    }

                    if (latest[a].stars !== undefined) {
                        stable[a].stars = latest[a].stars;
                    }
                    if (latest[a].stat !== undefined) {
                        stable[a].stat = latest[a].stat;
                    }
                    if (latest[a].issues !== undefined) {
                        stable[a].issues = latest[a].issues;
                    }
                    if (latest[a].score !== undefined) {
                        stable[a].score = latest[a].score;
                    }
                    if (latest[a].weekDownloads !== undefined) {
                        stable[a].weekDownloads = latest[a].weekDownloads;
                    }
                    if (latest[a].weekDownloads !== undefined) {
                        stable[a].weekDownloads = latest[a].weekDownloads;
                    }
                    if (latest[a].published !== undefined) {
                        stable[a].published = latest[a].published;
                    }
                }
            }

            const lKeys = Object.keys(latest);
            // cut the latest history and extract license information
            for (let l = 0; l < lKeys.length; l++) {
                const a = lKeys[l];
                if (a.startsWith('_')) {
                    continue;
                }
                await cutHistory(latest[a], a);
                if (stable[a]) {
                    latest[a].stable = stable[a].version;
                }
            }

            const repoInfo: RepoInfo = (latest._repoInfo as unknown as RepoInfo) || ({} as RepoInfo);

            // set repository build time
            repoInfo.repoTime = new Date().toISOString();
            if (latest.admin) {
                // @ts-expect-error must be so
                latest.admin.repoTime = new Date().toISOString();
            }
            // @ts-expect-error must be so
            latest._repoInfo = repoInfo;

            const sRepoInfo: RepoInfo = (stable._repoInfo as unknown as RepoInfo) || ({} as RepoInfo);
            sRepoInfo.repoTime = new Date().toISOString();
            if (stable.admin) {
                // @ts-expect-error must be so
                stable.admin.repoTime = new Date().toISOString();
            }
            // @ts-expect-error must be so
            stable._repoInfo = sRepoInfo;

            // read recommended versions
            const versions = await axios('https://raw.githubusercontent.com/ioBroker/ioBroker/master/versions.json');
            if (versions?.data) {
                repoInfo.recommendedVersions = versions.data;
                sRepoInfo.recommendedVersions = versions.data;
            }

            const jsonLatest = JSON.stringify(latest);
            const jsonStable = JSON.stringify(stable);

            // try to fix an encoding problem. Stable has wrong russian chars
            Object.keys(stable).forEach(adapter => {
                if (adapter.startsWith('_')) {
                    return;
                }
                if (stable[adapter]) {
                    if (!latest[adapter]) {
                        return;
                    }

                    stable[adapter].latestVersion = latest[adapter].version;
                    latest[adapter].stableVersion = stable[adapter].version;

                    if (latest[adapter].desc) {
                        stable[adapter].desc = latest[adapter].desc;
                    }

                    // copy data from latest into stable, because stable encoding is broken
                    if (stable[adapter].news) {
                        Object.keys(stable[adapter].news).forEach(version => {
                            if (latest[adapter].news && latest[adapter].news[version]) {
                                stable[adapter].news![version] = latest[adapter].news[version];
                            }
                        });
                    }

                    if (latest[adapter].titleLang) {
                        stable[adapter].titleLang = latest[adapter].titleLang;
                    }
                }
            });

            // make news smaller and not formatted
            const jsonNewsStr = JSON.stringify(jsonNews);
            const hashNews = getHash(jsonNewsStr);
            const date = new Date().toISOString();

            const hashLatest = getHash(jsonLatest);
            const hashStable = getHash(jsonStable);

            console.log(
                `------------ STEP 7 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-latest.json' --------------------`,
            );
            // write the latest file on server
            await uploadOneFile('/repo/sources-dist-latest.json', jsonLatest, hashes);
            // write the latest file hash on server
            const jsonHashLatest = JSON.stringify({
                hash: hashLatest,
                date,
                name: 'sources-dist-latest.json',
            });
            if (DEBUG) {
                console.log(jsonHashLatest);
            }

            console.log(
                `------------ STEP 8 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-latest-hash.json' --------------------`,
            );
            await uploadOneFile('/repo/sources-dist-latest-hash.json', jsonHashLatest, hashes);

            // write stable file on server
            console.log(
                `------------ STEP 9 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist.json' --------------------`,
            );
            await uploadOneFile('/repo/sources-dist.json', jsonStable, hashes);

            // write stable file hash on server
            const jsonHashStable = JSON.stringify({
                hash: hashStable,
                date,
                name: 'sources-dist.json',
            });
            if (DEBUG) {
                console.log(jsonHashStable);
            }
            console.log(
                `------------ STEP 10 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-hash.json' --------------------`,
            );
            await uploadOneFile('/repo/sources-dist-hash.json', jsonHashStable, hashes);

            // write news file on server
            console.log(`------------ STEP 11 of ${MAX_STEPS}: uploadOneFile '/repo/news.json' --------------------`);
            await uploadOneFile('/repo/news.json', jsonNewsStr, hashes);

            console.log(
                `------------ STEP 12 of ${MAX_STEPS}: uploadOneFile '/repo/news-hash.json' --------------------`,
            );
            // write news file hash on server
            const jsonHashNews = JSON.stringify({
                hash: hashNews,
                date,
                name: 'news.json',
            });
            if (DEBUG) {
                console.log(jsonHashNews);
            }
            await uploadOneFile('/repo/news-hash.json', jsonHashNews, hashes);

            console.log(`------------ STEP 13 of ${MAX_STEPS}: generateStableBadges --------------------`);
            await generateStableBadges(stable, latest, hashes);

            console.log(`------------ STEP 14 of ${MAX_STEPS}: generateCountBadges --------------------`);
            if (stat) {
                await generateCountBadges(hashes, stat);
            }

            console.log(`------------ STEP 15 of ${MAX_STEPS}: generateMap --------------------`);
            await generateMap();

            console.log(`------------ STEP 16 of ${MAX_STEPS}: generateForumStats --------------------`);
            await generateForumStats();

            console.log(`------------ STEP 17 of ${MAX_STEPS}: writeHashesToS3 --------------------`);
            await writeHashesToS3(hashes);

            console.log(`------------ STEP 18 of ${MAX_STEPS}: writeReposToS3 --------------------`);
            await writeReposToS3(null, '', stable);

            console.log(`------------ STEP 19 of ${MAX_STEPS}: finish! --------------------`);

            return {
                statusCode: 200,
                body: JSON.stringify({ result: 'OK' }),
            };
        } catch (err) {
            console.error(`CANNOT finish repo build: ${err}`);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: err }),
            };
        }
    } else {
        console.log('Nothing changed');

        return {
            statusCode: 200,
            body: JSON.stringify({ result: 'Nothing changed' }),
        };
    }
}
