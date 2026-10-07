const core = require("./core");
const commerce = require("./commerce");
const ops = require("./ops");
const farm = require("./farm");

module.exports = { ...core, ...commerce, ...ops, ...farm };
