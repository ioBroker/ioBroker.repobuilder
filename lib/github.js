'use strict';

const axios = require('axios');
const { readUrl } = require('./readUrl');
const { getNpmVersion } = require('./npm');
const extend = require('extend');

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === true;
const FAST_TEST = process.env.FAST_TEST === 'true' || process.env.FAST_TEST === true;

async function checkVersion(source) {
    if (
        source.meta.substring(0, 'http://'.length) === 'http://' ||
        source.meta.substring(0, 'https://'.length) === 'https://'
    ) {
        try {
            return await getNpmVersion(source.name);
        } catch (err) {
            console.error(err);
            return 'npm error';
        }
    }
}

async function getIoPack(source) {
    let ioPack;
    try {
        ioPack = await readUrl(source.meta);
    } catch {
        // ignore
    }
    if (!ioPack) {
        return null;
    }
    const packUrl = source.meta.replace('io-package.json', 'package.json');
    let pack;
    try {
        pack = await readUrl(packUrl);
    } catch {
        // ignore
    }

    // validate the pack file
    if (!pack || !pack.version) {
        throw new Error(`package.json is invalid for ${source.name}`);
    }
    // validate the io-pack file
    if (!ioPack.common?.version || !ioPack.common.name || !ioPack.native) {
        throw new Error(`io-package.json is invalid for ${source.name}`);
    }

    // write into common the node requirements
    if (pack?.engines?.node) {
        ioPack.common.node = pack.engines.node;
    }
    const version = source.version;

    if (ioPack?.common) {
        // remember the type from repo
        const type = source.type;
        source = extend(true, source, ioPack.common);

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
            (source.licenseInformation.type === 'free' || source.licenseInformation.type === undefined)
        ) {
            delete source.licenseInformation;
        }
    }
    if (!version) {
        let v = await checkVersion(source);
        if (v) {
            source.version = v;
        } else {
            console.warn(`No version for ${source.name} found`);
            source.version = 'no meta';
        }
    }

    return source;
}

async function readGithubStats(sources) {
    const list = Object.keys(sources).filter(name => !name.startsWith('_'));

    if (FAST_TEST) {
        return;
    }
    let adapter;
    do {
        let index;
        adapter = null;
        // get the random adapter that does not have stars
        do {
            index = Math.round(Math.random() * (list.length - 1));
            if (sources[list[index]].stars === undefined) {
                adapter = list[index];
                break;
            }
        } while (list.find(adr => sources[adr].stars === undefined));

        if (adapter) {
            let timeout = 0;
            if (DEBUG) {
                console.log(`Get GitHub stats for ${adapter}`);
            }
            try {
                const data = await axios(`https://api.github.com/search/repositories?q=ioBroker.${adapter}`, {
                    timeout: 15000,
                    validateStatus: status => status < 400,
                    headers: {
                        'User-Agent': 'ioBroker.repositories',
                        Authentication: `Basic ${Buffer.from('GermanBluefox').toString('base64')}`,
                    },
                });
                if (data?.items?.length && data.items[0]) {
                    sources[adapter].stars = data.items[0].watchers_count || 0;
                    sources[adapter].issues = data.items[0].open_issues || 0;
                    sources[adapter].score = data.items[0].score || 0;
                }
                if (data.headers['x-ratelimit-remaining'] === '0') {
                    timeout = data.headers['x-ratelimit-reset'] * 1000 - Date.now();
                    DEBUG && console.log(`GitHub rate limit exceeded. Wait for ${timeout}ms`);
                }
            } catch (error) {
                if (error.response && error.response.status === 403) {
                    timeout = error.response.headers['x-ratelimit-reset'] * 1000 - Date.now();
                    DEBUG && console.log(`GitHub rate limit exceeded. Wait for ${timeout}ms`);
                }
                console.error(`Cannot get answer for ${adapter}: ${error.toString()}`);
            }
            sources[adapter].stars = sources[adapter].stars || -1;
            if (timeout > 30000) {
                DEBUG && console.log(`GitHub rate limit exceeded. Abort because of too long reset time`);
                Object.keys(sources).forEach(adr => (sources[adr].stars = sources[adr].stars || -1));
                // terminate if timeout is too long
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeout || 100));
        }
    } while (adapter);
}

/**
 * Extract the license from io-package or package.json
 *
 * @param {{ ioPackJson: Record<string, any>, packJson: Record<string, any> }} options io-package.json and package.json contents
 * @return {{ license: string, link?: string, type?: string }}
 */
function extractLicenseInfo(options) {
    const { ioPackJson, packJson } = options;
    if (ioPackJson.common.licenseInformation) {
        return ioPackJson.common.licenseInformation;
    }

    if (packJson.license) {
        return { license: packJson.license };
    }

    // hint: pack.licenses is deprecated https://docs.npmjs.com/cli/v10/configuring-npm/package-json#license
    if (packJson.licenses?.length) {
        return { license: packJson.licenses[0].type, link: packJson.licenses[0].url };
    }

    if (ioPackJson.common.license) {
        return { license: ioPackJson.common.license };
    }

    return { license: '' };
}

module.exports = {
    getIoPack,
    readGithubStats,
};
