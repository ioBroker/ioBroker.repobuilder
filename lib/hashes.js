"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readHashesFromS3 = readHashesFromS3;
exports.writeHashesToS3 = writeHashesToS3;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../config");
const FAST_TEST = process.env.FAST_TEST === 'true';
const HASHES_BUCKET = 'repositoryhash';
const HASHES_FILE = 'hashes.json';
const s3 = new client_s3_1.S3Client({
    region: config_1.config.aws_region,
    credentials: {
        accessKeyId: config_1.config.aws_accessKeyId,
        secretAccessKey: config_1.config.aws_secretAccessKey,
    },
});
async function readHashesFromS3() {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
    });
    try {
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        const file = await response.Body?.transformToString();
        console.log(`Read hashes: ${file?.length}`);
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
async function writeHashesToS3(hashes) {
    const command = new client_s3_1.PutObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
        Body: JSON.stringify(hashes),
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
//# sourceMappingURL=hashes.js.map