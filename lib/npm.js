"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNpmVersions = getNpmVersions;
exports.getNpmVersion = getNpmVersion;
exports.readNpmStats = readNpmStats;
exports.updatePublished = updatePublished;
exports.readNpmIoPack = readNpmIoPack;
const semver_1 = __importDefault(require("semver"));
const axios_1 = __importDefault(require("axios"));
const readUrl_1 = require("./readUrl");
const extract_1 = require("./extract");
const DEBUG = process.env.DEBUG === 'true';
const FAST_TEST = process.env.FAST_TEST === 'true';
const DEFAULT_TIMEOUT = 20000;
const adapterCache = {};
async function getNpmVersions(adapter) {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        adapterCache[adapter] = (await (0, readUrl_1.readUrl)(url));
    }
    if (adapterCache[adapter]) {
        return adapterCache[adapter].time ? adapterCache[adapter] && Object.keys(adapterCache[adapter].time) : null;
    }
    return null;
}
/**
 * Reads an adapter's npm version
 *
 * @param adapter The adapter to read the npm version from. Null for the root ioBroker packet
 * @return The version of the adapter or null if the version could not be read
 */
async function getNpmVersion(adapter) {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    let data;
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        adapterCache[adapter] = (await (0, readUrl_1.readUrl)(url));
    }
    data = adapterCache[adapter];
    let version = null;
    if (data?.['dist-tags']) {
        version = semver_1.default.valid(data['dist-tags'].latest);
        // If this version is alfa
        if (version?.includes('-')) {
            // find first non-alfa version
            const versions = Object.keys(data.time).filter(v => !v && !v.includes('-') && v !== 'created' && v !== 'modified');
            versions.sort((a, b) => semver_1.default.compare(a, b));
            version = semver_1.default.valid(versions.pop() || '');
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
async function readNpmStats(sources) {
    if (FAST_TEST) {
        return sources;
    }
    for (const adapter in sources) {
        if (sources[adapter].weekDownloads === undefined && !adapter.startsWith('_')) {
            if (DEBUG) {
                console.log(`Get npm stats for ${adapter}`);
            }
            try {
                const response = await (0, axios_1.default)(`https://api.npmjs.org/downloads/point/last-week/iobroker.${adapter}`, {
                    validateStatus: status => status < 400,
                    timeout: DEFAULT_TIMEOUT,
                    headers: {
                        'User-Agent': 'ioBroker.repositories',
                    },
                });
                if (response.data && response.data.downloads !== undefined) {
                    sources[adapter].weekDownloads = response.data.downloads;
                }
            }
            catch (error) {
                console.error(`Status code is not 200: ${error.response ? error.response.data : error.message || error.code}`);
            }
            sources[adapter].weekDownloads = sources[adapter].weekDownloads || 0;
        }
    }
    return sources;
}
async function updatePublished(adapter, latestEntry, stableEntry) {
    adapter = adapter ? `iobroker.${adapter}` : 'iobroker';
    adapter = adapter.toLowerCase();
    if (adapterCache[adapter] === undefined) {
        const url = `https://registry.npmjs.org/${adapter}`;
        try {
            adapterCache[adapter] = (await (0, readUrl_1.readUrl)(url));
        }
        catch (error) {
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
    }
    else {
        latestVersion = data['dist-tags'].latest;
    }
    latestEntry.published = time.created;
    // latestEntry.version = latestVersion;
    // cannot take modified, because if some settings change on npm (e.g., owner) the modified date changed too
    // latestEntry.versionDate = time.modified;
    if (latestVersion) {
        latestEntry.versionDate = time[latestVersion];
        latestEntry.version = latestVersion;
    }
    else {
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
async function readUrlBinary(url) {
    if (DEBUG) {
        console.log(`readUrlBinary ${url}`);
    }
    try {
        const response = await (0, axios_1.default)(url, {
            timeout: DEFAULT_TIMEOUT,
            responseType: 'arraybuffer',
            validateStatus: status => status < 400,
        });
        return response.data;
    }
    catch (error) {
        console.error(`Status code is not 200: ${error.response ? error.response.data : error.message || error.code}`);
        throw new Error(error.response ? error.response.data : error.message || error.code);
    }
}
async function readNpmIoPack(name, version) {
    // https://registry.npmjs.org/iobroker.admin/-/iobroker.admin-4.0.5.tgz
    const data = await readUrlBinary(`https://registry.npmjs.org/iobroker.${name}/-/iobroker.${name}-${version}.tgz`);
    return (0, extract_1.extractPackageFiles)(data);
}
//# sourceMappingURL=npm.js.map