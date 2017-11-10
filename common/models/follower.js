//
//
//
// GET "/"
var loopback = require('loopback');
var app = require('../../server/server');
var ObjectID = require('mongodb').ObjectID;
var notifTag = require("../../config/notificationConfig.json")
module.exports = function(Follower) {

  Follower.disableRemoteMethod("create", true);
  Follower.disableRemoteMethod("upsert", true);
  Follower.disableRemoteMethod("updateAll", true);
  Follower.disableRemoteMethod("updateAttributes", false);

  Follower.disableRemoteMethod("find", true);
  Follower.disableRemoteMethod("findById", true);
  Follower.disableRemoteMethod("findOne", true);

  Follower.disableRemoteMethod("deleteById", true);

  Follower.disableRemoteMethod("confirm", true);
  Follower.disableRemoteMethod("count", true);
  Follower.disableRemoteMethod("exists", true);

  Follower.validatesPresenceOf('userId', 'followerId');

  //
  // List all my follower
  // GET "/"
  //
  Follower.listFollowers = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    return Follower.myFollowers(currentUser.id, null, null, cb);
  }

  Follower.isFollowing=function(friendId,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var id=currentUser.id + friendId;
    this.findById(id,function(err,follower){
      if(err)
        return cb(err);
      var returnObj=  {"isFollowing":false};
      if(follower && follower.id){
        returnObj.isFollowing=true;
        return cb(null,returnObj);
      }
      return cb(null,returnObj);
    });
  }

  Follower.myFollowers = function(id, limit, offset, cb) {
    var userId = id;
    var filterObj = {
      where: {
        followerId: userId
      },
      fields: {
        userFirstName: 1,
        userLastName: 1,
        userImageUrl:1,
        userId:1
      }
    };
    if (offset)
      filterObj.offset = offset;
    if (limit)
      filterObj.limit = limit;
    this.find(filterObj, function(err, followers) {
      if (err)
        return cb(err);
      return cb(null, followers);
    });
  };

  Follower.getFriendsIamFollowing = function(id,limit, offset, cb) {
    var filterObj = {
      where: {
        userId: id
      }
    };
    if (offset)
      filterObj.offset = offset;
    if (limit)
      filterObj.limit = limit;
    this.find(filterObj, function(err, followers) {
      if (err)
        return cb(err);

      var followerIds = [];
      followers.forEach(function(follower) {
        var f = follower.toJSON();
        followerIds.push(f.followerId.toString());
      });
      return cb(null, followerIds);
    });
  };
  Follower.on("followerPost",function(data){
    Follower.myFollowers(data.userId,null,null,function(err,followers){
      if(followers && followers.length){
        var newPostNotifData = notifTag["followerPost"]
        for(var index in followers){
          (function(index){
            var follower = followers[index];
            Follower.app.models.user.findById(JSON.parse(JSON.stringify(follower)).userId,function(err,user){
              var message={
                tagid:newPostNotifData["tagid"],
                message:newPostNotifData["message"].format(data.firstName),
                dataobj:{
                  "id":data.id,
                  "userId":data.userId,
                  "userid":data.userId,
                  "firstName":data.firstName,
                  "lastName":data.lastName,
                  "image_url":data.image_url
                }
              }
              Follower.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing message to topic.");
                }
              });
              Follower.app.models.Notification.saveNotification(user.id, message, user.userTopicARN);
            })
          })(index)
        }
      }
    })
  })
};
