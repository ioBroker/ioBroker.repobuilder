import { Parser as TarParser } from 'tar';
import { PassThrough , Transform } from 'node:stream';

class CollectStream extends Transform {
    private chunks: Buffer[] = [];

    collect(): Buffer {
        const result: Buffer[] = this.chunks;
        this.chunks = [];
        return Buffer.concat(result);
    };

    _transform(chunk: Buffer, enc: any, cb: () => void): void {
        this.chunks.push(chunk);
        cb();
    };
}

export function extractPackageFiles(data: Buffer): Promise<{ 'io-package.json': ioBroker.AdapterObject; 'package.json': Record<string, any> }> {
    const files = {
        'package/io-package.json': new CollectStream(),
        'package/package.json': new CollectStream(),
    };

    return new Promise(
        (
            resolve: (result: {
                'io-package.json': ioBroker.AdapterObject;
                'package.json': Record<string, any>;
            }) => void,
            reject: (error: Error) => void,
        ): void => {
            const parser = new TarParser({
                strict: true,
                filter: currentPath =>
                    currentPath === 'package/io-package.json' || currentPath === 'package/package.json',
                onReadEntry: entry => entry.pipe(files[entry.path as keyof typeof files]),
            });
            const stream = new PassThrough();
            stream.end(data);

            stream
                .pipe(parser)
                .on('end', () => {
                    const result: { 'io-package.json': ioBroker.AdapterObject; 'package.json': Record<string, any> } = {
                        'io-package.json': JSON.parse(
                            files['package/io-package.json'].collect().toString('utf8') || '{}',
                        ) as ioBroker.AdapterObject,
                        'package.json': JSON.parse(files['package/package.json'].collect().toString('utf8') || '{}'),
                    };

                    resolve(result);
                })
                .on('error', reject);
        },
    );
}
