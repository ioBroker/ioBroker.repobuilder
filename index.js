/* V2.0.0 2024-03-17

______                  ______       _ _     _
| ___ \                 | ___ \     (_) |   | |
| |_/ /___ _ __   ___   | |_/ /_   _ _| | __| | ___ _ __
|    // _ \ '_ \ / _ \  | ___ \ | | | | |/ _` |/ _ \ '__|
| |\ \  __/ |_) | (_) | | |_/ / |_| | | | (_| |  __/ |
\_| \_\___| .__/ \___/  \____/ \__,_|_|_|\__,_|\___|_|
          | |
          |_|

 */
'use strict';

const axios = require('axios');
const FAST_TEST = process.env.FAST_TEST === 'true' || process.env.FAST_TEST === true;
const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === true;
const MAX_HISTORY_LENGTH = 7;
const config = require('./config.js');

const getHash = require('./lib/hash');
const { uploadOneFile } = require('./lib/sftp');
const readUrl = require('./lib/readUrl');
const { readNpmStats, updatePublished, readNpmIoPack } = require('./lib/npm');
const { getIoPack, readGithubStats } = require('./lib/github');
const { generateStableBadges, generateCountBadges } = require('./lib/badges');
const { generateForumStats, generateMap } = require('./lib/triggerIotServer');
const { readHashesFromS3, writeHashesToS3 } = require('./lib/hashes');
const { readReposFromS3, writeReposToS3 } = require('./lib/repos');

