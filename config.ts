// this file build the configuration depends on if the config.json file exists or ENVIRONMENT VARIABLES are set
import { existsSync, readFileSync } from 'node:fs';
import type { Config } from './types';

let config: Config;

if (existsSync(`${__dirname}/config.json`)) {
    config = JSON.parse(readFileSync(`${__dirname}/config.json`).toString('utf8')) as Config;
} else {
    config = {
        aws_region: process.env.VAR_ACTIONS_AWS_REGION || '',
        aws_accessKeyId: process.env.VAR_ACTIONS_AWS_ACCESS_KEY_ID || '',
        aws_secretAccessKey: process.env.VAR_ACTIONS_AWS_SECRET_ACCESS_KEY || '',
        usageStatisticsURL: process.env.VAR_ACTIONS_USAGE_STATISTICS_URL || '',
        generateMapURL: process.env.VAR_ACTIONS_GENERATE_MAP_URL || '',
        forumStatisticsURL: process.env.VAR_ACTIONS_FORUM_STATISTICS_URL || '',
        sftpConfig_host: process.env.VAR_ACTIONS_SFPT_HOST || '',
        sftpConfig_port: parseInt(process.env.VAR_ACTIONS_SFPT_PORT as string, 10) || 22,
        sftpConfig_username: process.env.VAR_ACTIONS_SFTP_USERNAME || '',
        sftpConfig_password: process.env.VAR_ACTIONS_SFTP_PASSWORD || '',
        email: process.env.VAR_ACTIONS_EMAIL || '',
        sourceEmail: process.env.VAR_ACTIONS_SOURCE_EMAIL || '',
        replyEmail: process.env.VAR_ACTIONS_REPLY_EMAIL || '',
    };
}
export { config };
