const post = require('./index').handler;

post({ body: '{"commits": [{"modified": ["sources-dist.json"]}]}' })
    .then(response => {
        console.log(JSON.stringify(response));
    });
