"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
(0, index_1.post)({ body: '{"commits": [{"modified": ["sources-dist.json"]}]}' }).then((response) => {
    console.log(JSON.stringify(response));
});
//# sourceMappingURL=action.js.map