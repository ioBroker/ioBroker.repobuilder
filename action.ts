import { post } from './index';

post({ body: '{"commits": [{"modified": ["sources-dist.json"]}]}' }).then((response: any) => {
    console.log(JSON.stringify(response));
});
