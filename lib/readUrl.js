"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readUrl = readUrl;
const axios_1 = __importDefault(require("axios"));
const DEBUG = process.env.DEBUG === 'true';
const DEFAULT_TIMEOUT = 10000;
async function readUrl(url, auth) {
    let count = 0;
    if (DEBUG) {
        console.log(`Request ${url}`);
    }
    let headers;
    if (auth?.username && auth.password) {
        headers = {
            Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
        };
    }
    do {
        try {
            const response = await (0, axios_1.default)(url, {
                headers,
                timeout: DEFAULT_TIMEOUT,
                validateStatus: status => status < 400,
            });
            return response.data || null;
        }
        catch (error) {
            if ((error.code === 'ECONNABORTED' || error.code === 'ESOCKETTIMEDOUT') && count < 5) {
                count++;
            }
            else {
                console.error(`Status code is not 200: ${error.response ? error.response.data : error.message || error.code}`);
                // Error
                throw new Error(error.response ? error.response.data : error.message || error.code);
            }
        }
    } while (count < 5);
    throw new Error(`Cannot read data "${url}"`);
}
//# sourceMappingURL=readUrl.js.map