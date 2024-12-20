const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const config = require('../config.js');

const EMAIL = config.email;

function generateEmailBody(pattern, durationOrText) {
    let text = fs.readFileSync(`${__dirname}/../emails/${pattern}`).toString();
    text = text.replace(/@duration@/g, durationOrText);
    text = text.replace(/@text@/g, durationOrText);
    return text;
}

function sendEmail(target, body) {
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

    return client.send(command);
}

function sendProblemEmail(minutes) {
    return sendEmail(EMAIL, generateEmailBody('emailRepoProblem.html', minutes));
}

function sendInfoEmail(text) {
    return sendEmail(EMAIL, generateEmailBody('emailRepoInfo.html', text));
}

module.exports = {
    sendProblemEmail,
    sendInfoEmail,
};
