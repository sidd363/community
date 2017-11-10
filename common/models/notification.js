//
// Notification Topic created in following cases
// 1. Each user has topic which topic stored in user model `userTopicARN` . This will be useful if we want to send notify to particular user.
// 2. Each answer has topic which is stored in answer model `answerTopicARN`. So if there any activity on that user get notified.
// 3. Common Topic - All user subscribed to that topic by default. So we can use that, if we want to notify all in one shot.
//
//
// POST "/register"
// GET "/user"
//
var app = require('../../server/server');
var config = require('../../server/config.json');
var dataSource = app.datasources.db;
var loopback = require('loopback');
var ObjectID = require('mongodb').ObjectID;
var Promise = require("bluebird");
var Validator = require('jsonschema').Validator;
var v = new Validator();
var request = require('request');
module.exports = function(Notification) {
  var baseUrl = global.config.notificationService['host'] + global.config.notificationService['path'];

  //
  // register your device / update your device token.
  //
  // POST "/register"
  //
  Notification.registerDevice = function(currentUser, token, deviceType, cb) {
    Notification.app.models.device.findOne({
      where: {
        "devicetoken": token
      }
    }, function(err, device) {
      if (device && device.devicearn) {
        return cb(null, device.devicearn);
      } else {
        if (currentUser.deviceARN && currentUser.deviceARN[deviceType]) {
          Notification.updateDeviceToken(currentUser, token,deviceType, function(err, body) {
            if (err) {
              console.log("Error in updating device token.");
              return cb(err);
            }
            Notification.emit('updatedevice',currentUser.deviceARN[deviceType], body["endpointArn"], token);
            return cb(null, body["endpointArn"]);
          });
        } else {
          var postBody = {
            'deviceType': deviceType,
            'token': token,
            'customUserData': currentUser.id
          }
          console.log("postBody===",postBody)
          request({
            'method': 'POST',
            'url': baseUrl + '/device',
            'json': true,
            'body': postBody
          }, function(error, response, body) {
            console.log("error",error);
            console.log("body",body)
            if (error) {
              return cb(error);
            }
            Notification.emit('adddevice',token, body["endpointArn"]);
            return cb(null, body["endpointArn"]);
          })
        }
      }
    })
  };

  //
  // In SNS:
  // update enpoint attribute token.
  //
  Notification.updateDeviceToken = function(currentUser, token,deviceType, cb) {
    var postBody = {
      'token': token
    }
    request({
      'method': 'put',
      'url': baseUrl + '/device/' + new Buffer(currentUser.deviceARN[deviceType]).toString('base64'),
      'json': true,
      'body': postBody
    }, function(error, response, body) {
      if (error) {
        return cb(error);
      }
      console.log(body);
      if (response && body) {
        return cb(null, body);
      }
    })
  };

  //
  // Create topic for given user.
  //
  // GET "/user"
  //
  Notification.createTopicForUser = function(userId, cb) {

    Notification.app.models.user.findById(ObjectID(userId), function(err, givenUser) {
      if (err) {
        return cb(err);
      }

      Notification.createTopic(givenUser.userName, function(err, topic) {
        if (err) {
          return cb(err);
        }
        givenUser.userTopicARN = topic["topicArn"];
        givenUser.save(givenUser, function(err, savedUser) {
          if (err) {
            return cb(err);
          }
          return cb(null, savedUser);
        });
      });
    });
  }

  // Create topic.
  Notification.createTopic = function(topicName, cb) {
    var postBody = {
      'snsName': topicName
    }

    // FOR DN - Callback function not called.
    request({
      'method': 'POST',
      'url': baseUrl + '/topic',
      'json': true,
      'body': postBody
    }, function(error, response, body) {
      if (error) {
        cb(error);
      }
      if (response && body) {
        cb(null, body);
      }
    });
  }

  // In SNS
  // create new topic for given answer
  //
  Notification.createTopicForPost = function(answerId, cb) {
    Notification.app.models.answer.findById(answerId, function(err, givenAnswer) {
      if (err) {
        return cb(err);
      }
      var postBody = {
        'snsName': givenAnswer.id,
        "displayName": "Answer " + givenAnswer.id
      }
      request({
        'method': 'POST',
        'url': baseUrl + '/topic',
        'json': true,
        'body': postBody
      }, function(error, response, body) {
        if (error) {
          return cb(error);
        }
        if (response && body) {
          givenAnswer.topicARN = body["attributes"]["TopicArn"];
          givenAnswer.save(function(err, savedAnswer) {
            if (err) {
              return cb(err);
            }
            return cb(null, savedAnswer);
          });
        }
      });
    });
  };

  // In SNS
  // create new topic for given update/status
  //
  Notification.createTopicForUpdate = function(statusId, cb) {
    Notification.app.models.update.findById(statusId, function(err, givenStatus) {
      if (err) {
        return cb(err);
      }
      var postBody = {
        'snsName': givenStatus.id,
        "displayName": "Status " + givenStatus.id
      }
      request({
        'method': 'POST',
        'url': baseUrl + '/topic',
        'json': true,
        'body': postBody
      }, function(error, response, body) {
        if (error) {
          return cb(error);
        }
        if (response && body) {
          givenStatus.topicARN = body["attributes"]["TopicArn"];
          givenStatus.save(function(err, savedStatus) {
            if (err) {
              return cb(err);
            }
            return cb(null, savedStatus);
          });
        }
      });
    });
  };

  //
  // Subscribe to topic
  //
  Notification.subscribeToPost = function(userId, givenTopicARN, cb) {
  Notification.app.models.user.findById(userId, function(err, givenUser) {
      if (err) {
        return cb(err);
      }
      var promArr=[];
      var promObj={};
      for(var deviceType in givenUser.deviceARN){
        (function(deviceType){
          promObj[deviceType]=new Promise(function(resolve,reject){
            var postBody = {
              'endpoint': givenUser.deviceARN[deviceType]
            }
            request({
              'method': 'POST',
              'url': baseUrl + '/topic/' + new Buffer(givenTopicARN).toString('base64') + '/subscribe',
              'json': true,
              'body': postBody
            }, function(error, response, body) {
              if (error) {
                reject(err);
              }
              console.log(body);
              if (response && body) {
                resolve(body);
              }
            });
          });
          promArr.push(promObj[deviceType])
        })(deviceType)
      }
      Promise.all(promArr).then(function(resolveArr){
        return cb(null,resolveArr)
      },function(rejectArr){
        return cb(rejectArr);
      })
    });
  };

  //
  // unsubscribe from topic
  //
  Notification.unsubscribeFromTopic = function(userId, givenTopicARN, cb) {
    Notification.app.models.user.findById(userId, function(err, givenUser) {
        if (err) {
          return cb(err);
        }
        var promArr=[];
        var promObj={};
        for(var deviceType in givenUser.deviceARN){
          (function(deviceType){
            promObj[deviceType]=new Promise(function(resolve,reject){
              var postBody = {
                'endpoint': givenUser.deviceARN[deviceType]
              }
              console.log("postBody===",postBody);
              request({
                'method': 'POST',
                'url': baseUrl + '/topic/' + new Buffer(givenTopicARN).toString('base64') + '/unsubscribe',
                'json': true,
                'body': postBody
              }, function(error, response, body) {
                if (error) {
                  reject(err);
                }
                console.log(body);
                if (response && body) {
                  resolve(body);
                }
              });
            });
            promArr.push(promObj[deviceType])
          })(deviceType)
        }
        Promise.all(promArr).then(function(resolveArr){
          return cb(null,resolveArr)
        },function(rejectArr){
          return cb(rejectArr);
        })
      });
  };

  //
  // publish message to topic
  //
  Notification.publish = function(message, topicARN, cb) {
    if(!topicARN){
      return true
    }
    var postBody = {
      'message': {
        "tagid":message.tagid,
        "message":message.message,
        "dataobj":JSON.stringify(message.dataobj)
      }
    }
    request({
      'method': 'POST',
      'url': baseUrl + '/topic/' + new Buffer(topicARN).toString('base64') + '/publish',
      'json': true,
      'body': postBody
    }, function(error, response, body) {
      if (error) {
        return cb(error);
      }
      console.log(body);
      if (response && body) {
        return cb(null, body);
      }
    })
  };
  Notification.saveNotification = function(userid,message,topicArn){
    var notification = new Notification({
      userId:userid,
      message:message,
      topicArn:topicArn,
      submittedAt:new Date()
    });
    notification.save(function(err,savedNotification){
      if(err){
        console.log()
        return false;
      }
      else{
        return true;
      }
    })
  }
  Notification.getAllNotifications= function(cb){
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    Notification.find({
      where:{
        userId:currentUser.id
      },
      order:"submittedAt DESC"
    },function(err,notifications){
      if(err)
        return cb(err)
      var returnObj={
        "notifications":notifications
      }
      return cb(null,returnObj);
    })
  }
  Notification.on('updatedevice',function(deviceARN,newdevicearn,token){
    Notification.app.models.device.updatedevice(deviceARN,newdevicearn,token);
  })
  Notification.on('adddevice',function(token,deviceARN){
    Notification.app.models.device.adddevice(token, deviceARN);
  })
  Notification.getEventNotifications = function(cb){
    var eventDate = new Date("February 15, 2017 18:30:00");
    this.find({
      where:{
        or:[
          {"message.tagid":2},{"message.tagid":3}
        ],
        "submittedAt":{"gte":eventDate}
      },
      order:"submittedAt DESC",
      limit:5
    },function(err,notifications){
      if(err)
        return cb(err)
      return cb(null,notifications);
    })
  }
}
