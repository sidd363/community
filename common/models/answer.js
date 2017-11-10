//
// Answer model stores answers against questions.
//
//
// GET "/:id/privacy"
// POST "/createpersonality"
// GET "/meta"
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
var themesArray = global.config.themes;
var unidecode = require('unidecode');
var s3helper = require('../lib/s3helper.js');
var redis = require("../lib/redis.js")
format.extend(String.prototype)
module.exports = function(Answer) {
  Answer.validatesInclusionOf('type', { in: ['Video', 'Uploads', 'Text', 'Cloud', 'Form']
  });
  Answer.validatesUniquenessOf('first_segment_video_name', {message: "First segment video name should be unique"});

  // Call this before entry the data in Answer model.
  //
  // here we validate the required fields.
  //
  Answer.observe('before save', function(ctx, next) {
    var isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      // Don't continue if its not a new instance
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
    Answer.app.models.question.findById(ctx.instance.questionId, function(err, question) {
      var answer = JSON.parse(JSON.stringify(ctx.instance))["answer"];
      if (!answer) {
        e = new Error("answer field is required.");
        e.status = e.statusCode = 422;
        return next(e);
      }

      // validate against the jsonschema template.
      var schema = question.answerTemplate;
      var validationResult = v.validate(answer, schema);
      if (!validationResult.valid) {
        e = new Error(validationResult.errors);
        e.status = e.statusCode = 422;
        return next(e);
      }
      if (question.type == "Uploads") {
        answer.url = global.config.s3BucketBase + answer.url;
      }
      if (question.type == "Video" && answer.coverImage.indexOf(global.config.s3BucketBase) == -1) {
        answer.coverImage = global.config.s3BucketBase + encodeURI(answer.coverImage).replace(/ /g, '+');
      }
      if (currentUser.email.indexOf("@seed.com") != -1 && ctx.instance.answer.seedEmail) {
        Answer.emit('postAnswerForUser', {
          "email": ctx.instance.answer.seedEmail,
          "instance": ctx.instance,
          "question": question
        });
      }
      if(currentActiveContext.get('lat')){
        ctx.instance.lat= currentActiveContext.get('lat');
      }
      if(currentActiveContext.get('lon')){
        ctx.instance.lon= currentActiveContext.get('lon');
      }
      if(currentActiveContext.get('city')){
        ctx.instance.city= currentActiveContext.get('city');
      }
      if(currentActiveContext.get('country')){
        ctx.instance.country= currentActiveContext.get('country');
      }
      ctx.instance.answer = answer;
      ctx.instance.userId = currentUser.id;
      ctx.instance.firstName = currentUser.firstName;
      ctx.instance.lastName = currentUser.lastName;
      ctx.instance.image_url = currentUser.image_url;
      ctx.instance.submittedAt = new Date();
      ctx.instance.createdAt = new Date();
      ctx.instance.type = question.type;
      ctx.instance.order = question.order;
      ctx.instance.questionName = question.name;
      if(answer.segments && answer.segments[0]){
        ctx.instance.first_segment_video_name = answer.segments[0];
      }
      //console.log("ctx.instance.first_segment_video_name", ctx.instance.first_segment_video_name)
      next();
    });
  });

  //
  // This will call after made an entry in answer collection.
  //
  // Create a Topic for that answer in notification service
  // Logined user Subscripe to that topic. So that user can get notification if there any activity in that.
  //
  Answer.observe('after save', function(ctx, next) {

    var isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      // Don't continue if its not a new instance
      return next();
    }

    var loctx = loopback.getCurrentContext();
    var currentUser = loctx && loctx.get('currentUser');
    var instance = ctx.instance;
    Answer.app.models.question.findById(instance.questionId, function(err, question) {
      if (err) {
        throw err;
      }
      var emitData = {
        "answer": instance,
        "currentUser": currentUser,
        "question": question,
        "returnFnc": next,
        "ctx": ctx
      }
      question.answerCount++;
      question.save(function(err, data) {

      })
      Answer.app.models.Notification.createTopicForPost(instance.id, function(err, updatedInstance) {
        if (err) {
          console.log("Error creating topic for post.");
        }
      });
      Answer.emit('newAnswer', emitData);
    });
    //next();
  });

  /*
    Comment API's
  */
  //
  // POST "/:id/comment"
  //
  // post comment to answer.
  // update the same in activity.
  // Notify that comment to answer creator.
  //
  Answer.postComment = function(id, comment, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    this.findById(id,
      function(err, answer) {
        if (err) {
          console.log('Error in getting answer', err);
        }
        var commentSchema = templateConfig[comment.type];
        var validateSchema = v.validate(comment, commentSchema);
        if (!validateSchema.valid) {
          e = new Error(validateSchema.errors);
          e.status = e.statusCode = 422;
          return cb(e);
        }
        var commentObj = {};
        commentObj.type = comment.type;
        commentObj.answerId = answer.id;
        commentObj.questionId = answer.questionId;
        commentObj.comment = comment;
        commentObj.userId = currentUser.id;
        commentObj.firstName = currentUser.firstName;
        commentObj.lastName = currentUser.lastName;
        commentObj.image_url = currentUser.image_url;
        commentObj.public = true;
        commentObj.toUserId = answer.userId;
        commentObj.toUserFirstName = answer.firstName;
        commentObj.toUserlastName = answer.lastName;
        if (comment.type === 'Cloud') {
          commentObj.userRelation = comment.userRelation;
          var instance = {
            toUserId: commentObj.toUserId,
            toUserFirstName: commentObj.toUserFirstName,
            toUserLastName: commentObj.toUserlastName,
            image_url: answer.image_url,
            userRelation: comment.userRelation,
            comment: {
              "words": comment.words
            }
          }
          Answer.app.models.Personality.updateProfileChart(instance);
          //personality chart for all
          instance.userRelation = "all";
          Answer.app.models.Personality.updateProfileChart(instance);
        } else if (comment.type === 'videoComment') {
          comment.url = comment.url.replace("é", "e%CC%81");
          comment.url = comment.url.replace("ú", "u%CC%81");
          commentObj.url = global.config.streamingBase + comment.url;
          commentObj.coverImage = global.config.s3BucketBase + encodeURI(comment.coverImage);
        }
        commentObj.submittedAt = new Date();
        Answer.app.models.comment.create(commentObj, function(err, comment) {
          if (err) {
            console.log("Error in creating comment", err);
            throw err;
          }
          answer.commentCount++;
          answer.save(function(err, data) {
            var activityCommentData = {
              firstName: commentObj.firstName,
              lastName: commentObj.lastName,
              image_url: commentObj.image_url,
              userId: currentUser.id,
              comment: commentObj.comment
            };
            var updateActivityData = {
              count: answer.commentCount,
              comment: activityCommentData
            };
            Answer.emit('updateActivity', answer.id, 'comment', updateActivityData);
          });
          Answer.emit('updateAnswer', answer);
          Answer.app.models.userActivity.emit('newUserActivity', 'newComment', {
            "userId": currentUser.id,
            "resourceId": id
          })
          if (ObjectID(currentUser.id).toString() != ObjectID(answer.userId).toString()) {
            var commentNotifData = notifTag["comment"];
            Answer.app.models.user.findById(answer.userId, function(err, user) {
              if (user && user.userTopicARN) {
                var message = {
                  tagid: commentNotifData.tagid,
                  message: commentNotifData.message.format(commentObj.firstName, answer.questionName),
                  dataobj: {
                    id: ObjectID(answer.id),
                    userid: ObjectID(currentUser.id),//changed for contributor id
                    firstName: commentObj.firstName,
                    lastName: commentObj.lastName,
                    image_url: commentObj.image_url
                  }
                }
                Answer.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                  if (err) {
                    console.log("Error publishing message to topic.");
                  }
                });
                Answer.emit('notification', answer.userId, message, user.userTopicARN);//changed
              }
            })
          }
          cb(null, comment);
        });
      });
  }

  Answer.remoteMethod(
    'postComment', {
      description: 'comment to an answer.',
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
  Answer.listComment = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Answer.app.models.comment.find({
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

  Answer.remoteMethod(
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
  Answer.getComment = function(id, commentId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    Answer.app.models.comment.findById(commentId,
      function(err, comment) {
        if (err) {
          console.log('Error in get comment', err);
          throw err;
        }
        console.log(comment)
        cb(null, comment);
      });

  };

  Answer.remoteMethod(
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
  Answer.deleteComment = function(id, commentId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    Answer.app.models.comment.findById(commentId,
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
        Answer.app.models.comment.destroyById(commentId,
          function(err, comment) {
            if (err) {
              console.log('Error in delete comment', err);
              throw err;
            }
            Answer.findById(id, function(err, answer) {
              answer.commentCount--;
              answer.save(function(err, savedAnswer) {
                Answer.emit('updateActivity', answer.id, 'comment', answer.commentCount);
              })
            })
            cb(null, true);
          });
      });
  };

  Answer.remoteMethod(
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
  // Function to handle like and dislike of an answer
  //
  //
  Answer.like = function(id, isLiked, cb) {
    console.log("isliked console added", isLiked);
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Answer.findById(id,
      function(err, answer) {
        if (err) {
          console.log('Error in getting answer', err);
        }
        Answer.app.models.like.findOne({
          where: {
            answerId: ObjectID(answer.id),
            userId: ObjectID(currentUser.id)
          }
        }, function(err, like) {
          if (like && like.id) {
            like.isLiked = isLiked;
          } else {
            like = new Answer.app.models.like({
              answerId: answer.id,
              questionId: answer.questionId,
              userId: currentUser.id,
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              image_url: currentUser.image_url,
              isLiked: isLiked
            });
          }
          if (isLiked) {
            var likeNotifData = notifTag["like"];
            Answer.app.models.user.findById(answer.userId, function(err, user) {
              if (user && user.userTopicARN && ObjectID(answer.userId).toString() != ObjectID(currentUser.id).toString()) {
                var message = {
                  tagid: likeNotifData.tagid,
                  message: likeNotifData.message.format(currentUser.firstName),
                  dataobj: {
                    id: answer.id,
                    userid: ObjectID(currentUser.id),
                    firstName: currentUser.firstName,
                    lastName: currentUser.lastName,
                    image_url: currentUser.image_url
                  }
                }
                Answer.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                  if (err) {
                    console.log("Error publishing message to topic.");
                  }
                });
                Answer.emit('notification', answer.userId, message, user.userTopicARN);
              }
            });
          }
          like.save(function(err, savedLike) {
            if (isLiked) {
              answer.likeCount++;
            } else if (answer.likeCount && !isLiked) {
              answer.likeCount--;
            }
            answer.save(function(err, savedAnswer) {
              if (err)
                return cb(err)
              var updateActivityData = {
                count: answer.likeCount
              }
              Answer.emit('updateActivity', answer.id, 'like', updateActivityData);
              if (isLiked) {
                Answer.app.models.userActivity.emit('newUserActivity', 'newLike', {
                  "userId": currentUser.id,
                  "resourceId": id
                })
              }
              cb(null, savedAnswer);
            })
          })

        })
      });

  };

  Answer.remoteMethod(
    'like', {
      description: 'like an answer.',
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
        type: "answer",
        root: true
      },
      http: {
        path: '/:id/like',
        verb: 'post',
        status: 200
      }
    }
  );

  //
  // GET "/:id/like"
  //
  // list of like information for the given answer
  //
  Answer.getLikes = function(id, cb) {
    Answer.app.models.like.find({
      where: {
        answerId: id,
        isLiked: true
      }
    }, function(err, likes) {
      if (err)
        return cb(err);
      cb(null, likes);
    })
  }

  Answer.remoteMethod(
    'getLikes', {
      description: 'getlikes on an answer.',
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

  Answer.on('newAnswer', function(emitData) {
    (function(emitData) {
      var answer = emitData['answer'];
      var currentUser = emitData['currentUser'];
      var question = emitData['question'];
      var returnFnc = emitData['returnFnc'];
      var ctx = emitData["ctx"];
      var segments = answer['answer']["segments"];
      var settings = answer['answer']["settings"];
      if (question.type != 'Video') {
        Answer.app.models.activity.createNewActivity(question, answer, "answered", "QUESTION", currentUser, function(err, data) {
          if (err)
            console.log("error in creating new activity", err);
          console.log("answer====", answer);
        })
        if (question.type == 'Cloud') {
          var instance = {
            toUserId: currentUser.id,
            toUserFirstName: currentUser.firstName,
            toUserLastName: currentUser.lastName,
            image_url: currentUser.image_url,
            userRelation: 'myself',
            comment: {
              "words": answer['answer']['words']
            }
          }
          Answer.app.models.Personality.updateProfileChart(instance);
          //all personality chart
          instance.userRelation = "all";
          Answer.app.models.Personality.updateProfileChart(instance);
        }
        returnFnc();
      } else {
        if (answer['answer']['words']) {
          var instance = {
            toUserId: currentUser.id,
            toUserFirstName: currentUser.firstName,
            toUserLastName: currentUser.lastName,
            image_url: currentUser.image_url,
            userRelation: 'myself',
            comment: {
              "words": answer['answer']['words']
            }
          }
          Answer.app.models.Personality.updateProfileChart(instance);
          //all personality chart
          instance.userRelation = "all";
          Answer.app.models.Personality.updateProfileChart(instance);
        }
        var url = global.config.mltService['host'] + global.config.mltService['path'];
        var videoName = unidecode(currentUser.firstName).replace(/ /g, '');
        var theme = answer["answer"]["theme"] || "shrofile";
        var music = answer["answer"]["music"];
        var introtext = answer["answer"]["questionTitle"] || question.name.replace("\n", " ");
        var outroText = "\\#follow" + currentUser.firstName.toProperCase()
        var textoverlay = {
          "intro": introtext,
          "outro": outroText
        }
        var postBody = {
          "segments": segments,
          "name": videoName,
          "settings": settings,
          "theme": theme,
          "textoverlay": textoverlay,
          "music": music
        }
        console.log("in new answer", answer);
        request({
          'method': 'post',
          'url': url,
          'json': true,
          'body': postBody
        }, function(err, data) {
          if (err)
            return;
          console.log(data.body);
          if (data && data.body) {
            Answer.findById(answer.id, function(err, answer) {
              answer.answer.url = data.body.url;
              answer.answer.shareUrl = data.body.url.replace(global.config.streamingBase, global.config.s3BucketBase);
              answer.answer.videoWidth = data.body.width;
              ctx.instance.answer.url = data.body.url;
              ctx.instance.answer.shareUrl = data.body.url.replace(global.config.streamingBase, global.config.s3BucketBase);
              Answer.app.models.user.emit("userVideoCreated",currentUser);
              answer.save(function(err, data) {
                Answer.app.models.activity.createNewActivity(question, answer, "answered", "QUESTION", currentUser, function(err, savedActivity) {
                  if (err)
                    console.log("error in creating new activity", err);
                  if (answer['answer']['comment']) {
                    Answer.postComment(answer.id, answer['answer']['comment'], function(err, data) {
                      console.log("error====", err);
                    })
                  }
                  ctx.instance.answer.shareUrl = savedActivity.resourceInfo.shareUrl;
                  returnFnc();
                })
              })
              Answer.app.models.user.findById(answer.userId, function(err, user) {
                if (err)
                  console.log(err);
                else {
                  var uploadNotifData = notifTag["videoUploaded"];
                  var message = {
                    tagid: uploadNotifData.tagid,
                    message: uploadNotifData.message,
                    dataobj: {
                      url: answer.answer.url,
                      questionId: answer.questionId,
                      answerId: answer.id,
                      userid: answer.userId,
                      firstName: answer.firstName,
                      lastName: answer.lastName,
                      image_url: answer.image_url
                    }
                  }
                  Answer.app.models.Notification.publish(message, currentUser.userTopicARN, function(err, subscribe) {
                    if (err) {
                      console.log("Error publishing message to topic.");
                    }
                  });
                  Answer.emit('notification', answer.userId, message, currentUser.userTopicARN);
                }
              })

            })
          }
        })
      }
      if (emitData['answer'].order == 1 && !currentUser.image_url) {
        Answer.app.models.user.findById(answer.userId, function(err, user) {
          user.image_url = answer.answer.coverImage;
          user.save(function(err, savedUser) {
            console.log("updatedUserError===", err);
            console.log("updatedUser===", savedUser);
            Answer.app.models.user.emit("updateUser", {
              "userId": user.id,
              "image_url": user.image_url
            });
          })
        })
      }
    })(emitData);
  });
  Answer.on('updateActivity', function(resourceId, type, updateActivityData) {
    Answer.app.models.activity.updateActivity(resourceId, type, updateActivityData, function(err, data) {

    })
  })
  Answer.on('notification', function(userId, message, topicArn) {
    Answer.app.models.Notification.saveNotification(userId, message, topicArn);
  })
  Answer.on("threadnotification", function(answerid, message, answerTopicARN, answerUserId, currentUserId) {
    Answer.app.models.comment.find({
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
              resolve(Answer.app.models.Notification.saveNotification(comment.userId, message, answerTopicARN));
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

  //
  // GET "/:id/privacy"
  //
  // Make the answer to private or publically accessible.
  //
  Answer.changePrivacy = function(id, isPublic, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    if (isPublic) {
      Answer.app.models.userActivity.emit('newUserActivity', 'newGeneralAnswer', {
        "userId": currentUser.id,
        "resourceId": id
      })
      Answer.app.models.follower.emit("followerPost",{"userId":currentUser.id,"id":id,"firstName":currentUser.firstName,"lastName":currentUser.lastName,"image_url":currentUser.image_url})
    }
    var updateAnswerPromise = new Promise(function(resolve, reject) {
      Answer.findById(id, function(err, answer) {
        if (err) {
          return reject(err)
        }
        if(answer.public && !isPublic){
            Answer.app.models.userActivity.emit('newUserActivity', 'removeGeneralAnswer', {
              "userId": currentUser.id,
              "resourceId": id
            })
        }
        answer.public = isPublic;
        answer.submittedAt = new Date();
        answer.save(function(err, savedAnswer) {
          if (err) {
            reject(err);
          }
          resolve({
            success: true
          })
        })
      })
    });
    var updateActivityPromise = new Promise(function(resolve, reject) {
      Answer.app.models.activity.findOne({
        where: {
          resourceId: id
        }
      }, function(err, activity) {
        if (err) {
          return reject(err)
        }
        activity.public = isPublic;
        activity.submittedAt = new Date();
        activity.save(function(err, savedActivity) {
          if (err)
            return reject(err)
          resolve({
            success: true
          })
        })
      })
    })
    var promArr = [updateAnswerPromise, updateActivityPromise];
    Promise.all(promArr).then(function(resolveArr) {
      Answer.app.models.user.emit("createPublicVideo",currentUser);
      return cb(null, {
        success: true
      })
    }, function(rejectArr) {
      return cb(rejectArr);
    })
  }

  Answer.changePrivacyV2 = function(id, publicObject, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var isPublic = publicObject.isPublic;
    var communitiesObj = publicObject.communities||{};
    var promArr = [];
    var isCommunityAnswer = false;
    if (isPublic) {
      Answer.app.models.userActivity.emit('newUserActivity', 'newGeneralAnswer', {
        "userId": currentUser.id,
        "resourceId": id
      })
      Answer.app.models.follower.emit("followerPost",{"userId":currentUser.id,"id":id,"firstName":currentUser.firstName,"lastName":currentUser.lastName,"image_url":currentUser.image_url})
    }
    if (Object.keys(communitiesObj).length>0) {
      for (var comid in communitiesObj){
        var bool = communitiesObj[comid];
        console.log("boll==",bool)
        if(bool==true){
          isCommunityAnswer=true;
          break;
        }
      }
    }
    var updateAnswerPromise = new Promise(function(resolve, reject) {
      Answer.findById(id, function(err, answer) {
        if (err) {
          reject(err)
        } else {
          if(answer.public && !isPublic){
              Answer.app.models.userActivity.emit('newUserActivity', 'removeGeneralAnswer', {
                "userId": currentUser.id,
                "resourceId": id
              })
          }
          answer.public = isPublic;
          answer.isCommunityAnswer = isCommunityAnswer;
          answer.submittedAt = new Date();
          answer.save(function(err, savedAnswer) {
            if (err) {
              reject(err);
            } else {
              resolve({
                success: true
              })
            }
          })
        }
      })
    });
    var updateActivityPromise = new Promise(function(resolve, reject) {
      Answer.app.models.activity.findOne({
        where: {
          resourceId: id
        }
      }, function(err, activity) {
        if (err) {
          reject(err)
        } else {
          activity.public = isPublic;
          activity.isCommunityAnswer = isCommunityAnswer;
          activity.submittedAt = new Date();
          activity.save(function(err, savedActivity) {
            if (err)
              reject(err)
            else {
              resolve({
                success: true
              })
            }
          })
        }
      })
    })
    if (Object.keys(communitiesObj).length > 0) {
      for (var communityId in communitiesObj) {
        (function(cid) {
          var uniqueActivityId = id + "_" + cid;
          promArr.push(new Promise(function(resolve, reject) {
            Answer.app.models.communityActivity.findOne({
              where: {
                "uniqueActivityId": uniqueActivityId
              }
            }, function(err, communityActivity) {
              if (err)
                reject()
              else {
                if (communitiesObj[cid] == true) {
                  if (!communityActivity) {
                    var uniqueActivityId = id + "_" + cid;
                    var newCommunityActivity = new Answer.app.models.communityActivity({
                      "uniqueActivityId": uniqueActivityId,
                      "answerId": id,
                      "communityId": cid,
                      "submittedAt": new Date()
                    })
                    newCommunityActivity.save(function(savedNewCommunity) {
                      Answer.app.models.communityActivity.emit("newPostInCommmunity",{"userId":currentUser.id,"communityId":cid,"resourceId":id,"firstName":currentUser.firstName,"lastName":currentUser.lastName})
                      if(!isPublic){
                        Answer.app.models.userActivity.emit('newUserActivity', 'newCommunityAnswer', {
                          "userId": currentUser.id,
                          "communityId": cid,
                          "resourceId": id
                        })
                      }
                      resolve()
                    })
                  } else {
                    resolve()
                  }
                } else if (communitiesObj[cid] == false) {
                  if (communityActivity && communityActivity.uniqueActivityId) {
                    Answer.app.models.userActivity.emit('newUserActivity', 'removeAnswerFromCommunity', {
                      "userId": currentUser.id,
                      "communityId": cid,
                      "resourceId": id
                    })
                    Answer.app.models.communityActivity.deleteById(communityActivity.uniqueActivityId, function() {
                      resolve()
                    })
                  } else {
                    resolve()
                  }
                }
              }
            })
          }))
        })(communityId);
      }
    }
    promArr.push(updateAnswerPromise, updateActivityPromise);
    Promise.all(promArr).then(function(resolveArr) {
      Answer.app.models.user.emit("createPublicVideo",currentUser);
      return cb(null, {
        success: true
      })
    }, function(rejectArr) {
      return cb(rejectArr);
    })
  }

  //
  // POST "/createpersonality"
  //
  Answer.createPersonality = function(cb) {
    this.find({}, function(err, answers) {
      for (var index in answers) {
        (function(index) {
          var answer = answers[index];
          if (answer['answer']['words']) {
            var instance = {
              toUserId: answer.userId,
              toUserFirstName: answer.firstName,
              toUserLastName: answer.lastName,
              image_url: answer.image_url,
              userRelation: 'myself',
              comment: {
                "words": answer['answer']['words']
              }
            }
            Answer.app.models.Personality.updateProfileChart(instance);
            //all personality chart
            instance.userRelation = "all";
            Answer.app.models.Personality.updateProfileChart(instance);
          }
        })(index);
      }
      cb(null, answers);
    })
  }

  //
  // GET /meta
  //
  // Update the Video overlay for all video answer.
  //
  Answer.addVideoMeta = function(limit, offset, cb) {
    this.find({
      where: {
        type: "Video"
      },
      limit: limit,
      offset: offset
    }, function(err, answers) {
      for (var index in answers) {
        (function(index) {
          var answer = answers[index];
          if (answer["questionId"] != "5821d770052ad44445b808ca") {
            var url = global.config.mltService['host'] + global.config.mltService['path'];
            var theme = themesArray[Math.floor(Math.random() * themesArray.length)];
            var videoName = answer.firstName.replace(/ /g, '');
            var textoverlay = {
              "intro": answer.firstName + " " + answer.lastName
            }
            var postBody = {
              "segments": answer.answer.segments,
              "name": videoName,
              "settings": answer.answer.settings,
              "theme": theme,
              "textoverlay": textoverlay
            }
            request({
              'method': 'post',
              'url': url,
              'json': true,
              'body': postBody
            }, function(err, data) {
              console.log(err);
              console.log(data.body);
              if (data && data.body) {
                answer.answer.url = data.body.url;
                answer.save(function(err, savedAnswer) {

                })
              }
            })
          }
        })(index);
      }
      //cb(null,answers)
    })
  }
  Answer.flag = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.findById(id, function(err, answer) {
      if (err)
        return cb(err)
      if (answer) {
        if (!answer.flaggedByid) {
          answer.flaggedByid = [];
          answer.flags = 0;
        }
        if (answer.flaggedByid.indexOf(ObjectID(currentUser.id).toString()) != -1) {
          return cb(null, {
            "success": true,
            "message": "You have already flagged this answer once."
          })
        } else {
          answer.flaggedByid.push(ObjectID(currentUser.id).toString());
          answer.flags += 1;
          answer.save(function(err, savedAnswer) {
            return cb(null, {
              "success": true,
              "message": "We will look into this."
            })
          })
        }
      }
    })
  }
  Answer.getEventDashBoard = function(cb) {
    var eventDate = new Date("February 15, 2017 18:30:00");
    this.find({
      where: {
        "type": "Video",
        "public": true,
        "submittedAt": {
          "gte": eventDate
        }
      },
      order: "submittedAt DESC"
    }, function(err, answers) {
      var returnObj = {
        totalVideos: answers.length,
        totalLikes: 0,
        totalComments: 0,
        mostVideos: [],
        mostLiked: [],
        mostCommented: []
      };
      var videoLeaderBoard = {};
      var likeLeaderBoard = {};
      var commentLeaderBorad = {};

      for (var index in answers) {
        var answer = answers[index];
        returnObj['totalLikes'] += answer.likeCount;
        returnObj['totalComments'] += answer.commentCount;
        var userId = answer.userId;
        if (!videoLeaderBoard[userId]) {
          videoLeaderBoard[userId] = {
            "firstName": answer.firstName,
            "lastName": answer.lastName.charAt(0).toUpperCase(),
            "image_url": answer.image_url,
            "noOfVideos": 0,
            "coverImages": [],
            "videoUrls": []
          };
          likeLeaderBoard[userId] = {
            "firstName": answer.firstName,
            "lastName": answer.lastName.charAt(0).toUpperCase(),
            "image_url": answer.image_url,
            "noOfLikes": 0,
            "coverImages": [],
            "videoUrls": []
          };
          commentLeaderBorad[userId] = {
            "firstName": answer.firstName,
            "lastName": answer.lastName.charAt(0).toUpperCase(),
            "image_url": answer.image_url,
            "noOfComments": 0,
            "coverImages": [],
            "videoUrls": []
          };
        }
        videoLeaderBoard[userId]["image_url"] = answer.image_url;
        likeLeaderBoard[userId]["image_url"] = answer.image_url;
        commentLeaderBorad[userId]["image_url"] = answer.image_url;

        videoLeaderBoard[userId]["noOfVideos"] += 1;
        likeLeaderBoard[userId]["noOfLikes"] += answer.likeCount;
        commentLeaderBorad[userId]["noOfComments"] += answer.commentCount;

        videoLeaderBoard[userId]["coverImages"].push(answer.answer.coverImage);
        likeLeaderBoard[userId]["coverImages"].push(answer.answer.coverImage);
        commentLeaderBorad[userId]["coverImages"].push(answer.answer.coverImage);

        videoLeaderBoard[userId]["videoUrls"].push(answer.answer.url);
        likeLeaderBoard[userId]["videoUrls"].push(answer.answer.url);
        commentLeaderBorad[userId]["videoUrls"].push(answer.answer.url);
      }
      var videoLeaderBoardvals = Object.keys(videoLeaderBoard).map(function(key) {
        return videoLeaderBoard[key];
      });

      var likeLeaderBoardvals = Object.keys(likeLeaderBoard).map(function(key) {
        return likeLeaderBoard[key];
      });

      var commentLeaderBoardvals = Object.keys(commentLeaderBorad).map(function(key) {
        return commentLeaderBorad[key];
      });

      var sortedVideosArr = videoLeaderBoardvals.sort(function(a, b) {
        return b.noOfVideos - a.noOfVideos;
      });
      var sortedLikedArr = likeLeaderBoardvals.sort(function(a, b) {
        return b.noOfLikes - a.noOfLikes;
      });
      var sortedCommentedArr = commentLeaderBoardvals.sort(function(a, b) {
        return b.noOfComments - a.noOfComments;
      });
      returnObj["mostVideos"] = sortedVideosArr.slice(0, 5);
      returnObj["mostLiked"] = sortedLikedArr.slice(0, 5);
      returnObj["mostCommented"] = sortedCommentedArr.slice(0, 5);
      return cb(null, returnObj);
    })
  }
  Answer.on('postAnswerForUser', function(detailObj) {
    var email = detailObj["email"];
    var instance = detailObj["instance"];
    var question = detailObj["question"];
    Answer.app.models.user.findOne({
      where: {
        "email": email
      }
    }, function(err, user) {
      var questionPromise = new Promise(function(resolve, reject) {
        Answer.app.models.question.findOne({
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
        Answer.app.models.AccessToken.findOne({
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
  Answer.checkPrivacy = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Answer.app.models.communityActivity.find({
      where: {
        "answerId": id
      }
    }, function(err, communities) {
      if (err)
        return cb(err)
      else {
        var returnObj = {}
        for (var index in communities) {
          var communityActivity = communities[index];
          returnObj[communityActivity.communityId] = true;
        }
        return cb(null, returnObj)
      }
    })
  }
  Answer.beforeRemote("deleteById", function(ctx, model, next) {
    var answerId = ctx.args.id;
    Answer.findById(answerId, function(err, answer) {
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
        Answer.app.models.activity.destroyAll({
          resourceId: answerId
        }, function(err, data) {
          console.log("dtata==", data)
          resolve();
        })
      });
      var likeActivityPromise = new Promise(function(resolve, reject) {
        Answer.app.models.like.destroyAll({
          answerId: answerId
        }, function(err, data) {
          console.log("dtata==", err)
          resolve();
        })
      });
      var commentActivityPromise = new Promise(function(resolve, reject) {
        Answer.app.models.comment.destroyAll({
          answerId: answerId
        }, function(err, data) {
          console.log("dtata==", err)
          resolve();
        });
      });
      var answerCountPromise = new Promise(function(resolve, reject) {
        Answer.app.models.question.findById(answer.questionId, function(err, question) {

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

  // Answer.removeAllVideos = function(cb){
  //   Answer.find({
  //     where:{
  //
  //     },
  //     offset:700,
  //     limit:100
  //   },function(err,answers){
  //     var delVideosObj ={
  //       Objects:[]
  //     }
  //     for(var index in answers){
  //       var answer = answers[index];
  //       if(answer.type == "Video"){
  //         for(var index in answer.answer.segments){
  //           console.log(answer.answer.segments[index])
  //           if(answer.answer.segments[index].length){
  //           var key = {
  //             Key:answer.answer.segments[index]
  //           }
  //           delVideosObj.Objects.push(key)
  //         }
  //         }
  //         if(answer.answer.url && answer.answer.url.length){
  //         var videoKey = answer.answer.url.split(global.config.streamingBase)[1];
  //           delVideosObj.Objects.push({
  //             Key:videoKey
  //           })
  //         }
  //         var coverImageKey = answer.answer.coverImage.split(global.config.s3BucketBase)[1];
  //         delVideosObj.Objects.push({
  //           Key:coverImageKey
  //         })
  //
  //       }
  //     }
  //     console.log(JSON.stringify(delVideosObj))
  //     s3helper.deleteVideos(delVideosObj,function(err,data){
  //       console.log(err)
  //       console.log(data)
  //       if(err){
  //         reject(err)
  //       }else{
  //         cb();
  //       }
  //     })
  //   })
  // }
};

