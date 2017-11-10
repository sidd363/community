var searchClient = require("../lib/elasticsearch")
var loopback = require('loopback');
var app = require('../../server/server');
var ObjectID = require('mongodb').ObjectID;
var Promise = require("bluebird");
var notifTag = require("../../config/notificationConfig.json");
module.exports = function(Community) {
  Community.disableRemoteMethod("__create__members", true);
  Community.disableRemoteMethod("__get__members", true);
  Community.disableRemoteMethod("find", true);
  Community.disableRemoteMethod("findById", true);
  Community.disableRemoteMethod("findOne", true);

  Community.validatesInclusionOf('type', { in: ['open', 'closed', 'hidden']
  });
  Community.beforeRemote('create', function(ctx, accessToken, next) {
    ctx.req.body.createdAt = new Date();
    ctx.req.body.coverImageUrl = global.config.s3BucketBase + ctx.req.body.coverImageUrl;
    next()
  });
  Community.beforeRemote('*.updateAttributes', function(ctx, model, next) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    Community.app.models.member.findOne({
      where: {
        communityId: ctx.req.params.id,
        userId: currentUser.id
      }
    }, function(err, member) {
      if (member && member.role == "admin") {
        if (ctx.req.body && ctx.req.body.coverImageUrl && ctx.req.body.coverImageUrl.indexOf(global.config.s3BucketBase) == -1) {
          ctx.req.body.coverImageUrl = global.config.s3BucketBase + ctx.req.body.coverImageUrl;
        }
        next()
      } else {
        e = new Error('You are not authorised for this action');
        e.status = e.statusCode = 401;
        return next(e);
      }
    })
  });
  Community.afterRemote('create', function(ctx, model, next) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    console.log(model)
    var adminMember = {
      "firstName": currentUser.firstName,
      "lastName": currentUser.lastName,
      "image_url": currentUser.image_url,
      "userId": currentUser.id,
      "userTopicARN":currentUser.userTopicARN,
      "status": "approved",
      "communityId": model.id,
      "communityName": model.name,
      "communityCoverImageUrl": model.coverImageUrl,
      "role": "admin",
      "joiningDate": new Date()
    }
    var newMember = new Community.app.models.member(adminMember);
    newMember.save(function(savedNewMember) {

    })
    Community.emit('newCommunity', model);
    next();
  })
  Community.on('newCommunity', function(model) {
    var indexBody = {
      "name": model.name,
      "id": model.id,
      "type": model.type,
      "coverImageUrl": model.coverImageUrl
    }
    searchClient.index("community", model.id, indexBody, function(err, resp) {
      console.log(resp);
    })

  })
  Community.addMembers = function(id, groupMembers, cb) {
    console.log("here");
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    var e;
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    this.findById(id, function(err, community) {
      if (community.type == "closed") {
        Community.app.models.member.findOne({
          where: {
            communityId: id,
            userId: currentUser.id
          }
        }, function(err, adminMember) {
          console.log("member consoleeed==", JSON.stringify(adminMember));
          if (adminMember && adminMember.role != "admin") {
            e = new Error('You are not authorised to add users');
            e.status = e.statusCode = 401;
            return cb(e);
          } else {
            for (var index in groupMembers) {
              (function(i) {
                var member = groupMembers[i];
                var userId = ObjectID(member.userid)
                member.status = "approved";
                var normalMember = {
                  "firstName": member.firstName,
                  "lastName": member.lastName,
                  "image_url": member.image_url,
                  "userId": userId,
                  "status": "approved",
                  "communityId": id,
                  "communityName": community.name,
                  "communityCoverImageUrl": community.coverImageUrl,
                  "role": member.role,
                  "userTopicARN":member.userTopicARN,
                  "joiningDate": new Date()
                }
                console.log("coes to adding");
                Community.app.models.userActivity.emit('newUserActivity', 'addUserToCommunity', {
                  "userId": userId,
                  "communityId": id
                })
                var newMember = new Community.app.models.member(normalMember);
                newMember.save(function(err, savedNewMember) {
                  Community.emit("addedToCommunity", savedNewMember, adminMember);
                })
              })(index);
            }
          }
          return cb(null, {
            "success": true
          })
        })
      } else if (community.type == "open") {
        var promArr = [];
        for (var index in groupMembers) {
          (function(i) {
            var member = groupMembers[i];
            if (typeof member.userid == "string") {
              console.log(member)
              console.log(ObjectID(member.userid))
              var userId = ObjectID(member.userid).toString()
              var normalMember = {
                "firstName": member.firstName,
                "lastName": member.lastName,
                "image_url": member.image_url,
                "userId": member.userid,
                "status": "approved",
                "communityId": id,
                "communityName": community.name,
                "communityCoverImageUrl": community.coverImageUrl,
                "role": member.role,
                "userTopicARN":member.userTopicARN,
                "joiningDate": new Date()
              }
              var newMember = new Community.app.models.member(normalMember);
              Community.app.models.userActivity.emit('newUserActivity', 'addUserToCommunity', {
                "userId": userId,
                "communityId": id
              })
              promArr.push(new Promise(function(resolve, reject) {
                newMember.save(function(err, savedNewMember) {
                  Community.emit("addedToCommunity", savedNewMember,currentUser);
                  resolve();
                })
              }))
            }
          })(index);
        }
        Promise.all(promArr).then(function(resolveArr) {
          Community.emit('updateMemberCount', id);
          return cb(null, {
            "success": true
          })
        })
      }
    })
  }
  Community.on('updateMemberCount', function(id) {
    Community.findById(id, function(err, community) {
      var promArr = [];
      var memberCountPromise = new Promise(function(resolve, reject) {
        Community.app.models.member.count({
          communityId: id
        }, function(err, count) {
          if (err)
            reject(err)
          else {
            resolve(count)
          }
        })
      });
      var approvedMemberCountPromise = new Promise(function(resolve, reject) {
        Community.app.models.member.count({
          communityId: id,
          status: "approved"
        }, function(err, count) {
          if (err)
            reject(err)
          else {
            resolve(count)
          }
        })
      });
      promArr = [memberCountPromise, approvedMemberCountPromise];
      Promise.all(promArr).then(function(resolveArr) {
        community.memberCount = resolveArr[0];
        community.approvedMemberCount = resolveArr[1];
        community.save(function() {})
      })
    })
  })
  Community.joinCommunity = function(id, cb) {
    console.log("joinCommunity")
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    var member = {
      "firstName": currentUser.firstName,
      "lastName": currentUser.lastName,
      "image_url": currentUser.image_url,
      "userId": currentUser.id,
      "communityId": id,
      "role": "member",
      "userTopicARN":currentUser.userTopicARN,
      "joiningDate": new Date()
    }
    this.findById(id, function(err, community) {
      if (community.type == "open") {
        member.status = "approved";
      } else if (community.type == "closed") {
        member.status = "submitted";
      }
      member.communityName = community.name;
      member.communityCoverImageUrl = community.coverImageUrl;
      console.log("member====", member)
      var newMember = new Community.app.models.member(member);
      newMember.save(function(err,savedNewMember) {
        console.log("savedNewMember==", savedNewMember)
        var returnObj = {};
        if (member.status == "approved") {
          returnObj = {
            "success": true,
            "message": "You have successfully joined this group"
          }
          Community.app.models.userActivity.emit('newUserActivity', 'addUserToCommunity', {
            "userId": currentUser.id,
            "communityId": id
          })
        } else {
          Community.emit('approvalRequest',community,savedNewMember);
          returnObj = {
            "success": false,
            "message": "Your request has been submitted to the admmin of this community"
          }
        }
        return cb(null, returnObj)
      })
    })
  }
  Community.getTrendingCommunities = function(cb) {
    this.find({
      where: {
        "approvedMemberCount": {
          gt: 0
        }
      }
    }, function(err, comunityList) {
      if (err)
        return cb(err)
      return cb(null, comunityList);
    })
  }
  Community.searchCommunities = function(query, cb) {
    var returnArr = [];
    if (query && query.searchName) {
      var queryObj = {
        "query": {
          "match": {
            "name": query.searchName
          }
        }
      }
      searchClient.search("community", queryObj, function(err, data) {
        console.log("data====", data);
        data.hits.hits.forEach(function(hit) {
          console.log(hit._source)
          returnArr.push(hit._source);
        })
        return cb(null, returnArr);
      })
    } else {
      return cb(null, returnArr)
    }
  }
  Community.getCommunityDetails = function(id, cb) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    console.log(currentUser)
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return cb(e);
    }
    var adminPromise = new Promise(function(resolve, reject) {
      Community.app.models.member.findOne({
        where: {
          communityId: id,
          userId: currentUser.id
        }
      }, function(err, member) {
        if (err)
          reject(err)
        else
          resolve(member)
      })
    });
    var communityDetailsPromise = new Promise(function(resolve, reject) {
      Community.findById(id, function(err, community) {
        if (err)
          reject(err)
        else
          resolve(community)
      })
    })
    var communityFeedPromise = new Promise(function(resolve, reject) {
      Community.app.models.communityActivity.find({
        where: {
          communityId: id
        }
      }, function(err, answers) {
        var answerdIdArr = []
        console.log(answers);
        if (answers && answers.length) {
          var innerPromArr = [];
          var answerdIdArr = [];
          for (var index in answers) {
            var answerId = answers[index].answerId;
            answerdIdArr.push(answerId)
          }
          console.log(answerdIdArr)
          Community.app.models.activity.find({
            where: {
              resourceId: {
                inq: JSON.parse(JSON.stringify(answerdIdArr))
              }
            }
          }, function(err, feed) {
            console.log("err==", err)
            console.log("fedd===", feed);
            if (err)
              reject(err)
            else {
              resolve(feed);
            }
          })
        } else {
          resolve(answerdIdArr)
        }
      })
    })
    var myLikesPromise = new Promise(function(resolve, reject) {
      Community.app.models.like.find({
        where: {
          userId: ObjectID(currentUser.id),
          isLiked: true
        },
        fields: {
          answerId: 1,
          _id: 0
        },
      }, function(err, data) {
        if (err)
          reject(err);
        else {
          var returnArr = [];
          for (var index = 0; index < data.length; index++) {
            returnArr.push(data[index].answerId.toString())
          }
          resolve(returnArr);
        }
      })
    });
    var promArr = [adminPromise, communityDetailsPromise, communityFeedPromise,myLikesPromise];
    Promise.all(promArr).then(function(resolveArr) {
      var member = resolveArr[0];
      var comunityDetails = resolveArr[1];
      console.log("comunityDetails====",comunityDetails)
      comunityDetails.isJoined = true;
      comunityDetails.isAdmin = false;
      comunityDetails.feed = resolveArr[2];
      var myLikes = resolveArr[3]
      if (member == null) {
        comunityDetails.isJoined = false;
      }
      if (comunityDetails.type = "closed" && (member && member.status != "approved")) {
        comunityDetails.isJoined = false;
        comunityDetails.requestStatus = member.status;
        comunityDetails.feed = [];
      }
      if (member && member.role == 'admin'){
        comunityDetails.isAdmin = true;
      }
      for (var index = 0; index < comunityDetails.feed.length; index++) {
        var resourceInfoAnswerId = comunityDetails.feed[index]['resourceInfo']['answerId'];
        comunityDetails.feed[index]['resourceInfo']['isLiked'] = false;
        if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
          comunityDetails.feed[index]['resourceInfo']['isLiked'] = true;
        }
      }
      console.log("comunityDetails====",comunityDetails)
      return cb(null, comunityDetails);
    })
  }
  Community.getMembers = function(id, cb) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return cb(e);
    }
    Community.app.models.member.findOne({
      where: {
        communityId: id,
        userId: currentUser.id
      }
    }, function(err, member) {
      if (err)
        return cb(err)
      else {
        var filterObj = {
          where: {
            communityId: id
          }
        }
        if (member && member.role == "member") {
          filterObj.where.status = "approved";
        };
        Community.app.models.member.find(filterObj, function(err, members) {
          if (err)
            return cb(err)
          else
            return cb(null, members)
        })
      }
    })
  }
  Community.leaveCommunity = function(id, cb) {
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return cb(e);
    }
    Community.app.models.member.findOne({
      where: {
        communityId: id,
        userId: currentUser.id
      }
    }, function(err, member) {
      if (member && member.role == "admin") {
        Community.app.models.member.count({
          communityId: id,
          role: "admin"
        }, function(err, count) {
          if (count == 1) {
            return cb(null, {
              success: false,
              message: "Since you are the only admin, you cannot leave the community till you assign another admin"
            });
          } else {
            Community.app.models.member.deleteById(member.id, function(err, member) {
              Community.findById(id, function(err, community) {
                community.memberCount--;
                community.approvedMemberCount--;
                Community.app.models.userActivity.emit('newUserActivity', 'removeUserFromCommunity', {
                  "userId": currentUser.id,
                  "communityId": community.id
                })
                community.save(function(savedComunity) {
                  return cb(null, {
                    success: true
                  });
                })
              })
            })
          }
        })
      } else {
        Community.app.models.member.deleteById(member.id, function(err, member) {
          Community.findById(id, function(err, community) {
            community.memberCount--;
            community.approvedMemberCount--;
            community.save(function(savedComunity) {
              return cb(null, {
                success: true
              });
            })
          })
        })
      }
    })
  }
  Community.on("addedToCommunity", function(member, adminMember) {
      console.log("member and member && member.userTopicARN in added to community", member , member.userTopicARN)
      if (member && member.userTopicARN) {
        var userAddedNotifData = notifTag["addedToCommunity"];
        var message = {
          tagid: userAddedNotifData.tagid,
          message: userAddedNotifData.message.format(adminMember.firstName, member.communityName),
          dataobj: {
            id: member.communityId,
            userId: adminMember.userId//added to community by sidd
          }
        };
        console.log("member.userId ,", member.userId," member.userTopicARN" ,member.userTopicARN, "message", message);
        Community.app.models.Notification.publish(message, member.userTopicARN, function(err, subscribe) {
          if (err) {
            console.log("Error publishing message to topic.");
          }
        })
        Community.app.models.Notification.saveNotification(member.userId,message,member.userTopicARN);
      }
  });
  Community.on('approvalRequest',function(community,newMember){
    Community.app.models.member.findOne({
      where:{
        communityId:community.id,
        "role":"admin"
      }
    },function(err,adminMember){
      if(adminMember && adminMember.userId){
          if(adminMember.userTopicARN){
            //console.log("newMember consolled====>>", newMember);
            var approvalRequestNotifData = notifTag["communityApprovalRequest"];
            var message={
              "tagid":approvalRequestNotifData.tagid,
              "message":approvalRequestNotifData.message.format(newMember.firstName,community.name),
              dataobj: {
                id: community.id,
                userId: newMember.userId//added to community by sidd
              }
            }
            Community.app.models.Notification.saveNotification(adminMember.userId,message,adminMember.userTopicARN);
          }
      }
    })
  })
};
