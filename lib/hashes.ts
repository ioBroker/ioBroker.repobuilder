import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

const FAST_TEST = process.env.FAST_TEST === 'true';

const HASHES_BUCKET = 'repositoryhash';
const HASHES_FILE = 'hashes.json';

const s3 = new S3Client({
    region: config.aws_region,
    credentials: {
        accessKeyId: config.aws_accessKeyId,
        secretAccessKey: config.aws_secretAccessKey,
    },
});

export async function readHashesFromS3(): Promise<Record<string, string>> {
    const command = new GetObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
    });

    try {
        const response = await s3.send(command);
        // The Body object also has 'transformToByteArray' and 'transformToWebStream' methods.
        let file = await response.Body?.transformToString();
        console.log(`Read hashes: ${file?.length}`);
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

export async function writeHashesToS3(hashes: Record<string, string>): Promise<void> {
    const command = new PutObjectCommand({
        Bucket: HASHES_BUCKET,
        Key: HASHES_FILE,
        Body: JSON.stringify(hashes),
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
