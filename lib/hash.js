"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHash = getHash;
const node_crypto_1 = require("node:crypto");
function getHash(data) {
    return (0, node_crypto_1.createHash)('md5').update(data).digest('hex');
}
//# sourceMappingURL=hash.js.map