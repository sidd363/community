'use strict';
let loopback = require('loopback');
let ObjectID = require('mongodb').ObjectID;
var notifTag = require("../../config/notificationConfig.json");
module.exports = function(Recommendation) {

  //when one asks for recommendation then notification will be sent to whom one has asked for//means in case of status of invitation
  //when one gives recommendation to someone then also one will get notified.//means status recommended 

  // Call this before entry the data in Recommendation model.
  //
  // here we validate the required fields.
  //
  Recommendation.observe('before save', function(ctx, next) {
    let instance = ctx.instance && ctx.isNewInstance;
    console.log("instance in recommendation ==>>", instance);
    if (!instance) {
      return next();
    }
    let e;
    let currentActiveContext = loopback.getCurrentContext();
    let currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    if(ctx.instance.recommendedObj && ctx.instance.status.toLowerCase().includes("recommended")){
      console.log("date object appended==>")
      ctx.instance.recommendedObj.updatedAt = new Date()
    }
    if(ctx.instance.invitationObj &&  ctx.instance.status.toLowerCase().includes("invited")){
      console.log("invitationObj object appended==>")
      ctx.instance.invitationObj.invitedAt = new Date()
    }
    next();
  });

  //
  // This will call after made an entry in Recommendation collection.
  //
  //  a Topic for that Recommendation in notification service
  //
  Recommendation.observe('after save', function(ctx, next) {
    let isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      // Don't continue if its not a new instance
      return next();
    }

    let loctx = loopback.getCurrentContext();
    let currentUser = loctx && loctx.get('currentUser');
    let instance = ctx.instance;
    console.log("instance in recommendation afterRemote", instance, "currentUser in recommendation afterRemote",  currentUser);
    if(instance && instance.status ){
      console.log("recommended status====>>>>>", instance.status);
      let userToBeNotified;
      if(instance.status.toLowerCase().includes("recommended")){
        userToBeNotified =  instance.recommendedTo ? instance.recommendedTo : "";
      }else if(instance.status.toLowerCase().includes("invited")){
        userToBeNotified =  instance.recommendedBy ? instance.recommendedBy : "";
      }
      //let recommendedTo =  instance.recommendedTo ? instance.recommendedTo : "";
      //send notification to user  by finding user
      Recommendation.app.models.user.findById(userToBeNotified, function(err, data) {
        if (err) {
          console.log("error in getting user", err)
        } else {
          console.log("success in getting user", data)
          //
          let recommendedNotifData;
          if(instance.status.toLowerCase().includes("recommended")){
            recommendedNotifData = notifTag["recommended"];
          }else if(instance.status.toLowerCase().includes("invited")){
            recommendedNotifData = notifTag["inviteRecommendedMsg"];
          }
          /*{
            "_id" : ObjectId("59f04f7aab22a62b693a8237"),
            "topicArn" : "arn:aws:sns:ap-south-1:224236965178:59ca174844e932fe4b3a559f",
            "message" : {
              "tagid" : 5,
              "message" : "Sumit messaged you!",
              "dataobj" : {
                "id" : ObjectId("59cb4f0e8781b81014b2731a"),
                "userid" : ObjectId("59cb4f0e8781b81014b2731a"),
                "firstName" : "Sumit",
                "lastName" : "Marwah",
                "image_url" : "https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1508825570102.png"
              }
            },
            "userId" : "59ca174844e932fe4b3a559f",
            "submittedAt" : ISODate("2017-10-25T08:46:50.945Z")
          }
          */
          if (data.userTopicARN) {
            var message = {
              tagid: recommendedNotifData.tagid,
              message: recommendedNotifData.message.format(currentUser.firstName),
              dataobj: {
                id: currentUser.id,
                userid: currentUser.id,//contributor id i.e recommended by
                firstName: currentUser.firstName,
                lastName: currentUser.lastName,
                image_url: currentUser.image_url
              }
            }
            console.log("message to save in notification ==>>>", JSON.stringify(message));
            Recommendation.app.models.Notification.publish(message, data.userTopicARN, function(err, subscribe) {
              if (err) {
                console.log("Error publishing  Recommendation message to topic.");
              }else{
                console.log("subscribe publishing  Recommendation message to topic.", subscribe);
              }
            });
          }
          Recommendation.app.models.Notification.saveNotification(data.id, message, data.userTopicARN, function(err, success) {
            if (err) {
              console.log("Error saving  Recommendation message to collection of notification.", err);
            }else{
              console.log("success publishing  Recommendation message to topic.", success);
            }
          });
        }
      });
    }
    next();
  });

  //update logic from invited to accepted
  Recommendation.beforeRemote('*.updateAttributes', function(ctx, model, next) {
    console.log("here before remote update in Recommendation", ctx.req.params.id, " ctx.req.body;==>>",  ctx.req.body);
    let e;
    let currentActiveContext = loopback.getCurrentContext();
    let currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    if(ctx.req.body.recommendedObj){
      ctx.req.body.recommendedObj.updatedAt = new Date();
    }
    next()
  });
  Recommendation.afterRemote('*.updateAttributes', function(ctx, model, next) {
    console.log("here in update after ", ctx.req.body);
    var reqBody = ctx.req.body;
    let loctx = loopback.getCurrentContext();
    let currentUser = loctx && loctx.get('currentUser');
    console.log("reqBody ===>>", reqBody,"model==>>>", model, currentUser);
    //update cases from invited to recommended or from recommended to active
    if(reqBody.status){
      if(reqBody.status.toLowerCase().includes("recommended")){
        console.log("it means prior status was invited"); 
        let recommendedTo =  model.recommendedTo ? model.recommendedTo : "";
        Recommendation.app.models.user.findById(recommendedTo, function(err, data) {
          if (err) {
            console.log("error in getting user", err)
          } else {
            console.log("success in getting user", data);
            let recommendedNotifData = notifTag["recommended"];
            /*{
              "_id" : ObjectId("59f04f7aab22a62b693a8237"),
              "topicArn" : "arn:aws:sns:ap-south-1:224236965178:59ca174844e932fe4b3a559f",
              "message" : {
                "tagid" : 5,
                "message" : "Sumit messaged you!",
                "dataobj" : {
                  "id" : ObjectId("59cb4f0e8781b81014b2731a"),
                  "userid" : ObjectId("59cb4f0e8781b81014b2731a"),
                  "firstName" : "Sumit",
                  "lastName" : "Marwah",
                  "image_url" : "https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1508825570102.png"
                }
              },
              "userId" : "59ca174844e932fe4b3a559f",
              "submittedAt" : ISODate("2017-10-25T08:46:50.945Z")
            }
            */
            if (data.userTopicARN) {
              var message = {
                tagid: recommendedNotifData.tagid,
                message: recommendedNotifData.message.format(currentUser.firstName),
                dataobj: {
                  id: currentUser.id,
                  userid: currentUser.id,//contributor id i.e recommended by
                  firstName: currentUser.firstName,
                  lastName: currentUser.lastName,
                  image_url: currentUser.image_url
                }
              }
              console.log("message to save in notification ==>>>", JSON.stringify(message));
              Recommendation.app.models.Notification.publish(message, data.userTopicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing  Recommendation message to topic.");
                }else{
                  console.log("subscribe publishing  Recommendation message to topic.", subscribe);
                }
              });
            }
            Recommendation.app.models.Notification.saveNotification(data.id, message, data.userTopicARN, function(err, success) {
              if (err) {
                console.log("Error saving  Recommendation message to collection of notification.", err);
              }else{
                console.log("success publishing  Recommendation message to topic.", success);
              }
            });
          }
        });
      }
    }
    next();
  });
};
