"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPackageFiles = extractPackageFiles;
const tar_1 = require("tar");
const node_stream_1 = require("node:stream");
class CollectStream extends node_stream_1.Transform {
    chunks = [];
    collect() {
        const result = this.chunks;
        this.chunks = [];
        return Buffer.concat(result);
    }
    _transform(chunk, enc, cb) {
        this.chunks.push(chunk);
        cb();
    }
}
function extractPackageFiles(data) {
    const files = {
        'package/io-package.json': new CollectStream(),
        'package/package.json': new CollectStream(),
    };
    return new Promise((resolve, reject) => {
        const parser = new tar_1.Parser({
            strict: true,
            filter: currentPath => currentPath === 'package/io-package.json' || currentPath === 'package/package.json',
            onReadEntry: entry => entry.pipe(files[entry.path]),
        });
        const stream = new node_stream_1.PassThrough();
        stream.end(data);
        stream
            .pipe(parser)
            .on('end', () => {
            const result = {
                'io-package.json': JSON.parse(files['package/io-package.json'].collect().toString('utf8') || '{}'),
                'package.json': JSON.parse(files['package/package.json'].collect().toString('utf8') || '{}'),
            };
            resolve(result);
        })
            .on('error', reject);
    });
}
//# sourceMappingURL=extract.js.map