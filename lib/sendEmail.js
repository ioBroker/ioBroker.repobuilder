"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendProblemEmail = sendProblemEmail;
exports.sendInfoEmail = sendInfoEmail;
const node_fs_1 = require("node:fs");
const client_ses_1 = require("@aws-sdk/client-ses");
const config_1 = require("../config");
const EMAIL = config_1.config.email;
function generateEmailBody(pattern, durationOrText) {
    let text = (0, node_fs_1.readFileSync)(`${__dirname}/../emails/${pattern}`).toString();
    text = text.replace(/@duration@/g, durationOrText);
    text = text.replace(/@text@/g, durationOrText);
    return text;
}
async function sendEmail(target, body) {
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
        Source: config_1.config.sourceEmail /* required */,
        ReplyToAddresses: [config_1.config.replyEmail],
    };
    const command = new client_ses_1.SendEmailCommand(params);
    const client = new client_ses_1.SESClient({
        region: config_1.config.aws_region,
        credentials: {
            accessKeyId: config_1.config.aws_accessKeyId,
            secretAccessKey: config_1.config.aws_secretAccessKey,
        },
    });
    await client.send(command);
}
function sendProblemEmail(minutes) {
    return sendEmail(EMAIL, generateEmailBody('emailRepoProblem.html', minutes.toString()));
}
function sendInfoEmail(text) {
    return sendEmail(EMAIL, generateEmailBody('emailRepoInfo.html', text));
}
//# sourceMappingURL=sendEmail.js.map