const config = require("./config").getConfig();
const Jenkins = require("./jenkins");

module.exports = new Jenkins(config.ciOpenApiUrl);
