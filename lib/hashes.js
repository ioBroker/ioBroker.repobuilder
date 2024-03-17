'use strict';

const FAST_TEST     = process.env.FAST_TEST === 'true' || process.env.FAST_TEST === true;

const HASHES_BUCKET = 'repositoryhash';
const HASHES_FILE   = 'hashes.json';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config.js');

const s3 = new S3Client({
    region: config.aws_region,
    credentials: {
        accessKeyId: config.aws_accessKeyId,
        secretAccessKey: config.aws_secretAccessKey,
    },
});

async function readHashesFromS3() {
    const command = new GetObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
    });

    try {
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        let file = await response.Body.transformToString();
        console.log(`Read hashes: ${file.length}`);
        if (file.startsWith('<?xml')) {
            return {};
        }
        try {
            file = JSON.parse(file);
        } catch (e) {
            file && console.error('Cannot parse hashes');
            file = {};
        }
        return file;
    } catch (err) {
        console.error(err);
    }
}

async function writeHashesToS3(hashes) {
    const command = new PutObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
        Body: JSON.stringify(hashes),
    });

    try {
        if (FAST_TEST) {
            return command.Body;
        }
        await s3.send(command);
    } catch (err) {
        console.error(err);
    }
}

module.exports = {
    readHashesFromS3,
    writeHashesToS3,
};
