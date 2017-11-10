var request = require("request");
var AWS = require('aws-sdk');
module.exports = function(server) {
  // Install a `/` route that returns server status
  var router = server.loopback.Router();
  router.get('/status', server.loopback.status());
  router.get("/calibrator/words", function(req, resp, next) {
    var url = global.config.calibrator.host + "/calibrator/words";
    request({
      "method": "GET",
      "url": url,
      "json": true
    }, function(err, res) {
      return resp.send(res.body);
    });
  });
  router.get("/verified", function(req, resp, next) {
    resp.render('verified');
  })
  router.post('/upload/candidates', function(req, res, next) {

    /* example file
    {
      file : {
        size : 35874,
        type : "image/png"
      }
    }
    */



  });

  server.use(router);
};
