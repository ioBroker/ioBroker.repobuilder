'use strict';

const Stream = require('stream');
const getHash = require('./hash');
const Client = require('ssh2').Client;
const config = require('../config.js');

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === true;
const FAST_TEST = process.env.FAST_TEST === 'true' || process.env.FAST_TEST === true;

function writeSftp(sftp, fileName, data, cb) {
    const readStream = new Stream.PassThrough();

    readStream.end(Buffer.from(data));

    const writeStream = sftp.createWriteStream(fileName, { encoding: 'utf8' });

    writeStream.on('close', () => {
        DEBUG && console.log(`${new Date().toISOString()} ${fileName} - file transferred successfully`);
        readStream.end();
        if (cb) {
            cb();
            cb = null;
        }
    });

    writeStream.on('end', () => {
        DEBUG && console.log('sftp connection closed');
        readStream.close();
        if (cb) {
            cb();
            cb = null;
        }
    });

    // initiate transfer of file
    readStream.pipe(writeStream);
}

function uploadOneFile(fileName, data, hashes) {
    /*s3.putObject({
        Bucket: BUCKET_NAME,
        ContentType: 'application/json',
        Metadata: {
            'Content-Type': 'application/json; charset=utf-8'
        },
        Key: fileName,
        Body: data
    }, (err, obj) => {
        cb(err);
        console.log(`${key} done: ${obj && obj.ETag}`);
    });*/
    return new Promise((resolve, reject) => {
        const hash = getHash(data.toString('utf8'));
        if (hashes && hashes[fileName]) {
            if (hashes[fileName] === hash) {
                DEBUG && console.log(`DO NOT UPLOAD "${fileName}"`);
                return resolve();
            }
        }

        const conn = new Client();
        conn.on('ready', () => {
            conn.sftp((err, sftp) => {
                if (err) {
                    return reject(err);
                }

                if (FAST_TEST) {
                    console.log(`Simulate upload of ${fileName}`);
                    hashes[fileName] = hash;
                    return resolve();
                }

                // file must be deleted, because of if the new file is smaller, the rest of the old file will stay.
                checkAndDeleteIfExist(sftp, fileName, () =>
                    writeSftp(sftp, fileName, data, () => {
                        hashes[fileName] = hash;
                        sftp.end();
                        conn.end();
                        resolve();
                    }),
                );
            });
        }).connect({
            host: config.sftpConfig_host,
            port: config.sftpConfig_port,
            username: config.sftpConfig_username,
            password: config.sftpConfig_password,
        });
    });
}

function checkAndDeleteIfExist(sftp, fileName, cb) {
    sftp.exists(fileName, doExist => {
        if (doExist) {
            sftp.unlink(fileName, cb);
        } else {
            cb();
        }
    });
}

function uploadFiles(sftp, tasks, cb) {
    if (!tasks || !tasks.length) {
        return cb && cb();
    }
    const task = tasks.shift();

    if (FAST_TEST) {
        console.log(`Simulate upload of ${task.fileName}`);
        return setImmediate(() => uploadFiles(sftp, tasks, cb));
    }
    const readStream = new Stream.PassThrough();

    readStream.end(Buffer.from(task.data));

    checkAndDeleteIfExist(sftp, task.fileName, () => {
        const writeStream = sftp.createWriteStream(task.fileName, { encoding: 'utf8' });

        let done = false;

        writeStream.on('close', () => {
            DEBUG && console.log(`${new Date().toISOString()} ${task.fileName} - file transferred successfully`);
            readStream.end();
            if (!done) {
                setImmediate(() => uploadFiles(sftp, tasks, cb));
                done = true;
            }
        });

        writeStream.on('end', () => {
            DEBUG && console.log('sftp connection closed');
            readStream.close();
            if (!done) {
                setImmediate(() => uploadFiles(sftp, tasks, cb));
                done = true;
            }
        });

        // initiate transfer of file
        readStream.pipe(writeStream);
    });
}

module.exports = {
    uploadFiles,
    uploadOneFile,
};
