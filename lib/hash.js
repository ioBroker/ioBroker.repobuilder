'use strict';
const crypto = require('node:crypto');

function getHash(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

module.exports = getHash;
