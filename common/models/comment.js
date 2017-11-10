//
// All comment related functions in answer.js
//
//
// GET "/type/:type/:relation"
// GET "/createpersonality"
//
var app = require('../../server/server');
var dataSource = app.datasources.db;
var loopback = require('loopback');
var HTTPClient = require('httpclient');
var Validator = require('jsonschema').Validator;
var v = new Validator();
var notifTag = require("../../config/notificationConfig.json");
var format = require('string-format');
var ObjectID = require('mongodb').ObjectID;
var s3helper = require('../lib/s3helper.js');
var Promise = require("bluebird");
var mltServiceOptions = {
  hostname: global.config.mltServiceHost,
  path: '/',
  port: 80,
  secure: false,
  method: 'POST'
}

module.exports = function(Comment) {
  Comment.validatesInclusionOf('userRelation', { in: ['family', 'colleague', 'friend', 'unknown', 'myself'],
    allowNull: true
  });
  Comment.validatesInclusionOf('type', { in: ['videoComment', 'Text', 'Cloud']
  });
  Comment.observe('after save', function(ctx, next) {
    var loctx = loopback.getCurrentContext();
    var currentUser = loctx && loctx.get('currentUser');
    var instance = ctx.instance;
    var isNew = ctx.instance && ctx.isNewInstance;
    if (isNew) {
      if (instance.type === 'Cloud') {
        Comment.emit('cloudComment', instance);
      }
      Comment.app.models.answer.findById(instance.answerId,
        function(err, answer) {
          if (err) {
            console.log('Error in getting answer', err);
          }
          var commentNotifData = notifTag["comment"];
          if (answer.topicARN) {
            Comment.app.models.Notification.unsubscribeFromTopic(currentUser.id, answer.topicARN, function(err, data) {
              var message = {
                tagid: commentNotifData.tagid,
                message: commentNotifData.messageGeneral.format(instance.firstName, answer.firstName, answer.questionName),
                dataobj: {
                  id: ObjectID(answer.id),
                  userid: ObjectID(currentUser.id),// answer.userId ->currentUser.id changed by sidd
                  firstName: instance.firstName,
                  lastName: instance.lastName,
                  image_url: instance.image_url
                }
              }
              var taggedmessage = {
                tagid: commentNotifData.tagid,
                message: commentNotifData.messageTagged.format(instance.firstName),
                dataobj: {
                  id: ObjectID(answer.id),
                  userid: ObjectID(currentUser.id),// answer.userId ->currentUser.id changed by sidd
                  firstName: instance.firstName,
                  lastName: instance.lastName,
                  image_url: instance.image_url
                }
              }
              Comment.app.models.Notification.publish(message, answer.topicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing message to topic.");
                }
                if (ObjectID(instance.userId).toString() != ObjectID(answer.userId).toString()) {
                  Comment.app.models.Notification.subscribeToPost(currentUser.id, answer.topicARN, function(err, subscribe) {
                    if (err) {
                      console.log("Error subscibing topic.");
                    }
                  });
                }
              });
              if (instance && instance.comment && instance.comment.message) {
                var splitmessage = instance.comment.message.split(/\$(.*?)>/igm);
                if (splitmessage && splitmessage.length && splitmessage[1]) {
                  var userId = splitmessage[1];
                  console.log("userId===", userId)
                  console.log("splitmessage===", splitmessage)
                  Comment.app.models.Notification.unsubscribeFromTopic(userId, answer.topicARN, function(err, data) {
                    Comment.app.models.answer.emit('threadnotification', answer.id, message, answer.topicARN, answer.userId, currentUser.id);
                  });
                  Comment.app.models.user.findById(userId, function(err, user) {
                    Comment.app.models.Notification.publish(taggedmessage, user.userTopicARN, function(err, subscribe) {
                      if (err) {
                        console.log("Error publishing message to topic.");
                      }
                    });
                    Comment.app.models.answer.emit('notification', answer.userId, taggedmessage, user.userTopicARN);
                  })
                }
              } else {
                Comment.app.models.answer.emit('threadnotification', answer.id, message, answer.topicARN, answer.userId, currentUser.id);
              }
            })
          }
          next();
        });
    }
  });
  Comment.on('cloudComment', function(instance) {
    Comment.app.models.Personality.updateProfileChart(instance);
  })

  //
  // List all comment by type such as video, text, form
  // GET "/type/:type/:relation"
  //
  Comment.listComment = function(type, relation, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var filterObj = {}
    if (relation == 'all') {
      filterObj = {
        where: {
          toUserId: currentUser.id,
          type: type
        },
        order: 'submittedAt DESC'
      }
    } else {
      filterObj = {
        where: {
          toUserId: currentUser.id,
          type: type,
          userRelation: relation
        },
        order: 'submittedAt DESC'
      }
    }
    this.find(filterObj, function(err, comments) {
      if (err) {
        console.log('Error in getting comments ', err);
        throw err;
      }
      cb(null, comments);
    });

  };

  Comment.remoteMethod(
    'listComment', {
      description: 'list all comments of a type',
      accepts: [{
        arg: 'type',
        type: 'string',
        required: true,
        http: {
          "source": "path"
        }
      }, {
        arg: 'relation',
        type: 'string',
        required: true,
        http: {
          "source": "path"
        }
      }],
      returns: {
        arg: "data",
        type: "comment",
        root: true
      },
      http: {
        path: '/type/:type/:relation',
        verb: 'get',
        status: 200
      },
    }
  );

  Comment.createPersonality = function(cb) {
    this.find({}, function(err, comments) {
      for (var index in comments) {
        (function(index) {
          var commentObj = comments[index];
          Comment.app.models.Personality.updateProfileChart(commentObj);
          //all relation type
          commentObj.userRelation = "all";
          Comment.app.models.Personality.updateProfileChart(commentObj);
        })(index);
      }
      cb(null, comments);
    })
  }

  Comment.remoteMethod(
    'createPersonality', {
      description: 'create cloud and vibe',
      returns: {
        arg: "data",
        type: "object",
        root: true
      },
      http: {
        path: '/createpersonality',
        verb: 'get',
        status: 200
      },
    }
  );
  Comment.beforeRemote("deleteById", function(ctx, model, next) {
    console.log(ctx.args.id);
    Comment.findById(ctx.args.id, function(err, comment) {
      var loctx = loopback.getCurrentContext();
      var currentUser = loctx && loctx.get('currentUser');

      if (ObjectID(currentUser.id).toString() != ObjectID(comment.userId).toString()) {
        var error = new Error("Unauthorised Request");
        error.status = 401;
        return next(error);
      }
      var promArr = []
      var answerPromise = new Promise(function(resolve, reject) {
        Comment.app.models.answer.findById(comment.answerId, function(err, answer) {
          answer.commentCount--;
          answer.save(function(err, savedAnswer) {
            var updateActivityData = {
              count: answer.commentCount,
            };
            Comment.app.models.answer.emit('updateActivity', answer.id, 'comment', updateActivityData);
            resolve();
          })
        })
      })
      promArr.push(answerPromise);

      if (comment.type == "videoComment") {
        var deleteVideoPromise = new Promise(function(resolve, reject) {
          var delVideosObj = {
            Objects: []
          }
          var videoKey = comment.comment.url;
          var coverImageKey = comment.comment.coverImage;
          delVideosObj.Objects.push({
            Key: videoKey
          })
          delVideosObj.Objects.push({
            Key: coverImageKey
          })
          s3helper.deleteVideos(delVideosObj, function(err, data) {
            console.log(err)
            console.log(data)
            if (err) {
              reject(err)
            } else {
              resolve();
            }
          })
        })
        promArr.push(deleteVideoPromise);
      }
      Promise.all(promArr).then(function(){
        next();
      })
    })
  })
};
