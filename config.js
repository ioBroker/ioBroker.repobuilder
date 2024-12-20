"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
// this file build the configuration depends on if the config.json file exists or ENVIRONMENT VARIABLES are set
const node_fs_1 = require("node:fs");
let config;
if ((0, node_fs_1.existsSync)(`${__dirname}/config.json`)) {
    exports.config = config = JSON.parse((0, node_fs_1.readFileSync)(`${__dirname}/config.json`).toString('utf8'));
}
else {
    exports.config = config = {
        aws_region: process.env.VAR_ACTIONS_AWS_REGION || '',
        aws_accessKeyId: process.env.VAR_ACTIONS_AWS_ACCESS_KEY_ID || '',
        aws_secretAccessKey: process.env.VAR_ACTIONS_AWS_SECRET_ACCESS_KEY || '',
        usageStatisticsURL: process.env.VAR_ACTIONS_USAGE_STATISTICS_URL || '',
        generateMapURL: process.env.VAR_ACTIONS_GENERATE_MAP_URL || '',
        forumStatisticsURL: process.env.VAR_ACTIONS_FORUM_STATISTICS_URL || '',
        sftpConfig_host: process.env.VAR_ACTIONS_SFPT_HOST || '',
        sftpConfig_port: parseInt(process.env.VAR_ACTIONS_SFPT_PORT, 10) || 22,
        sftpConfig_username: process.env.VAR_ACTIONS_SFTP_USERNAME || '',
        sftpConfig_password: process.env.VAR_ACTIONS_SFTP_PASSWORD || '',
        email: process.env.VAR_ACTIONS_EMAIL || '',
        sourceEmail: process.env.VAR_ACTIONS_SOURCE_EMAIL || '',
        replyEmail: process.env.VAR_ACTIONS_REPLY_EMAIL || '',
    };
}
//# sourceMappingURL=config.js.map