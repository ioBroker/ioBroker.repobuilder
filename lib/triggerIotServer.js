"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMap = generateMap;
exports.generateForumStats = generateForumStats;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../config");
async function generateMap() {
    try {
        await (0, axios_1.default)(config_1.config.generateMapURL, {
            validateStatus: (status) => status < 400,
            timeout: 20000,
        });
    }
    catch (error) {
        console.warn(`Cannot generateMap: ${error.response ? error.response.data : error.message || error.code}`);
    }
}
async function generateForumStats() {
    try {
        await (0, axios_1.default)(config_1.config.forumStatisticsURL, {
            validateStatus: (status) => status < 400,
            timeout: 20000,
        });
    }
    catch (error) {
        console.warn(`Cannot generateForumStats: ${error.response ? error.response.data : error.message || error.code}`);
    }
}
//# sourceMappingURL=triggerIotServer.js.map