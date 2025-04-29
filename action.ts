import { post } from './index';

void post({ body: '{"commits": [{"modified": ["sources-dist.json"]}]}' }).then((response: any) => {
    console.log(JSON.stringify(response));
});
