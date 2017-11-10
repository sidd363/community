//
// Common script to setup elasticsearch and search on it.
//
var elasticsearch = require('elasticsearch');
var bunyan = require('bunyan'),
  log = bunyan.createLogger({
    name: 'ElasticLog'
  });

module.exports = (function() {
  var client = null;

  function connect(cb) {
    try {
      if (!client)
        return setConnection(cb);
      cb(client);
    } catch (err) {
      log.error({
        error: err
      }, "Elastic search Connection Error");
      cb(null);
    }
  }

  function setConnection(cb) {
    try {
      client = new elasticsearch.Client({
        host:global.config.elasticsearch.host,
        log:"trace"
      });
      cb(client)
    } catch (err) {
      console.log("error===",err)
      log.error({
        error: err
      }, "Elastic search Connection Error");
      cb(null);
    }
  }
  return {
    index: function(indextype, id, indexbody, cb) {
      connect(function(client) {
        client.index({
          index: global.config.elasticsearch.indexname,
          type: indextype,
          id:id.toString(),
          body: indexbody
        }, function(err, resp, status) {
          if(err)
            return cb(err)
          cb(null,resp)
        })
      })
    },
    update: function(indextype, id, indexbody, cb) {
      connect(function(client) {
        client.update({
          index: global.config.elasticsearch.indexname,
          type: indextype,
          id:id.toString(),
          body: indexbody
        }, function(err, resp, status) {
          if(err)
            return cb(err)
          cb(null,resp)
        })
      })
    },
    search: function(indextype, query, cb) {
      connect(function(client) {
        client.search({
          index: global.config.elasticsearch.indexname,
          type:indextype,
          body:query
        }, function(err, response, status) {
          console.log("--- Response ---");
          console.log(response);
          console.log("--- Hits ---");
          if(err)
            return cb(err)
          return cb(null,response)
        })
      })
    }
  };
})();
