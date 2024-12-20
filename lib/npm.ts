import semver from 'semver';
import axios from 'axios';
import { readUrl } from './readUrl';
import { extractPackageFiles } from './extract';
import type { NpmInfo, RepoAdapterObject } from '../types';

const DEBUG = process.env.DEBUG === 'true';
const FAST_TEST = process.env.FAST_TEST === 'true';
const DEFAULT_TIMEOUT = 20000;

const adapterCache: Record<string, NpmInfo | null> = {};

export async function getNpmVersions(adapter: string): Promise<string[] | null> {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        adapterCache[adapter] = (await readUrl(url)) as NpmInfo;
    }
    if (adapterCache[adapter]) {
        return adapterCache[adapter]!.time ? adapterCache[adapter] && Object.keys(adapterCache[adapter]!.time) : null;
    }
    return null;
}

/**
 * Reads an adapter's npm version
 *
 * @param adapter The adapter to read the npm version from. Null for the root ioBroker packet
 * @return The version of the adapter or null if the version could not be read
 */
export async function getNpmVersion(adapter?: string): Promise<string | null> {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        adapterCache[adapter] = (await readUrl(url)) as NpmInfo;
    }
    const data = adapterCache[adapter];

    let version = null;
    if (data?.['dist-tags']) {
        version = semver.valid(data['dist-tags'].latest);

        // If this version is alfa
        if (version?.includes('-')) {
            // find first non-alfa version
            const versions = Object.keys(data.time).filter(
                v => !v && !v.includes('-') && v !== 'created' && v !== 'modified',
            );
            versions.sort((a, b) => semver.compare(a, b));
            version = semver.valid(versions.pop() || '');
        }

        if (!version) {
            console.error(`Cannot find latest version for ${adapter}: ${JSON.stringify(data)}`);
        }
        if (DEBUG) {
            console.log(`Latest version for ${adapter}: ${version}`);
        }
    }
    return version;
}

export async function readNpmStats(
    sources: Record<string, RepoAdapterObject>,
): Promise<Record<string, RepoAdapterObject>> {
    if (FAST_TEST) {
        return sources;
    }

    for (const adapter in sources) {
        if (sources[adapter].weekDownloads === undefined && !adapter.startsWith('_')) {
            if (DEBUG) {
                console.log(`Get npm stats for ${adapter}`);
            }
            try {
                const response = await axios(`https://api.npmjs.org/downloads/point/last-week/iobroker.${adapter}`, {
                    validateStatus: status => status < 400,
                    timeout: DEFAULT_TIMEOUT,
                    headers: {
                        'User-Agent': 'ioBroker.repositories',
                    },
                });
                if (response.data && response.data.downloads !== undefined) {
                    sources[adapter].weekDownloads = response.data.downloads;
                }
            } catch (error) {
                console.error(
                    `Status code is not 200: ${error.response ? error.response.data : error.message || error.code}`,
                );
            }
            sources[adapter].weekDownloads = sources[adapter].weekDownloads || 0;
        }
    }
    return sources;
}

export async function updatePublished(
    adapter: string,
    latestEntry: RepoAdapterObject,
    stableEntry: RepoAdapterObject | undefined,
): Promise<void> {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        try {
            adapterCache[adapter] = (await readUrl(url)) as NpmInfo;
        } catch (error) {
            adapterCache[adapter] = null;
            console.error(`${adapter} cannot read published date from npm: ${error}`);
            throw error;
        }
    }
    const data = adapterCache[adapter];

    if (!data) {
        console.error(`${adapter} cannot read published date from npm`);
        throw new Error('Cannot read published date from npm');
    }
    const time = data.time;
    let latestVersion;
    if (!data['dist-tags'] || !data['dist-tags'].latest) {
        const versions = Object.keys(time).filter(v => v !== 'created' && v !== 'modified');
        versions.sort((a, b) => {
            if (time[a] === time[b]) {
                return 0;
            }
            if (time[a] > time[b]) {
                return 1;
            }
            return -1;
        });
        latestVersion = versions.pop();
    } else {
        latestVersion = data['dist-tags'].latest;
    }

    latestEntry.published = time.created;
    // latestEntry.version = latestVersion;
    // cannot take modified, because if some settings change on npm (e.g., owner) the modified date changed too
    // latestEntry.versionDate = time.modified;

    if (latestVersion) {
        latestEntry.versionDate = time[latestVersion];
        latestEntry.version = latestVersion;
    } else {
        console.error(`Cannot find latest version for ${adapter}: ${JSON.stringify(data)}`);
    }

    if (stableEntry) {
        stableEntry.published = time.created;
        stableEntry.versionDate = time[stableEntry.version];
    }
    if (stableEntry && DEBUG) {
        console.log(`${adapter} - ${stableEntry.published}`);
        console.log(`${adapter} created stable[${stableEntry.version}] - ${stableEntry.versionDate}`);
    }
    if (DEBUG) {
        console.log(`${adapter} created latest[${latestVersion}] - ${latestEntry.versionDate}`);
    }
}

async function readUrlBinary(url: string): Promise<Buffer> {
    if (DEBUG) {
        console.log(`readUrlBinary ${url}`);
    }

    try {
        const response = await axios(url, {
            timeout: DEFAULT_TIMEOUT,
            responseType: 'arraybuffer',
            validateStatus: status => status < 400,
        });
        return response.data;
    } catch (error) {
        console.error(`Status code is not 200: ${error.response ? error.response.data : error.message || error.code}`);
        throw new Error(error.response ? error.response.data : error.message || error.code);
    }
}

export async function readNpmIoPack(
    name: string,
    version: string,
): Promise<{ 'io-package.json': ioBroker.AdapterObject; 'package.json': Record<string, any> }> {
    // https://registry.npmjs.org/iobroker.admin/-/iobroker.admin-4.0.5.tgz
    const data = await readUrlBinary(`https://registry.npmjs.org/iobroker.${name}/-/iobroker.${name}-${version}.tgz`);
    return extractPackageFiles(data);
}
