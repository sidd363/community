var AWS = require("aws-sdk");
var s3 = require('s3');

module.exports = (function() {
  var credentials = new AWS.SharedIniFileCredentials({
    profile: 'delete-video'
  });
  AWS.config.credentials = credentials;
  AWS.config.signatureVersion="v4"
  var s3 = new AWS.S3()
  return {
    deleteVideos: function(delObj, cb) {
      console.log("comes here")
      var params = {
        Bucket: "shrofile-videos",
        Delete: delObj
      }
      s3.deleteObjects(params, function(err, data) {
        if (err) {
          console.log(err, err.stack);
          cb(err);
        } else {
          console.log(data); // successful response
          cb(null,data)
        }
      });
    },
    getSignedUrl:function(filename,type,cb){
      var bucketName = "shrofile-resume";
      AWS.config.update({region: 'ap-south-1'});
      var s3bucket = new AWS.S3();
      var s3_params = {
        Bucket: "shrofile-resume",
        Key: filename,
        Expires: 60, // expire after 60 mins
        ContentType: type,
        ACL: 'public-read',
      };
      s3bucket.getSignedUrl('putObject', s3_params, function(err, data) {
        if (err) {
          console.log(err);
        } else {
          console.log("data===",data)
          var return_data = {
            signedUrl: data,
            bucketUrl: 'https://' + bucketName + '.s3.amazonaws.com/' + filename
          };
          cb(null,return_data)
        }
      });
    }
  }
})();
