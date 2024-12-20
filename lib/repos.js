'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { config } = require('../config');

const FAST_TEST = process.env.FAST_TEST === 'true' || process.env.FAST_TEST === true;
const BUCKET = 'repos-iob';
const COMMUNITY_FOLDER = 'community';
const STABLE_FILE = 'sources-dist-stable.json';

const s3 = new S3Client({
    region: config.aws_region,
    credentials: {
        accessKeyId: config.aws_accessKeyId,
        secretAccessKey: config.aws_secretAccessKey,
    },
});

async function readReposFromS3(tenant, fileName) {
    tenant = tenant || COMMUNITY_FOLDER;

    const params = {
        Bucket: BUCKET,
        Key: `${tenant}/${fileName || STABLE_FILE}`,
    };

    try {
        const command = new GetObjectCommand(params);
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        let file = await response.Body.transformToString('utf8');
        if (file.startsWith('<?xml')) {
            return {};
        }
        try {
            file = JSON.parse(file);
        } catch {
            file && console.error('Cannot parse hashes');
            file = {};
        }
        return file;
    } catch (err) {
        console.error(err);
    }
}

async function writeReposToS3(tenant, fileName, json) {
    tenant = tenant || COMMUNITY_FOLDER;

    if (json === undefined) {
        json = fileName;
        fileName = '';
    }
    fileName = fileName || STABLE_FILE;
    const command = new PutObjectCommand({
        Body: typeof json === 'object' ? JSON.stringify(json) : json,
        Bucket: BUCKET,
        Key: `${tenant}/${fileName}`,
        ContentEncoding: 'utf8',
        ContentType: 'application/json; charset=utf-8',
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
    readReposFromS3,
    writeReposToS3,
};
