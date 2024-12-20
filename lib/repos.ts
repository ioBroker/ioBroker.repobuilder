import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import {RepoAdapterObject} from "../types";

const FAST_TEST = process.env.FAST_TEST === 'true';
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

export async function readReposFromS3(tenant: string | null, fileName?: string): Promise<Record<string, RepoAdapterObject>> {
    tenant = tenant || COMMUNITY_FOLDER;

    const params = {
        Bucket: BUCKET,
        Key: `${tenant}/${fileName || STABLE_FILE}`,
    };

    try {
        const command = new GetObjectCommand(params);
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        let file = await response.Body?.transformToString('utf8');
        if (file && !file.startsWith('<?xml')) {
            try {
                return JSON.parse(file);
            } catch {
                file && console.error('Cannot parse hashes');
            }
        }
    } catch (err) {
        console.error(err);
    }
    return {};
}

export async function writeReposToS3(tenant: string | null, fileName: string, json: string | Record<string, RepoAdapterObject>): Promise<void> {
    tenant = tenant || COMMUNITY_FOLDER;

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
            return;
        }
        await s3.send(command);
    } catch (err) {
        console.error(err);
    }
}