function findPath(path, url) {
    if (!url) {
        return '';
    }
    if (url.substring(0, 'http://'.length) === 'http://' ||
        url.substring(0, 'https://'.length) === 'https://') {
        return url;
    } else {
        if (path.substring(0, 'http://'.length) === 'http://' ||
            path.substring(0, 'https://'.length) === 'https://') {
            return (path + url).replace(/\/\//g, '/').replace('http:/', 'http://').replace('https:/', 'https://');
        } else {
            if (url && url[0] === '/') {
                return `${__dirname}/..${url}`;
            } else {
                return `${__dirname}/../${path}${url}`;
            }
        }
    }
}

function sortRepo(sources) {
    // rebuild order
    const names = Object.keys(sources);
    const __sources = {};
    names.sort();
    names.forEach(name => {
        const obj = sources[name];

        if (name.startsWith('_')) {
            __sources[name] = obj;
        } else {
            __sources[name] = {
                meta: obj.meta,
                icon: obj.icon,
                url: obj.url,
                type: obj.type,
                version: obj.version,
                published: obj.published,
                versionDate: obj.versionDate,
            };
            // delete empty attributes
            Object.keys(__sources[name]).forEach(attr => !__sources[name][attr] && delete __sources[name][attr]);
        }
    });
    return __sources;
}

async function readInstallStatistics(sources) {
    if (FAST_TEST) {
        return null;
    }

    try {
        const response = await axios(config.usageStatisticsURL, {
            timeout: 15000,
            validateStatus: status => status < 400
        })
        const body = response.data;
        body && body.adapters && Object.keys(body.adapters).forEach(adapter =>
            sources[adapter] && (sources[adapter].stat = body.adapters[adapter]));
        return body;
    } catch (error) {
        console.warn(`Cannot readInstallStatistics: ${error.response ? error.response.data : (error.message || error.code)}`);
        return null;
    }
}

function getLatestRepositoryFile(sources, path) {
    return new Promise(async (resolve, reject) => {
        const failCounter = [];
        const count = Object.keys(sources).length;
        let timeout = setTimeout(() => {
            if (timeout) {
                timeout = null;
                reject(`Timeout by read all package.json (${count * 2}) seconds`);
            }
        }, count * 2000);

        for (let name in sources) {
            if (!sources.hasOwnProperty(name) || name.startsWith('_')) {
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
                DEBUG && console.log(`Read io-package for "${name}"...`);
                sources[name].name = name;

                // read data from GitHub
                const source = await getIoPack(sources[name]);
                if (!source) {
                    failCounter.push(name);
                    if (failCounter.length > 10) {
                        clearTimeout(timeout);

                        reject('Looks like there is no internet.');
                    }
                } else {
                    sources[name] = source;
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

async function getStableRepositoryFile(sources, path, callback) {
    let last;
    try {
        // read actual repository
        last = await readReposFromS3('');
    } catch (e) {
        console.error(`Cannot read stable repository file: ${e}`);
        last = {};
    }
    let count = Object.keys(sources).length;

    // remove deleted adapters
    const names = Object.keys(last);
    const newNames = Object.keys(sources);
    names.forEach(name => {
        if (!newNames.includes(name)) {
            delete last[name];
        }
    });

    return new Promise(async (resolve, reject) => {
        const failCounter = [];
        let timeout = setTimeout(() => {
            if (timeout) {
                timeout = null;
                reject(`Timeout by read all package.json (${count * 2}) seconds`);
                callback = null;
            }
        }, count * 2000);

        for (let name in sources) {
            if (!sources.hasOwnProperty(name)) {
                continue;
            }
            if (FAST_TEST && name !== 'meteoalarm') {
                continue;
            }
            // if new or changed
            let changed = !last[name] || !last[name].name;
            if (changed) {
                console.log(`Update info for ${name} because new`);
            } else if (last[name] && sources[name] && last[name].url && last[name].url !== findPath(path, sources[name].url)) {
                console.log(`Update info for ${name} because URL changed from ${last[name].url} to ${findPath(path, sources[name].url)}`);
                changed = true;
            } else if (last[name] && sources[name] && last[name].meta && last[name].meta !== findPath(path, sources[name].meta)) {
                console.log(`Update info for ${name} because META changed from ${last[name].meta} to ${findPath(path, sources[name].meta)}`);
                changed = true;
            } else if (last[name] && sources[name] && last[name].icon && last[name].icon !== findPath(path, sources[name].icon)) {
                console.log(`Update info for ${name} because ICON changed from ${last[name].icon} to ${findPath(path, sources[name].icon)}`);
                changed = true;
            } else if (last[name] && sources[name] && last[name].version !== sources[name].version) {
                // if a version was changed
                console.log(`Update info for ${name} because VERSION changed from ${last[name].version} to ${sources[name].version}`);
                changed = true;
            }
            if (changed) {
                DEBUG && console.log(`Read io-package from npm for "${name}"...`);

                // read data from GitHub
                try {
                    const data = await readNpmIoPack(name, sources[name].version);
                    const oldData = {
                        url: sources[name].url,
                        icon: sources[name].icon,
                        meta: sources[name].meta,
                    };

                    if (data['io-package.json'] && data['io-package.json'].common) {
                        sources[name] = data['io-package.json'].common;
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
                    reject('Looks like there is no internet.');
                    return;
                } else {
                    console.error(`Following packages cannot be read: ${failCounter.join(', ')}`);
                }
            }

            resolve(sources);
        }
    });
}

async function updatePublishes(latest, stable) {
    // if (FAST_TEST) {
    //     return;
    // }
    for (let name in latest) {
        if (!latest.hasOwnProperty(name) || name.startsWith('_')) {
            continue;
        }
        // take the published date from the latest repo and write it into stable repo
        if (latest[name].published && stable[name] && !stable[name].published) {
            stable[name].published = latest[name].published;
        }
        if (!latest[name].published || !latest[name].versionDate || (stable[name] && !stable[name].versionDate)) {
            try {
                await updatePublished(name, latest[name], stable[name]);
            } catch (err) {
                // ignore
            }
        }
    }
}

function cutHistory(adapter, name) {
    if (!adapter || !adapter.news) {
        console.error(`Adapter ${name} is invalid: ${!adapter ? 'No adapter object' : 'No news found'}`);
        return;
    }
    const versions = Object.keys(adapter.news);
    const oldLen = versions.length;
    if (oldLen > MAX_HISTORY_LENGTH) {
        versions.splice(MAX_HISTORY_LENGTH, oldLen - MAX_HISTORY_LENGTH);
        const obj = adapter.news;
        adapter.news = {};
        versions.forEach(v => adapter.news[v] = obj[v]);
        console.warn(`News for REPO ${adapter.name} were cut from ${oldLen} to ${Object.keys(versions).length}`);
    }
}

async function onlyNews() {
    let hashes = await readHashesFromS3()
    hashes = hashes || {};
    // read news
    let jsonNews = await readUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.docs/master/info/news.json');
    await uploadOneFile('/repo/news.json', JSON.stringify(jsonNews), hashes);
    // write stable file hash on server
    const date = new Date().toISOString();
    jsonNews = JSON.stringify(jsonNews);
    const hashNews = getHash(jsonNews);

    const jsonHashNews = JSON.stringify({
        hash: hashNews,
        date,
        name: 'news.json',
    });
    DEBUG && console.log(jsonHashNews);
    await uploadOneFile('/repo/news-hash.json', jsonHashNews, hashes);
}

async function post(req) {
    DEBUG && console.log(JSON.stringify(req));

    let body;
    try {
        body = req && req.body && JSON.parse(req.body);
    } catch (e) {
        console.warn('Cannot parse body. May be it is time trigger.');
    }

    !DEBUG && console.log(JSON.stringify(req.body));

    if (!body || !body.commits || body.commits.find(c => c.modified.find(file => file === 'sources-dist.json' || file === 'sources-dist-stable.json'))) {
        // read latest repo
        try {
            let latest = await readUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist.json');
            // read stable repo
            let stable = await readUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.repositories/master/sources-dist-stable.json');
            // read news
            let jsonNews = await readUrl('https://raw.githubusercontent.com/ioBroker/ioBroker.docs/master/info/news.json');
            // read actual repository to take GitHub statistics
            const actualLatest = await readUrl('https://iobroker.live/repo/sources-dist-latest.json');
            // read badges hashes
            let hashes = await readHashesFromS3();
            hashes = hashes || {};
            stable = sortRepo(stable);
            latest = sortRepo(latest);
            const MAX_STEPS = 19;

            console.log(`------------ STEP 1 of ${MAX_STEPS}: readGithubStats --------------------`);
            // take GitHub statistics from current repo. Because of the rate limit, we can read only 10 adapters per session.
            actualLatest && Object.keys(latest).forEach(adapter => {
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
            Object.keys(stable).forEach(a => {
                if (a.startsWith('_')) {
                    return;
                }
                // ignore all history over 7 entries
                cutHistory(stable[a], a);
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
            });

            // cut the latest history and extract license information
            Object.keys(latest).forEach(a => {
                if (a.startsWith('_')) {
                    return;
                }
                cutHistory(latest[a], a);
                if (stable[a]) {
                    latest[a].stable = stable[a].version;
                }
            });

            // set repository build time
            latest._repoInfo = latest._repoInfo || {};
            latest._repoInfo.repoTime = new Date().toISOString();
            if (latest.admin) {
                latest.admin.repoTime = new Date().toISOString();
            }

            stable._repoInfo = stable._repoInfo || {};
            stable._repoInfo.repoTime = new Date().toISOString();
            if (stable.admin) {
                stable.admin.repoTime = new Date().toISOString();
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
                    latest[adapter].stableVersion = stable[adapter].version

                    if (latest[adapter].desc) {
                        stable[adapter].desc = latest[adapter].desc;
                    }

                    // copy data from latest into stable, because stable encoding is broken
                    stable[adapter].news && Object.keys(stable[adapter].news).forEach(version => {
                        if (latest[adapter].news && latest[adapter].news[version]) {
                            stable[adapter].news[version] = latest[adapter].news[version];
                        }
                    });

                    if (latest[adapter].titleLang) {
                        stable[adapter].titleLang = latest[adapter].titleLang;
                    }
                }
            });

            // make news smaller and not formatted
            jsonNews = JSON.stringify(jsonNews);
            const hashLatest = getHash(jsonLatest);
            const hashStable = getHash(jsonStable);
            const hashNews = getHash(jsonNews);
            const date = new Date().toISOString();

            console.log(`------------ STEP 7 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-latest.json' --------------------`);
            // write the latest file on server
            await uploadOneFile('/repo/sources-dist-latest.json', jsonLatest, hashes);
            // write the latest file hash on server
            const jsonHashLatest = JSON.stringify({
                hash: hashLatest,
                date,
                name: 'sources-dist-latest.json',
            });
            DEBUG && console.log(jsonHashLatest);

            console.log(`------------ STEP 8 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-latest-hash.json' --------------------`);
            await uploadOneFile('/repo/sources-dist-latest-hash.json', jsonHashLatest, hashes);

            // write stable file on server
            console.log(`------------ STEP 9 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist.json' --------------------`);
            await uploadOneFile('/repo/sources-dist.json', jsonStable, hashes);

            // write stable file hash on server
            const jsonHashStable = JSON.stringify({
                hash: hashStable,
                date,
                name: 'sources-dist.json'
            });
            DEBUG && console.log(jsonHashStable);
            console.log(`------------ STEP 10 of ${MAX_STEPS}: uploadOneFile '/repo/sources-dist-hash.json' --------------------`);
            await uploadOneFile('/repo/sources-dist-hash.json', jsonHashStable, hashes);

            // write news file on server
            console.log(`------------ STEP 11 of ${MAX_STEPS}: uploadOneFile '/repo/news.json' --------------------`);
            await uploadOneFile('/repo/news.json', jsonNews, hashes)

            console.log(`------------ STEP 12 of ${MAX_STEPS}: uploadOneFile '/repo/news-hash.json' --------------------`);
            // write news file hash on server
            const jsonHashNews = JSON.stringify({
                hash: hashNews,
                date,
                name: 'news.json'
            });
            DEBUG && console.log(jsonHashNews);
            await uploadOneFile('/repo/news-hash.json', jsonHashNews, hashes);

            console.log(`------------ STEP 13 of ${MAX_STEPS}: generateStableBadges --------------------`);
            await generateStableBadges(stable, latest, hashes);

            console.log(`------------ STEP 14 of ${MAX_STEPS}: generateCountBadges --------------------`);
            await generateCountBadges(hashes, stat);

            console.log(`------------ STEP 15 of ${MAX_STEPS}: generateMap --------------------`);
            await generateMap();

            console.log(`------------ STEP 16 of ${MAX_STEPS}: generateForumStats --------------------`);
            await generateForumStats();

            console.log(`------------ STEP 17 of ${MAX_STEPS}: writeHashesToS3 --------------------`);
            await writeHashesToS3(hashes)

            console.log(`------------ STEP 18 of ${MAX_STEPS}: writeReposToS3 --------------------`);
            await writeReposToS3('', stable);

            console.log(`------------ STEP 19 of ${MAX_STEPS}: finish! --------------------`);

            return {
                statusCode: 200,
                body: JSON.stringify({result: 'OK'})
            };
        } catch (err) {
            console.error(`CANNOT finish repo build: ${err}`);
            return {
                statusCode: 500,
                body: JSON.stringify({error: err})
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

exports.handler = post;

if (FAST_TEST) {
    post({body: '{"commits": [{"modified": ["sources-dist.json"]}]}'})
        .then(response => console.log(JSON.stringify(response)));
}

