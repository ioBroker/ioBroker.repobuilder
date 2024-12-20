import axios, { type AxiosError} from "axios";
import { config }  from '../config';

export async function generateMap(): Promise<void> {
    try {
        await axios(config.generateMapURL, {
            validateStatus: (status: number): boolean => status < 400,
            timeout: 20000,
        });
    } catch (error) {
        console.warn(`Cannot generateMap: ${error.response ? error.response.data : error.message || error.code}`);
    }
}

export async function generateForumStats(): Promise<void> {
    try {
        await axios(config.forumStatisticsURL, {
            validateStatus: (status: number): boolean => status < 400,
            timeout: 20000,
        });
    } catch (error) {
        console.warn(
            `Cannot generateForumStats: ${error.response ? error.response.data : error.message || error.code}`);
    }
}
