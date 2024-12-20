import { createHash } from 'node:crypto';

export function getHash(data: string): string {
    return createHash('md5').update(data).digest('hex');
}
