//
// This model stores messages in a conversation.
//
// GET "/"
// GET "/:userId"
// POST "/:userId"
//
var app = require('../../server/server');
var dataSource = app.datasources.db;
var loopback = require('loopback');
var HTTPClient = require('httpclient');
var Validator = require('jsonschema').Validator;
var v = new Validator();
var ObjectID = require('mongodb').ObjectID;
var notifTag = require("../../config/notificationConfig.json");
var s3helper = require('../lib/s3helper.js');
var mltServiceOptions = {
  hostname: global.config.mltServiceHost,
  path: '/',
  port: 80,
  secure: false,
  method: 'POST'
}

module.exports = function(Message) {

  Message.disableRemoteMethod("create", true);
  Message.disableRemoteMethod("upsert", true);
  Message.disableRemoteMethod("updateAll", true);
  Message.disableRemoteMethod("updateAttributes", false);

  Message.disableRemoteMethod("find", true);
  Message.disableRemoteMethod("findById", true);
  Message.disableRemoteMethod("findOne", true);

  Message.disableRemoteMethod("confirm", true);
  Message.disableRemoteMethod("count", true);
  Message.disableRemoteMethod("exists", true);

  Message.validatesPresenceOf('message', 'conversationId', 'fromId', 'toId');

  //
  // get all private message of logged in user.
  //
  Message.listAllMessages = function(cb) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    console.log("currentUser===", currentUser)
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      cb(e)
    }
    Message.app.models.message.find({
      where: {
        or: [{
            toId: ObjectID(currentUser.id)
          },
          {
            fromId: ObjectID(currentUser.id)
          }
        ]
      },
      order: 'submittedAt DESC'
    }, function(err, messages) {
      if (err) {
        console.log("Error in get messages by conversationIds.", err);
        return cb(err);
      }
      var returnArr = [];
      var conversationObj = {};
      for (var index in messages) {
        var message = messages[index];
        if (!conversationObj[message.conversationId]) {
          conversationObj[message.conversationId] = message;
          returnArr.push(message);
        }
      }
      return cb(null, returnArr);
    });
  }

  //
  // get all private messages between logged-in user and given user.
  //
  Message.getConversation = function(userId, cb) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      throw e;
    }
    console.log("currentUser.id===", currentUser.id);
    console.log("userid====", userId)
    Message.app.models.conversation.findOne({
      where: {
        or: [{
          and: [{
            userOne: userId
          }, {
            userTwo: currentUser.id
          }]
        }, {
          and: [{
            userOne: currentUser.id
          }, {
            userTwo: userId
          }]
        }]
      },
      limit: 1
    }, function(err, conversation) {
      if (err || !conversation) {
        console.log("err", err);
        // There is no conversations for this user.
        return cb(null, []);
      }
      console.log("conversation====", conversation);
      Message.find({
        where: {
          conversationId: conversation.id
        },
        order: 'submittedAt ASC'
      }, function(err, message) {
        if (err) {
          console.log("Error in get message by conversation id.", err);
          return cb(err);
        }
        return cb(null, message);
      })
    });
  }

  //
  // Send a private message to the given user.
  //
  Message.postConversation = function(userId, message, type, url, coverImage, cb) {

    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      throw e;
    }
    var conversationObj = {};
    conversationObj.userOne = currentUser.id;
    conversationObj.userTwo = userId;

    Message.app.models.conversation.findOrCreate({
      where: {
        or: [{
          and: [{
            userOne: userId
          }, {
            userTwo: currentUser.id
          }]
        }, {
          and: [{
            userOne: currentUser.id
          }, {
            userTwo: userId
          }]
        }]
      },
      limit: 1
    }, conversationObj, function(err, conversation) {

      if (err) {
        return cb(null, err);
      }
      var messageObj = {};
      messageObj.message = message;
      if (type) {
        messageObj.type = type;
      } else {
        messageObj.type = "Text";
      }
      if (messageObj.type == "Video") {
        messageObj.url = global.config.streamingBase + url;
        messageObj.coverImage = global.config.s3BucketBase + coverImage;
      }
      if(message == "updateInfoRem"){
        var remNumber = conversation.remNumber || 0;
        remNumber+=1;
        if(remNumber>4){
          remNumber=1;
        }
        conversation.remNumber = remNumber;
        conversation.type = "updateInfoRem";
        conversation.save(function(err,savedConversation){
        })
        messageObj.updateInfoRem=true;
        messageObj.message = notifTag["updateInfoMsg"][remNumber];
      }
      Message.app.models.user.findById(userId, function(err, data) {
        messageObj.fromId = currentUser.id;
        messageObj.fromFirstName = currentUser.firstName;
        messageObj.fromLastName = currentUser.lastName;
        messageObj.fromImageUrl = currentUser.image_url;
        messageObj.toId = userId;
        messageObj.conversationId = conversation.id;
        if (data && !err) {
          messageObj.toFirstName = data.firstName;
          messageObj.toLastName = data.lastName;
          messageObj.toImageUrl = data.image_url;
        }
        Message.create(messageObj, function(err, newmessage) {
          if (err) {
            console.log("error in creating new message obj.",err);
            return cb(err);
          }
          var pmNotifData = notifTag["privatemessage"];
          if (data.userTopicARN) {
            var message = {
              tagid: pmNotifData.tagid,
              message: pmNotifData.message.format(messageObj.fromFirstName),
              dataobj: {
                id: messageObj.fromId,
		userid: messageObj.fromId,
                firstName: messageObj.fromFirstName,
                lastName: messageObj.fromLastName,
                image_url: messageObj.fromImageUrl
              }
            }
            Message.app.models.Notification.publish(message, data.userTopicARN, function(err, subscribe) {
              if (err) {
                console.log("Error publishing message to topic.");
              }
            });
            Message.app.models.Answer.emit('notification', userId, message, data.userTopicARN);
          }
          return cb(null, newmessage)
        });
      })
    });
  }

  Message.observe('before save', function(ctx, next) {

    var isNew = ctx.instance && ctx.isNewInstance;

    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }

    if (isNew) {
      ctx.instance.submittedAt = new Date();
    }

    return next();

  });

  Message.beforeRemote("deleteById", function(ctx, model, next) {
    var messageId = ctx.args.id;
    Message.findById(messageId,function(err,message){
      if(message.type=="Video"){
        var delVideosObj = {
          Objects: []
        }
        var videoKey = message.url.split(global.config.streamingBase)[1];
        var coverImageKey = message.coverImage.split(global.config.s3BucketBase)[1];
        delVideosObj.Objects.push({
          Key: videoKey
        })
        delVideosObj.Objects.push({
          Key: coverImageKey
        })
        s3helper.deleteVideos(delVideosObj, function(err, data) {
          console.log(err)
          console.log(data)
          next()
        })
      }else{
        next()
      }
    })
  })
  Message.sendProfileUpdateMessage = function(cb){
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      throw e;
    }
    Message.app.models.user.find({
      where:{
        "or":[
          {
            "educationList":{"exists":false}
          },
          {
            "experienceList":{"exists":false}
          }
        ]
      },
      fields:{
        id:true,
        firstName:true
      }
    },function(err,users){
      for(var index in users){
        (function(index){
          var user = users[index];
          var message = "updateInfoRem"
          Message.postConversation(user.id,message,"text",null,null,function(err,data){
          })
        })(index)
      }
    })
    cb(null,{"success":true})
  }
};
