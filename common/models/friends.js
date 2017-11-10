//
// We used Friends and Follower concept. Its twitter follow / following concept.
//
// * If I followed someone we called as "Friends". You can see all activity of your friends in your feed.
// * If someone followed me we called as "Follower". Follwer activity will not include in your feed.
// * if both want to see others activity, they have mutually follow each other
//
// All information stroed in "follower" collection.
//
// POST "/:friendId/unfollow"
// GET "/"
// POST "/"
var loopback = require('loopback');
var app = require('../../server/server');
var ObjectID = require('mongodb').ObjectID;
var notifTag = require("../../config/notificationConfig.json");
var format = require('string-format');
format.extend(String.prototype)
module.exports = function(Friend) {

  Friend.disableRemoteMethod("create", true);
  Friend.disableRemoteMethod("upsert", true);
  Friend.disableRemoteMethod("updateAll", true);
  Friend.disableRemoteMethod("updateAttributes", false);

  Friend.disableRemoteMethod("find", true);
  Friend.disableRemoteMethod("findById", true);
  Friend.disableRemoteMethod("findOne", true);

  Friend.disableRemoteMethod("deleteById", true);

  Friend.disableRemoteMethod("confirm", true);
  Friend.disableRemoteMethod("count", true);
  Friend.disableRemoteMethod("exists", true);

  //
  // API to follow a user
  //
  Friend.follow = function(friendId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    app.models.user.findById(friendId, function(err, user) {
      if (err || !user) {
        var error = new Error("The user does not exists.");
        error.status = 422;
        return cb(error);
      } else {
        Follower = Friend.app.models.follower;
        var follower = new Follower();
        follower.userId = currentUser.id;
        follower.followerId = friendId;
        follower.uniqueFollowerId = currentUser.id + friendId;
        follower.userFirstName = currentUser.firstName;
        follower.userLastName = currentUser.lastName;
        follower.userImageUrl = currentUser.image_url;
        follower.followerFirstName = user.firstName;
        follower.followerLastName = user.lastName;
        follower.followerImageUrl = user.image_url;

        var follownotifdata=notifTag["follow"];
        console.log("follownotifdata====",follownotifdata);
        var message = {
          tagid:follownotifdata.tagid,
          message:follownotifdata.message.format(currentUser.firstName),
          dataobj:{
            id:currentUser.id,
            userid:currentUser.id,
            firstName:currentUser.firstName,
            lastName:currentUser.lastName,
            image_url:currentUser.image_url
          }
        }
        Friend.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
          console.log("err===",err);
          if (err) {
            console.log("Error publishing message to topic.",err);
          }
        });
        Friend.emit('notification',user.id,message,currentUser.userTopicARN);

        Friend.app.models.userActivity.emit('newUserActivity','newFollower',{"userId":friendId,"followerId":currentUser.id})
        follower.save(follower, function(err, savedFollower) {
          if (err)
            return cb(err);
          return cb(null, savedFollower);
        });
      }
    });
  }

  //
  // API to unfollow a user
  //
  Friend.unfollowById = function(friendId, cb) {
    Friend.unfollow(friendId, cb);
  }

  Friend.unfollow = function(friendId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var uniqueFollowerId = currentUser.id + friendId;
    app.models.follower.destroyById(uniqueFollowerId, function(err) {
      Friend.app.models.userActivity.emit('newUserActivity','removeFollower',{"userId":friendId,"followerId":currentUser.id})
      if (err)
        return cb(err);
      else
        return cb(null);
    });
  }

  Friend.removeFollower =function(id,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var uniqueFollowerId= id+currentUser.id;
    app.models.follower.destroyById(uniqueFollowerId, function(err) {
      Friend.app.models.userActivity.emit('newUserActivity','removeFollower',{"userId":currentUser.id,"followerId":id})
      if (err)
        return cb(err);
      else
        return cb(null,{"success":true});
    });
  }

  Friend.listFollowing = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    return Friend.myFriends(currentUser.id, cb)
  };

  //
  // List all my friends
  //
  Friend.myFriends = function(id, cb) {
    app.models.follower.find({
      where: {
        userId: ObjectID(id)
      }
    }, function(err, followers) {
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
  Friend.on('notification',function(userId,message,topicArn){
    Friend.app.models.Notification.saveNotification(userId,message,topicArn);
  })
};
