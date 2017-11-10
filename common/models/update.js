//
// update model stores statuses.
//
//
// GET "/:id/comment"
// POST "/:id/comment"
// GET "/:id/comment/:commentId"
// DELETE "/:id/comment/:commentId"
// GET "/:id/like"
// POST "/:id/like"
//
var app = require('../../server/server');
var dataSource = app.datasources.db;
var loopback = require('loopback');
var HTTPClient = require('httpclient');
var Validator = require('jsonschema').Validator;
var v = new Validator();
var ObjectID = require('mongodb').ObjectID;
var templateConfig = require('../../config/templateType.json');
var request = require('request');
var notifTag = require("../../config/notificationConfig.json");
var format = require('string-format');
var s3helper = require('../lib/s3helper.js');
var redis = require("../lib/redis.js")
format.extend(String.prototype)
module.exports = function(Update) {

  // Call this before entry the data in update model.
  //
  // here we validate the required fields.
  //schema of update collection
  /*
  {
    submittedAt:,
    likeCount:,
    commentCount:,
    public:true,
    topicARN:"",
    userId:'',
    status_type:,
    status:{
      url:"",
      shareUrl:"",
      status_title:"",
      status_description:""
    }
  }
  */
  Update.observe('before save', function(ctx, next) {
    var isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      return next();
    }
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    ctx.instance.userId = currentUser.id;
    ctx.instance.submittedAt = new Date();
    next();
  });

  //
  // This will call after made an entry in update collection.
  //
  // Create a Topic for that answer in notification service
  // Logined user Subscribe to that topic. So that user can get notification if there any activity in that.
  //
  Update.observe('after save', function(ctx, next) {
    var isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      return next();
    }
    var instance = ctx.instance;
    Update.app.models.Notification.createTopicForUpdate(instance.id, function(err, updatedInstance) {
      if (err) {
        console.log("Error creating topic for post.");
      }else{
        console.log("created topic for updates in sns.");
      }
    });
    next();
  });

  /*
    Comment API's
  */
  //
  // POST "/:id/comment"
  //
  // post comment to update.
  // Notify that comment to answer creator.
  //
