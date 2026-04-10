const { Pool } = require("pg");
const config = require("../config");

const pgPool = new Pool(config.postgres);

module.exports = { pgPool };
