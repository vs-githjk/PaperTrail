const neo4j = require("neo4j-driver");
const config = require("../config");

const neo4jDriver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
);

module.exports = { neo4jDriver };