/*
  {
    "_id" : ObjectId("5953fb7674bb00eb269286e1"),
    "type" : "Text",
    "comment" : {
      "public" : true,
      "type" : "Text",
      "message" : "I completely endorse what Sheryl says... we need to continuously reinvent ourselves! "
    },
    "submittedAt" : ISODate("2017-06-28T18:54:46.546Z"),
    "likeCount" : 0,
    "replyCount" : 0,
    "public" : true,
    "userId" : ObjectId("589aef5c0f5e7a202d881c54"),
    "questionId" : ObjectId("589aee2319016c1b2dd847ef"),
    "answerId" : ObjectId("5953f2f8d59c0a181e5033ad"),
    "firstName" : "Neha",
    "lastName" : "Lal",
    "image_url" : "https://graph.facebook.com/10155844345374498/picture?type=large",
    "toUserId" : ObjectId("589aee2319016c1b2dd847ee"),
    "toUserFirstName" : "Deepesh",
    "toUserlastName" : "Naini"
  }
  */
  Update.postComment = function(id, comment, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    this.findById(id,
      function(err, update) {
        if (err) {
          console.log('Error in getting answer', err);
        }
        // var commentSchema = templateConfig[comment.type];
        // var validateSchema = v.validate(comment, commentSchema);
        // if (!validateSchema.valid) {
        //   e = new Error(validateSchema.errors);
        //   e.status = e.statusCode = 422;
        //   return cb(e);
        // }
        var commentObj = {};
        commentObj.type = comment.type;
        commentObj.updateId = update.id;
        commentObj.questionId = update.questionId;
        commentObj.comment = comment;
        commentObj.userId = currentUser.id;
        commentObj.firstName = currentUser.firstName;
        commentObj.lastName = currentUser.lastName;
        commentObj.image_url = currentUser.image_url;
        commentObj.public = true;
        commentObj.toUserId = update.userId;
        commentObj.toUserFirstName = update.firstName;
        commentObj.toUserlastName = update.lastName;
        if (comment.type === 'videoComment') {
          comment.url = comment.url.replace("é", "e%CC%81");
          comment.url = comment.url.replace("ú", "u%CC%81");
          commentObj.url = global.config.streamingBase + comment.url;
          commentObj.coverImage = global.config.s3BucketBase + encodeURI(comment.coverImage);
        }
        commentObj.submittedAt = new Date();
        Update.app.models.comment.create(commentObj, function(err, comment) {
          if (err) {
            console.log("Error in creating comment", err);
            throw err;
          }
          update.commentCount++;
          update.save(function(err, data) {
            // var activityCommentData = {
            //   firstName: commentObj.firstName,
            //   lastName: commentObj.lastName,
            //   image_url: commentObj.image_url,
            //   userId: currentUser.id,
            //   comment: commentObj.comment
            // };
            // var updateActivityData = {
            //   count: update.commentCount,
            //   comment: activityCommentData
            // };
            // Update.emit('updateActivity', update.id, 'comment', updateActivityData);
          });
          // Update.emit('updateUpdate', update);
          // Update.app.models.userActivity.emit('newUserActivity', 'newComment', {
          //   "userId": currentUser.id,
          //   "resourceId": id
          // })
          if (ObjectID(currentUser.id).toString() != ObjectID(update.userId).toString()) {
            var commentNotifData = notifTag["commentUpdate"];
            Update.app.models.user.findById(update.userId, function(err, user) {
              if (user && user.userTopicARN) {
                var message = {
                  tagid: commentNotifData.tagid,
                  message: commentNotifData.message.format(commentObj.firstName, update.questionName),
                  dataobj: {
                    id: ObjectID(update.id),
                    userid: ObjectID(currentUser.id),//changed for contributor id
                    firstName: commentObj.firstName,
                    lastName: commentObj.lastName,
                    image_url: commentObj.image_url
                  }
                }
                Update.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                  if (err) {
                    console.log("Error publishing message to topic.");
                  }
                });
                Update.emit('notification', update.userId, message, user.userTopicARN);//changed
              }
            })
          }
          cb(null, comment);
        });
      });
  }

  Update.remoteMethod(
    'postComment', {
      description: 'comment to an update.',
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true
      }, {
        arg: 'comment',
        type: 'object',
        required: true
      }],
      returns: {
        arg: "data",
        type: "comment",
        root: true
      },
      http: {
        path: '/:id/comment',
        verb: 'post',
        status: 200
      },
    }
  );

  //
  // GET "/:id/comment"
  //
  // list all comments for an answer
  //
  Update.listComment = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Update.app.models.comment.find({
      where: {
        answerId: id
      },
      order: 'submittedAt ASC'
    }, function(err, comments) {
      if (err) {
        console.log('Error in getting comments ', err);
        throw err;
      }
      cb(null, comments);
    });

  };

  Update.remoteMethod(
    'listComment', {
      description: 'list all comments of an answer.',
      accepts: [{
        arg: 'id',
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
        path: '/:id/comment',
        verb: 'get',
        status: 200
      },
    }
  );

  //
  // GET "/:id/comment/:commentId"
  //
  // Get given command for given answer
  //
  Update.getComment = function(id, commentId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    Update.app.models.comment.findById(commentId,
      function(err, comment) {
        if (err) {
          console.log('Error in get comment', err);
          throw err;
        }
        console.log(comment)
        cb(null, comment);
      });
  };

  Update.remoteMethod(
    'getComment', {
      description: 'get a comment of an answer.',
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true
      }, {
        arg: 'commentId',
        type: 'string',
        required: true
      }],
      returns: {
        arg: "data",
        type: "comment",
        root: true
      },
      http: {
        path: '/:id/comment/:commentId',
        verb: 'get',
        status: 200
      },
    }
  );

  //
  // DELETE "/:id/comment/:commentId"
  //
  // Delete the comment
  //
  Update.deleteComment = function(id, commentId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    Update.app.models.comment.findById(commentId,
      function(err, comment) {
        if (err) {
          console.log('Error in getting comment', err);
          throw err;
        }

        if (comment.userId != currentUser.id) {
          var error = new Error("Unauthorised Request");
          error.status = 401;
          return cb(error);
        }
        Update.app.models.comment.destroyById(commentId,
          function(err, comment) {
            if (err) {
              console.log('Error in delete comment', err);
              throw err;
            }
            Update.findById(id, function(err, answer) {
              answer.commentCount--;
              answer.save(function(err, savedUpdate) {
                Update.emit('updateActivity', answer.id, 'comment', answer.commentCount);
              })
            })
            cb(null, true);
          });
      });
  };

  Update.remoteMethod(
    'deleteComment', {
      description: 'delete a comment of an answer.',
      accepts: [{
        arg: 'id',
        type: 'string',
        required: true
      }, {
        arg: 'commentId',
        type: 'string',
        required: true
      }],
      returns: {
        arg: "data",
        type: "boolean",
        root: true
      },
      http: {
        path: '/:id/comment/:commentId',
        verb: 'delete',
        status: 200
      },
    }
  );

  /*
    LIKE api's
  */
  //
  // POST "/:id/like"
  //
  // Function to handle like and dislike of an update
  //
  //
  Update.like = function(id, isLiked, cb) {
    console.log("isliked console added", isLiked);
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Update.findById(id,
      function(err, status) {
        if (err) {
          console.log('Error in getting answer', err);
        }
        Update.app.models.like.findOne({
          where: {
            updateId: ObjectID(status.id),
            userId: ObjectID(currentUser.id)
          }
        }, function(err, like) {
          if (like && like.id) {
            like.isLiked = isLiked;
          } else {
            like = new Update.app.models.like({
              updateId: status.id,
              userId: currentUser.id,
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              image_url: currentUser.image_url,
              isLiked: isLiked
            });
          }
          if (isLiked) {
            var likeNotifData = notifTag["likeUpdate"];
            Update.app.models.user.findById(status.userId, function(err, user) {
              if (user && user.userTopicARN && ObjectID(status.userId).toString() != ObjectID(currentUser.id).toString()) {
                var message = {
                  tagid: likeNotifData.tagid,
                  message: likeNotifData.message.format(currentUser.firstName),
                  dataobj: {
                    id: status.id,
                    userid: ObjectID(currentUser.id),
                    firstName: currentUser.firstName,
                    lastName: currentUser.lastName,
                    image_url: currentUser.image_url
                  }
                }
                Update.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                  if (err) {
                    console.log("Error publishing message to topic.");
                  }
                });
                Update.emit('notification', status.userId, message, user.userTopicARN);
              }
            });
          }
          like.save(function(err, savedLike) {
            if (isLiked) {
              status.likeCount++;
            } else if (status.likeCount && !isLiked) {
              status.likeCount--;
            }
            status.save(function(err, savedUpdate) {
              if (err)
                return cb(err)
              // var updateActivityData = {
              //   count: status.likeCount
              // }
              // Update.emit('updateActivity', status.id, 'like', updateActivityData);
              // if (isLiked) {
              //   Update.app.models.userActivity.emit('newUserActivity', 'newLike', {
              //     "userId": currentUser.id,
              //     "resourceId": id
              //   })
              // }
              cb(null, savedUpdate);
            })
          })
        })
      });
  };

  Update.remoteMethod(
    'like', {
      description: 'like a status.',
      accepts: [{
        arg: 'id',
        type: 'string',
        http: {
          "source": "path"
        },
        required: true
      }, {
        arg: 'isLiked',
        type: 'boolean',
        required: true
      }],
      returns: {
        arg: "data",
        type: "update",
        root: true
      },
      http: {
        path: '/:id/like',
        verb: 'post',
        status: 200
      }
    }
  );

  // GetLikes
  // GET "/:id/like"
  //
  // list of like information for the given status
  //
  Update.getLikes = function(id, cb) {
    Update.app.models.like.find({
      where: {
        updateId: id,
        isLiked: true
      }
    }, function(err, likes) {
      if (err)
        return cb(err);
      cb(null, likes);
    })
  }

  Update.remoteMethod(
    'getLikes', {
      description: 'getlikes of an update.',
      accepts: {
        arg: 'id',
        type: 'string',
        required: true
      },
      returns: {
        arg: "data",
        type: "object",
        root: true
      },
      http: {
        path: '/:id/like',
        verb: 'get',
        status: 200
      }
    }
  );

  
  Update.on('updateActivity', function(resourceId, type, updateActivityData) {
    Update.app.models.activity.updateActivity(resourceId, type, updateActivityData, function(err, data) {

    })
  })
  Update.on('notification', function(userId, message, topicArn) {
    Update.app.models.Notification.saveNotification(userId, message, topicArn);
  })
  Update.on("threadnotification", function(answerid, message, answerTopicARN, answerUserId, currentUserId) {
    Update.app.models.comment.find({
      where: {
        answerId: answerid
      },
      order: "submittedAt DESC"
    }, function(err, comments) {
      var promObj = {};
      var promArr = [];
      for (var index in comments) {
        (function(index) {
          var comment = comments[index];
          console.log("typeof comment.userId=====", typeof comment.userId)
          if (!promObj[comment.userId] && ObjectID(answerUserId).toString() != ObjectID(comment.userId).toString() && ObjectID(currentUserId).toString() != ObjectID(comment.userId).toString()) {
            promObj[comment.userId] = new Promise(function(resolve, reject) {
              resolve(Update.app.models.Notification.saveNotification(comment.userId, message, answerTopicARN));
            })
            promArr.push(promObj[comment.userId])
          }
        })(index);
      }
      if (promArr.length) {
        Promise.all(promArr).then(function(resolveArr, rejectArr) {

        })
      }
    })
  })

  Update.on('postUpdateForUser', function(detailObj) {
    var email = detailObj["email"];
    var instance = detailObj["instance"];
    var question = detailObj["question"];
    Update.app.models.user.findOne({
      where: {
        "email": email
      }
    }, function(err, user) {
      var questionPromise = new Promise(function(resolve, reject) {
        Update.app.models.question.findOne({
          where: {
            "userId": user.id,
            "order": question.order
          }
        }, function(err, question) {
          if (err)
            reject(err)
          else
            resolve(question);
        })
      });
      var accessTokenPromise = new Promise(function(resolve, reject) {
        Update.app.models.AccessToken.findOne({
          where: {
            userId: user.id
          }
        }, function(err, accessToken) {
          if (err)
            reject(err)
          else
            resolve(accessToken);
        })
      });
      var promArr = [questionPromise, accessTokenPromise];
      Promise.all(promArr).then(function(resolveArr) {
        var question = resolveArr[0];
        var accessToken = resolveArr[1];
        delete instance.answer.seedEmail;
        var postBody = {
          "answer": instance.answer
        };
        request({
          'method': 'post',
          'url': global.config.apiserver + "/questions/" + question.id + "/answers",
          'json': true,
          'headers': {
            "Authorization": accessToken.id
          },
          'body': postBody
        }, function(err, data) {});
      })
    })
  })
  Update.beforeRemote("deleteById", function(ctx, model, next) {
    var answerId = ctx.args.id;
    Update.findById(answerId, function(err, answer) {
      var loctx = loopback.getCurrentContext();
      var currentUser = loctx && loctx.get('currentUser');

      if (ObjectID(currentUser.id).toString() != ObjectID(answer.userId).toString()) {
        var error = new Error("Unauthorised Request");
        error.status = 401;
        return next(error);
      }
      var promArr = [];
      if (answer.type == "Video") {
        var delVideosObj = {
          Objects: []
        }
        for (var index in answer.answer.segments) {
          var key = {
            Key: answer.answer.segments[index]
          }
          delVideosObj.Objects.push(key)
        }
        var videoKey = answer.answer.url.split(global.config.streamingBase)[1];
        var coverImageKey = answer.answer.coverImage.split(global.config.s3BucketBase)[1];
        delVideosObj.Objects.push({
          Key: videoKey
        })
        delVideosObj.Objects.push({
          Key: coverImageKey
        })
        console.log(JSON.stringify(delVideosObj))
        var deleteVideosPromise = new Promise(function(resolve, reject) {
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
        promArr.push(deleteVideosPromise)
      }
      var deleteActivityPromise = new Promise(function(resolve, reject) {
        Update.app.models.activity.destroyAll({
          resourceId: answerId
        }, function(err, data) {
          console.log("dtata==", data)
          resolve();
        })
      });
      var likeActivityPromise = new Promise(function(resolve, reject) {
        Update.app.models.like.destroyAll({
          answerId: answerId
        }, function(err, data) {
          console.log("dtata==", err)
          resolve();
        })
      });
      var commentActivityPromise = new Promise(function(resolve, reject) {
        Update.app.models.comment.destroyAll({
          answerId: answerId
        }, function(err, data) {
          console.log("dtata==", err)
          resolve();
        });
      });
      var answerCountPromise = new Promise(function(resolve, reject) {
        Update.app.models.question.findById(answer.questionId, function(err, question) {

          if (question.answerCount > 0) {
            question.answerCount = question.answerCount - 1;
          }
          console.log("answerCount====", question.answerCount)
          question.save(function(err, savedQuestion) {
            resolve()
          })
        })
      })
      promArr.push(deleteActivityPromise, likeActivityPromise, commentActivityPromise, answerCountPromise);
      Promise.all(promArr).then(function(resolveArr) {
        next();
      })
    })

  });
};

