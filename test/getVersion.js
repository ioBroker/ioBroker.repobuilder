const { getNpmVersion } = require('../lib/npm');
process.env.DEBUG = 'true';
getNpmVersion('jarvis').then(version => console.log(version));
