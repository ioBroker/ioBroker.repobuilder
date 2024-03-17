'use strict';

const util = require('node:util');
const TarParser = require('tar').Parse;
const stream = require('node:stream');
const PassThroughStream = stream.PassThrough;

function CollectStream() {
    stream.Transform.call(this);
    this._chunks = [];
    this._transform = (chunk, enc, cb) => { this._chunks.push(chunk); cb(); };
    this.collect = () => {
        const result = this._chunks;
        this._chunks = [];
        return Buffer.concat(result);
    };
}
util.inherits(CollectStream, stream.Transform);

function extract(data) {
    const files = {
        'package/io-package.json': new CollectStream(),
        'package/package.json':    new CollectStream(),
    };

    return new Promise((resolve, reject) => {
        const parser = new TarParser({
            strict: true,
            filter: currentPath => currentPath === 'package/io-package.json' || currentPath === 'package/package.json',
            onentry: entry => entry.pipe(files[entry.path]),
        });
        const stream = new PassThroughStream();
        stream.end(data);

        stream.pipe(parser)
            .on('end', () => {
                const result = {
                    'io-package.json': JSON.parse(files['package/io-package.json'].collect().toString('utf8') || '{}'),
                    'package.json':    JSON.parse(files['package/package.json']   .collect().toString('utf8') || '{}'),
                };

                resolve(result);
            })
            .on('error', reject);
    });
}

module.exports = extract;
