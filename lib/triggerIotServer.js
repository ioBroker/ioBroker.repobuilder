'use strict';

const axios = require('axios');
const config = require('../config.js');

function generateMap() {
    return axios(config.generateMapURL, {
        validateStatus: status => status < 400,
        timeout: 20000,
    })
        .then(response => {
            // done
            return response.data; // will be ignored
        })
        .catch(error =>
            console.warn(`Cannot generateMap: ${error.response ? error.response.data : error.message || error.code}`),
        );
}

function generateForumStats() {
    return axios(config.forumStatisticsURL, {
        validateStatus: status => status < 400,
        timeout: 20000,
    })
        .then(response => {
            // done
            return response.data; // will be ignored
        })
        .catch(error =>
            console.warn(
                `Cannot generateForumStats: ${error.response ? error.response.data : error.message || error.code}`,
            ),
        );
}

module.exports = {
    generateForumStats,
    generateMap,
};
