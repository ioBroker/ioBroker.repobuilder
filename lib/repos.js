"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readReposFromS3 = readReposFromS3;
exports.writeReposToS3 = writeReposToS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../config");
const FAST_TEST = process.env.FAST_TEST === 'true';
const BUCKET = 'repos-iob';
const COMMUNITY_FOLDER = 'community';
const STABLE_FILE = 'sources-dist-stable.json';
const s3 = new client_s3_1.S3Client({
    region: config_1.config.aws_region,
    credentials: {
        accessKeyId: config_1.config.aws_accessKeyId,
        secretAccessKey: config_1.config.aws_secretAccessKey,
    },
});
async function readReposFromS3(tenant, fileName) {
    tenant = tenant || COMMUNITY_FOLDER;
    const params = {
        Bucket: BUCKET,
        Key: `${tenant}/${fileName || STABLE_FILE}`,
    };
    try {
        const command = new client_s3_1.GetObjectCommand(params);
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        let file = await response.Body?.transformToString('utf8');
        if (file && !file.startsWith('<?xml')) {
            try {
                return JSON.parse(file);
            }
            catch {
                file && console.error('Cannot parse hashes');
            }
        }
    }
    catch (err) {
        console.error(err);
    }
    return {};
}
async function writeReposToS3(tenant, fileName, json) {
    tenant = tenant || COMMUNITY_FOLDER;
    fileName = fileName || STABLE_FILE;
    const command = new client_s3_1.PutObjectCommand({
        Body: typeof json === 'object' ? JSON.stringify(json) : json,
        Bucket: BUCKET,
        Key: `${tenant}/${fileName}`,
        ContentEncoding: 'utf8',
        ContentType: 'application/json; charset=utf-8',
    });
    try {
        if (FAST_TEST) {
            return;
        }
        await s3.send(command);
    }
    catch (err) {
        console.error(err);
    }
}
//# sourceMappingURL=repos.js.map