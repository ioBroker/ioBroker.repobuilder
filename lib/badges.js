"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStableBadges = generateStableBadges;
exports.generateCountBadges = generateCountBadges;
const axios_1 = __importDefault(require("axios"));
const hash_1 = require("./hash");
const ssh2_1 = require("ssh2");
const sftp_1 = require("./sftp");
const config_1 = require("../config");
const DEBUG = process.env.DEBUG === 'true';
function convertNumber(number) {
    if (number < 1000) {
        return number.toString();
    }
    if (number < 1000000) {
        return `${(Math.floor(number / 100) / 10).toFixed(1)}k`;
    }
    return `${Math.floor(number / 1000000)}M`;
}
const stableBadgesPattern = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="20">
    <linearGradient id="b" x2="0" y2="100%">
        <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
        <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
    <clipPath id="a">
        <rect width="100" height="20" rx="3" fill="#fff"/>
    </clipPath>
    <g clip-path="url(#a)">
        <path fill="#555" d="M0 0h50v20H0z"/>
        <path fill="#164477" d="M50 0h50v20H50z"/>
        <path fill="url(#b)" d="M0 0h100v20H0z"/>
    </g>
    <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
        <text x="250" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="350">stable</text>
        <text x="250" y="140" transform="scale(.1)" textLength="350">stable</text>
        <text x="720" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="350">v{version}</text>
        <text x="720" y="140" transform="scale(.1)" textLength="350">v{version}</text>
    </g>
</svg>`;
function generateStableBadges(repoJson, latestJson, hashes) {
    if (!config_1.config.sftpConfig_host) {
        console.warn('No SFTP host defined. Cannot upload badges.');
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const newHashes = {};
        const tasks = Object.keys(repoJson)
            .map(adapter => {
            if (adapter.startsWith('_')) {
                return null;
            }
            const data = stableBadgesPattern.replace(/{version}/g, repoJson[adapter].version);
            const fileName = `/badges/${adapter.replace(/^ioBroker\./i, '')}-stable.svg`;
            const hash = (0, hash_1.getHash)(data);
            if (hashes && hashes[fileName] === hash) {
                DEBUG && console.log(`DO NOT UPLOAD "${fileName}"`);
                return null;
            }
            newHashes[fileName] = hash;
            return { fileName, data };
        })
            .filter(task => !!task);
        // create for all only the latest adapter
        Object.keys(latestJson).forEach(adapter => {
            if (adapter.startsWith('_') || repoJson[adapter]) {
                return null;
            }
            const data = stableBadgesPattern.replace(/{version}/g, '---');
            const fileName = `/badges/${adapter.replace(/^ioBroker\./i, '')}-stable.svg`;
            if (hashes && hashes[fileName]) {
                const hash = (0, hash_1.getHash)(data);
                if (hashes[fileName] === hash) {
                    return null;
                }
                newHashes[fileName] = hash;
            }
            tasks.push({ fileName, data });
        });
        const conn = new ssh2_1.Client();
        conn.on('ready', () => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                }
                else {
                    (0, sftp_1.uploadFiles)(sftp, tasks, () => {
                        // store new hashes only after successful write
                        hashes && Object.keys(newHashes).forEach(fileName => (hashes[fileName] = newHashes[fileName]));
                        sftp.end();
                        conn.end();
                        resolve();
                    });
                }
            });
        }).connect({
            host: config_1.config.sftpConfig_host,
            port: config_1.config.sftpConfig_port,
            username: config_1.config.sftpConfig_username,
            password: config_1.config.sftpConfig_password,
        });
    });
}
async function readStat() {
    try {
        const response = await (0, axios_1.default)(config_1.config.usageStatisticsURL, {
            timeout: 15000,
            validateStatus: (status) => status < 400,
        });
        return response.data;
    }
    catch (error) {
        console.warn(`Cannot readStat: ${error.response ? error.response.data : error.message || error.code}`);
        return null;
    }
}
async function generateCountBadges(hashes, stat) {
    try {
        stat = stat || (await readStat());
    }
    catch (error) {
        console.error(`No data from USAGE: ${JSON.stringify(error)}`);
        return;
    }
    if (stat?.adapters) {
        const newHashes = {};
        const tasks = Object.keys(stat.adapters)
            .map(adapter => {
            if (adapter.startsWith('_')) {
                return null;
            }
            const count = convertNumber(stat.adapters[adapter]).toString();
            const data = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="20">
<linearGradient id="b" x2="0" y2="100%">
<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
<stop offset="1" stop-opacity=".1"/>
</linearGradient>
<clipPath id="a">
<rect width="100" height="20" rx="3" fill="#fff">
    <title>${stat.adapters[adapter]}</title>
</rect>
</clipPath>
<g clip-path="url(#a)">
<path fill="#555" d="M0 0h60v20H0z"/>
<path fill="#3399cc" d="M60 0h40v20H60z"/>
<path fill="url(#b)" d="M0 0h100v20H0z"/>
</g>
<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
<text x="300" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="450">installed</text>
<text x="300" y="140" transform="scale(.1)" textLength="450">installed</text>
<text x="800" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${count.length * 70}">${count}</text>
<text x="800" y="140" transform="scale(.1)" textLength="${count.length * 70}">${count}</text>
</g>
</svg>`;
            const fileName = `/badges/${adapter.replace(/^ioBroker\./i, '')}-installed.svg`;
            const hash = (0, hash_1.getHash)(data);
            if (hashes && hashes[fileName] === hash) {
                DEBUG && console.log(`DO NOT UPLOAD "${fileName}"`);
                return null;
            }
            newHashes[fileName] = hash;
            return { fileName, data };
        })
            .filter(t => !!t);
        const conn = new ssh2_1.Client();
        if (!config_1.config.sftpConfig_host) {
            console.warn('No SFTP host defined. Cannot upload hashes.');
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => conn
            .on('ready', () => {
            conn.sftp((err, sftp) => {
                if (err) {
                    reject(err);
                }
                else {
                    (0, sftp_1.uploadFiles)(sftp, tasks, () => {
                        // store new hashes only after successful writing
                        hashes &&
                            Object.keys(newHashes).forEach(fileName => (hashes[fileName] = newHashes[fileName]));
                        sftp.end();
                        conn.end();
                        resolve();
                    });
                }
            });
        })
            .connect({
            host: config_1.config.sftpConfig_host,
            port: config_1.config.sftpConfig_port,
            username: config_1.config.sftpConfig_username,
            password: config_1.config.sftpConfig_password,
        }));
    }
    console.error(`No adapters found in USAGE: ${JSON.stringify(stat)}`);
}
//# sourceMappingURL=badges.js.map