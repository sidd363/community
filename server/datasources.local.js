var mongoSettings = global.config.mongo;
module.exports = {
  db: {
    name: 'db',
    connector: 'memory'
  },
  transient: {
    "name": "transient",
    "connector": "transient"
  },
  mongodb: mongoSettings
}
