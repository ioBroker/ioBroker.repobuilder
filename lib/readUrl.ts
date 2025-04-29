import axios, { type AxiosError } from 'axios';
import type { Message } from '../types';

const DEBUG = process.env.DEBUG === 'true';
const DEFAULT_TIMEOUT = 10000;

export async function readUrl(
    url: string,
    auth?: { username: string; password: string },
): Promise<Record<string, any> | Message[]> {
    let count = 0;
    if (DEBUG) {
        console.log(`Request ${url}`);
    }

    let headers;
    if (auth?.username && auth.password) {
        headers = {
            Authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
        };
    }

    do {
        try {
            const response = await axios(url, {
                headers,
                timeout: DEFAULT_TIMEOUT,
                validateStatus: (status: number): boolean => status < 400,
            });
            return response.data || null;
        } catch (error) {
            if ((error.code === 'ECONNABORTED' || error.code === 'ESOCKETTIMEDOUT') && count < 5) {
                count++;
            } else {
                console.error(
                    `Status code is not 200 (${(error as AxiosError).status}): ${JSON.stringify((error as AxiosError).response?.data || (error as AxiosError).message || (error as AxiosError).code)}`,
                );
                // Error
                throw new Error(error.response ? error.response.data : error.message || error.code);
            }
        }
    } while (count < 5);

    throw new Error(`Cannot read data "${url}"`);
}
