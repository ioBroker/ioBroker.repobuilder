// this file build the configuration depends on if the config.json file exists or ENVIRONMENT VARIABLES are set
const fs = require('node:fs');

if (fs.existsSync(`${__dirname}/config.json`)) {
    module.exports = require(`${__dirname}/config.json`);
} else {
    module.exports = {
        "aws_region": process.env.GITHUB_ACTIONS_AWS_REGION,
        "aws_accessKeyId": process.env.GITHUB_ACTIONS_AWS_ACCESS_KEY_ID,
        "aws_secretAccessKey": process.env.GITHUB_ACTIONS_AWS_SECRET_ACCESS_KEY,
        "usageStatisticsURL": process.env.GITHUB_ACTIONS_USAGE_STATISTICS_URL,
        "generateMapURL": process.env.GITHUB_ACTIONS_GENERATE_MAP_URL,
        "forumStatisticsURL": process.env.GITHUB_ACTIONS_FORUM_STATISTICS_URL,
        "sftpConfig_host": process.env.GITHUB_ACTIONS_SFPT_HOST,
        "sftpConfig_port": process.env.GITHUB_ACTIONS_SFPT_PORT,
        "sftpConfig_username": process.env.GITHUB_ACTIONS_SFTP_USERNAME,
        "sftpConfig_password": process.env.GITHUB_ACTIONS_SFTP_PASSWORD,
        "email": process.env.GITHUB_ACTIONS_EMAIL,
        "sourceEmail": process.env.GITHUB_ACTIONS_SOURCE_EMAIL,
        "replyEmail": process.env.GITHUB_ACTIONS_REPLY_EMAIL,
    };
}
