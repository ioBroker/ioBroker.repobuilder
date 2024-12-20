import { readFileSync } from 'node:fs';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config';

const EMAIL = config.email;

function generateEmailBody(pattern: string, durationOrText: string): string {
    let text = readFileSync(`${__dirname}/../emails/${pattern}`).toString();
    text = text.replace(/@duration@/g, durationOrText);
    text = text.replace(/@text@/g, durationOrText);
    return text;
}

async function sendEmail(target: string, body: string): Promise<void> {
    // Create sendEmail params
    const params = {
        Destination: {
            ToAddresses: [target],
        },
        Message: {
            /* required */
            Body: {
                /* required */
                Html: {
                    Charset: 'UTF-8',
                    Data: body,
                },
                Text: {
                    Charset: 'UTF-8',
                    Data: body,
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: 'Repo build problem',
            },
        },
        Source: config.sourceEmail /* required */,
        ReplyToAddresses: [config.replyEmail],
    };
    const command = new SendEmailCommand(params);

    const client = new SESClient({
        region: config.aws_region,
        credentials: {
            accessKeyId: config.aws_accessKeyId,
            secretAccessKey: config.aws_secretAccessKey,
        },
    });

    await client.send(command);
}

export function sendProblemEmail(minutes: string | number): Promise<void> {
    return sendEmail(EMAIL, generateEmailBody('emailRepoProblem.html', minutes.toString()));
}

export function sendInfoEmail(text: string): Promise<void> {
    return sendEmail(EMAIL, generateEmailBody('emailRepoInfo.html', text));
}
