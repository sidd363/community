var loopback = require('loopback');
var Promise = require("bluebird");
var ObjectID = require('mongodb').ObjectID;
var redis = require("../lib/redis.js")
var _ = require('lodash');
module.exports = function(Activity) {
  /*the return object comprises of 4 objects
    1. One unanswered question for the user viewing the feed
    2. Activities of followers followed by activities of all shrofiles with different conditions based on trending near you and for you
    3. For now all trending,near you and for you will have the same objects.
  */
  Activity.myFeed = function(type, offset, limit, cb) {
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    if (offset == 0) {
      Activity.app.models.user.emit("updateLastActiveTime", currentUser);
    }
    var promiseArray = new Array();
    var myLikesPromise = new Promise(function(resolve, reject) {
      Activity.app.models.like.find({
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
    promiseArray.push(myLikesPromise);
    var questionPromise = new Promise(function(resolve, reject) {
      Activity.app.models.question.priorityUnansweredQuestion(currentUser.id, function(err, questions) {
        if (err) {
          reject(err);
        } else {
          for (var index in questions) {
            var question = questions[index];
            question.position = index * 3;
            questions[index] = question;
          }
          resolve(questions);
        }
      });
    });
    promiseArray.push(questionPromise);
    var blockeduserpromise = new Promise(function(resolve, reject) {
      var blockUsers = [];
      Activity.app.models.blockuser.find({
        where: {
          or: [{
            "userId": currentUser.id
          }, {
            "blockedUserId": currentUser.id
          }]
        }
      }, function(err, blockedUsers) {
        for (var index in blockedUsers) {
          var blockedUser = blockedUsers[index];
          var userId = blockedUser.id.split("_")[0];
          //console.log("blockedUser===", user.userId)
          if (blockedUser.blockedUserId != currentUser.id) {
            blockUsers.push(blockedUser.blockedUserId);
          }
          if (userId != currentUser.id) {
            blockUsers.push(userId);
          }

        }
        resolve(blockUsers);
      })
    })
    promiseArray.push(blockeduserpromise);
    //all activities
    if (type.indexOf('all') != -1) {
      var activitiesPromise = new Promise(function(resolve, reject) {
        var filterObj = {
          where: {
            public: true
          },
          order: 'submittedAt DESC'
        };
        if (offset)
          filterObj.offset = offset;
        if (limit)
          filterObj.limit = limit;
        Activity.find(filterObj, function(err, activities) {
          if (err) {
            reject(err);
          } else {
            resolve({
              "all": activities
            });
          }
        })
      });
      promiseArray.push(activitiesPromise);
    }
    if (type.indexOf('foryou') != -1) {
      var foryouPromise = new Promise(function(resolve, reject) {
        Activity.app.models.follower.getFriendsIamFollowing(currentUser.id, limit, offset, function(err, followers) {
          var followerActivityPromise = new Array();
          var promiseObject = new Object();
          for (var i in followers) {
            (function(i) {
              promiseObject[i] = new Promise(function(resolve, reject) {
                var filterObj = {
                  where: {
                    actorId: followers[i],
                    public: true
                  },
                  order: 'submittedAt DESC'
                };
                if (offset)
                  filterObj.offset = offset;
                if (limit)
                  filterObj.limit = limit;
                Activity.find(filterObj, function(err, activity) {
                  if (err)
                    reject(err);
                  else {
                    resolve(activity);
                  }
                })
              })
              followerActivityPromise.push(promiseObject[i]);
            })(i);
          }
          Promise.all(followerActivityPromise).then(function(resolveArr) {
            resolve({
              "for_you": Array.prototype.concat.apply([], resolveArr)
            });
          }, function(rejectArr) {
            reject(rejectArr);
          })
        });
      });
      promiseArray.push(foryouPromise);
    }
    if (type.indexOf('trending') != -1) {
      var trendingPromise = new Promise(function(resolve, reject) {
        var filterObj = {
          where: {
            public: true,
            'resourceInfo.likeCount': {
              gt: 0
            }
          },
          order: 'submittedAt DESC'
        };
        if (offset)
          filterObj.offset = offset;
        if (limit)
          filterObj.limit = limit;
        Activity.find(filterObj, function(err, activities) {
          if (err)
            reject(err);
          else {
            resolve({
              "trending": activities
            });
          }
        })
      })
      promiseArray.push(trendingPromise);
    }
    Promise.all(promiseArray).then(function(resolveArr) {
      var myLikes = resolveArr[0];
      var returnObj = {
        question: resolveArr[1]
      }
      var blockUsers = resolveArr[2];
      for (var i = 3; i < resolveArr.length; i++) {
        var key = Object.keys(resolveArr[i])[0];
        for (index = 0; index < resolveArr[i][key].length; index++) {
          var resourceInfoAnswerId = resolveArr[i][key][index]['resourceInfo']['answerId'];
          resolveArr[i][key][index]['resourceInfo']['isLiked'] = false;
          if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
            resolveArr[i][key][index]['resourceInfo']['isLiked'] = true;
          }
        }
        if (blockUsers.length > 0) {
          console.log(blockUsers);
          resolveArr[i][key] = resolveArr[i][key].filter(function(feed) {
            if (blockUsers.indexOf(feed.actorId) == -1) {
              return feed;
            }
          })
        }
        returnObj[key] = resolveArr[i][key];
      }
      return cb(null, returnObj)
    }, function(rejectArr) {
      return cb(rejectArr)
    });
  }
  Activity.remoteMethod('myFeed', {
    isStatic: true,
    description: 'returns the timeline feed for user',
    returns: {
      arg: 'data',
      type: 'question',
      root: true
    },
    accepts: [{
      arg: 'type',
      type: 'array',
      description: 'type of feed',
      required: true
    }, {
      arg: 'offset',
      type: 'number',
      description: 'offset from where to start the feed',
      required: false
    }, {
      arg: 'limit',
      type: 'number',
      description: 'limit the number of feeds',
      required: false
    }],
    http: {
      path: '/myfeed',
      verb: 'get',
      status: 200
    }
  })


  Activity.beforeRemote('myFeedV2', function(ctx, model, next) {
    var currentActiveContext = loopback.getCurrentContext();
    console.log(currentActiveContext)
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      next(e);
    } else {
      var updateUser = false;
      if (currentActiveContext.get('lat') && currentActiveContext.get('lat') != currentUser.lat) {
        updateUser = true;
        currentUser.lat = currentActiveContext.get('lat');
      }
      if (currentActiveContext.get('lon') && currentActiveContext.get('lon') != currentUser.lon) {
        updateUser = true;
        currentUser.lon = currentActiveContext.get('lon');
      }
      if (currentActiveContext.get('city') && currentActiveContext.get('city') != currentUser.city) {
        updateUser = true;
        currentUser.city = currentActiveContext.get('city');
      }
      if (currentActiveContext.get('country') && currentActiveContext.get('country') != currentUser.country) {
        updateUser = true;
        currentUser.country = currentActiveContext.get('country');
      }
      console.log("updateUser=====", updateUser)
      if (updateUser) {
        Activity.app.models.user.emit('updateUserLocation', currentUser);
      }
      next();
    }
  })

  Activity.myFeedV2 = function(type, offset, limit, cb) {
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser');
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }
    if (offset == 0) {
      Activity.app.models.user.emit("updateLastActiveTime", currentUser);
    }
    var promiseArray = new Array();
    var myLikesPromise = new Promise(function(resolve, reject) {
      Activity.app.models.like.find({
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
    promiseArray.push(myLikesPromise);
    var questionPromise = new Promise(function(resolve, reject) {
      Activity.app.models.question.priorityUnansweredQuestion(currentUser.id, function(err, questions) {
        if (err) {
          reject(err);
        } else {
          for (var index in questions) {
            var question = questions[index];
            question.position = index * 3;
            questions[index] = question;
          }
          resolve(questions);
        }
      });
    });
    promiseArray.push(questionPromise);
    var blockeduserpromise = new Promise(function(resolve, reject) {
      var blockUsers = [];
      Activity.app.models.blockuser.find({
        where: {
          or: [{
            "userId": currentUser.id
          }, {
            "blockedUserId": currentUser.id
          }]
        }
      }, function(err, blockedUsers) {
        for (var index in blockedUsers) {
          var blockedUser = blockedUsers[index];
          var userId = blockedUser.id.split("_")[0];
          //console.log("blockedUser===", user.userId)
          if (blockedUser.blockedUserId != currentUser.id) {
            blockUsers.push(blockedUser.blockedUserId);
          }
          if (userId != currentUser.id) {
            blockUsers.push(userId);
          }

        }
        resolve(blockUsers);
      })
    })
    promiseArray.push(blockeduserpromise);
    //for you activities
    if (type.indexOf('foryou') != -1) {
      var foryouPromise = new Promise(function(resolve, reject) {
        //commented as to keep feed same for all users
        // if (currentUser.email != "neha_lal@hotmail.com") {
        //   redis.get("activity_" + currentUser.id, function(err, data) {
        //     var userActivityArr = JSON.parse(data) || [];
        //     if (userActivityArr.length < offset + limit) {
        //       redis.get("allPublicAnswers", function(err, data) {
        //         var answerIds = JSON.parse(data) || [];
        //         var ninArr = _.difference(answerIds, userActivityArr);
        //         Array.prototype.push.apply(userActivityArr, ninArr);
        //         var key = "activity_" + currentUser.id;
        //         userActivityArr = userActivityArr.splice(offset, limit);
        //         Activity.find({
        //           where: {
        //             resourceId: {
        //               inq: userActivityArr
        //             },
        //             or: [{
        //                 "public": true
        //               },
        //               {
        //                 "isCommunityAnswer": true
        //               }
        //             ]
        //           },
        //           order: 'submittedAt DESC'
        //         }, function(err, activities) {
        //           console.log("activities===", activities)
        //           resolve({
        //             "for_you": activities
        //           });
        //         })
        //       });
        //     } else {
        //       userActivityArr = userActivityArr.splice(offset, limit);
        //       console.log("answerIds===", userActivityArr)
        //       Activity.find({
        //         where: {
        //           resourceId: {
        //             inq: userActivityArr
        //           }
        //         },
        //         order: 'submittedAt DESC'
        //       }, function(err, activities) {
        //         console.log("activities===", activities)
        //         resolve({
        //           "for_you": activities
        //         });
        //       })
        //     }
        //   })
        // } 
        //else {
        var filterObj = {
          where: {
            public: true
          },
          order: 'submittedAt DESC'
        };
        if (offset)
          filterObj.offset = offset;
        if (limit)
          filterObj.limit = limit;
        Activity.find(filterObj, function(err, activities) {
          if (err) {
            reject(err);
          } else {
            resolve({
              "for_you": activities
            });
          }
        })
       // }
      });
      promiseArray.push(foryouPromise);
    }
    if (type.indexOf('trending') != -1) {
      var trendingPromise = new Promise(function(resolve, reject) {
        var filterObj = {
          where: {
            public: true,
            'resourceInfo.likeCount': {
              gt: 2
            }
          },
          order: ['submittedAt DESC', 'resourceInfo.likeCount DESC']
        };
        if (offset)
          filterObj.offset = offset;
        if (limit)
          filterObj.limit = limit;
        Activity.find(filterObj, function(err, activities) {
          if (err)
            reject(err);
          else {
            resolve({
              "trending": activities
            });
          }
        })
      })
      promiseArray.push(trendingPromise);
    }
    Promise.all(promiseArray).then(function(resolveArr) {
      var myLikes = resolveArr[0];
      var returnObj = {
        question: resolveArr[1]
      }
      var blockUsers = resolveArr[2];
      for (var i = 3; i < resolveArr.length; i++) {
        var key = Object.keys(resolveArr[i])[0];
        for (index = 0; index < resolveArr[i][key].length; index++) {
          var resourceInfoAnswerId = resolveArr[i][key][index]['resourceInfo']['answerId'];
          resolveArr[i][key][index]['resourceInfo']['isLiked'] = false;
          if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
            resolveArr[i][key][index]['resourceInfo']['isLiked'] = true;
          }
        }
        if (blockUsers.length > 0) {
          console.log(blockUsers);
          resolveArr[i][key] = resolveArr[i][key].filter(function(feed) {
            if (blockUsers.indexOf(feed.actorId) == -1) {
              return feed;
            }
          })
        }
        returnObj[key] = resolveArr[i][key];
      }
      return cb(null, returnObj)
    }, function(rejectArr) {
      return cb(rejectArr)
    });
  }
  Activity.remoteMethod('myFeedV2', {
    isStatic: true,
    description: 'returns the timeline feed for user',
    returns: {
      arg: 'data',
      type: 'question',
      root: true
    },
    accepts: [{
      arg: 'type',
      type: 'array',
      description: 'type of feed',
      required: true
    }, {
      arg: 'offset',
      type: 'number',
      description: 'offset from where to start the feed',
      required: false
    }, {
      arg: 'limit',
      type: 'number',
      description: 'limit the number of feeds',
      required: false
    }],
    http: {
      path: '/v2/myfeed',
      verb: 'get',
      status: 200
    }
  })




  Activity.createNewActivity = function(resourceInstance, newInstance, verb, resourceType, currentUser, cb) {
    var activityObject = getActivityObject(resourceInstance, newInstance, verb, resourceType, currentUser);
    var newActivity = new Activity(activityObject);
    newActivity.save(function(err, data) {
      if (err)
        return cb(err);
      if (data.resourceInfo.answerType == "Video") {
        var questioName = data.resourceInfo.title.replace(/\n/g, "-");
        questioName = questioName.replace(/\s+/g, "-").toLowerCase();
        questioName = questioName.replace(/\s+/g, "");
        var slug = data.actorInfo.firstName.toLowerCase() + "-" + data.actorInfo.lastName.toLowerCase() + "-" + questioName + "-" + data.id;
        var shareUrl = global.config.shrofilehost + "/videos/" + slug;
        shareUrl = shareUrl.replace(/\s+/g, "");
        data.resourceInfo.shareUrl = shareUrl;
        data.save(function(savedData) {})
      }
      return cb(null, data);
    })
  }
  Activity.updateActivity = function(resourceId, type, updateActivityObject, cb) {
    Activity.findOne({
      where: {
        resourceId: resourceId
      }
    }, function(err, activity) {
      if (activity) {
        if (type == 'comment') {
          activity.resourceInfo.commentCount = updateActivityObject.count
          activity.comment = updateActivityObject.comment
        } else if (type == 'like') {
          activity.resourceInfo.likeCount = updateActivityObject.count
        }
        activity.save(function(err, data) {
          cb(null, data);
        })
      }
    });
  }

  function getActivityObject(resourceInstance, newInstance, verb, resourceType, currentUser) {
    var activity = {};
    var actorInfo = {
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
      image_url: currentUser.image_url
    }
    var location = currentUser.basicInfo ? currentUser.basicInfo.location || "" : currentUser.location || "";
    var company = "";
    var designation = "";
    if (currentUser.experienceList && currentUser.experienceList.length) {
      var currentCompany = currentUser.experienceList[0];
      company = currentCompany.company;
      designation = currentCompany.title;
    } else if (currentUser.educationList && currentUser.educationList.length) {
      var currentEducation = currentUser.educationList[0];
      company = currentEducation.institution;
      designation = currentEducation.course;
    }
    actorInfo.location = location;
    actorInfo.company = company;
    actorInfo.designation = designation;
    var resourceInfo = {};
    switch (verb) {
      case "answered":
        var question = resourceInstance;
        var instance = newInstance;
        var answerProperties = question.answerTemplate.properties;
        resourceInfo.title = question.name.toProperCase();
        resourceInfo.text = question.text;
        resourceInfo.section = question.section;
        resourceInfo.answerId = instance.id;
        resourceInfo.answerType = instance.type;
        resourceInfo.commentCount = instance.commentCount;
        resourceInfo.likeCount = instance.likeCount;
        for (var key in answerProperties) {
          resourceInfo[key] = instance['answer'][key];
        }
        resourceInfo.shareUrl = instance['answer']["shareUrl"];
        activity.actorId = instance.userId;
        activity.actorInfo = actorInfo;
        activity.verb = verb;
        activity.resourceType = resourceType;
        activity.questionId = instance.questionId;
        activity.resourceId = instance.id;
        activity.qorder = question.order;
        activity.resourceInfo = resourceInfo;
        activity.public = instance.public;
        activity.submittedAt = new Date();
        activity.createdAt = new Date();
        if (instance.lat) {
          activity.lat = instance.lat;
        }
        if (instance.lon) {
          activity.lon = instance.lon;
        }
        if (instance.city) {
          activity.city = instance.city;
        }
        if (instance.country) {
          activity.country = instance.country;
        }
        break;
    }
    return activity;
  }
  Activity.getEventActivity = function(cb) {
    var eventDate = new Date("February 15, 2017 18:30:00");
    this.findOne({
      where: {
        public: true,
        "resourceInfo.answerType": "Video",
        "submittedAt": {
          "gte": eventDate
        }
      },
      order: "submittedAt desc"
    }, function(err, activity) {
      if (err)
        return cb(err)
      return cb(null, activity);
    })
  }
  Activity.getSingleActivity = function(id, cb) {
    Activity.findById(id, function(err, activity) {
      if (err)
        return cb(err)
      else {
        var relatedActivitiesPromise = new Promise(function(resolve, reject) {
          Activity.find({
            where: {
              "qorder": activity.qorder,
              "public": true
            },
	    limit:10,	
            order: "submittedAt DESC"
          }, function(err, relatedActivities) {
            console.log(err)
            console.log(relatedActivities)
            if (err)
              reject(err)
            resolve(relatedActivities)
          })
        })
        var commentsPromise = new Promise(function(resolve, reject) {
          Activity.app.models.comment.find({
            where: {
              answerId: activity.resourceId
            }
          }, function(err, comments) {
            console.log(err)
            console.log(comments)

            if (err)
              reject(err)
            resolve(comments)
          })
        })
        var promArr = [relatedActivitiesPromise, commentsPromise];
        Promise.all(promArr).then(function(resolveArr) {
          var returnObj = {
            "activity": activity,
            "relatedActivities": resolveArr[0],
            "comments": resolveArr[1]
          }
          return cb(null, returnObj)
        }, function(rejectArr) {
          return cb(rejectArr)
        })
      }
    });
  }
  Activity.getAllActivities = function(offset, limit, cb) {
    var filterObj = {
      where: {
        public: true,
        "resourceInfo.answerType":"Video"
      },
      'order': "submittedAt DESC"
    };
    if (offset)
      filterObj.offset = offset;
    if (limit)
      filterObj.limit = limit;
    this.find(filterObj, function(err, activities) {
      if (err)
        return cb(err)
      return cb(null, activities);
    })
  }
  Activity.updateShareUrls = function(cb) {
    this.find({
      where: {

      }
    }, function(err, activities) {
      for (var index in activities) {
        (function(i) {
          var activity = activities[i];
          var questioName = activity.resourceInfo.title.replace(/\n/g, "-");
          questioName = questioName.replace(/\s+/g, "-").toLowerCase();
          questioName = questioName.replace(/\s+/g, "");
          var slug = activity.actorInfo.firstName.toLowerCase() + "-" + activity.actorInfo.lastName.toLowerCase() + "-" + questioName + "-" + activity.id;
          var shareUrl = global.config.shrofilehost + "/videos/" + slug;
          shareUrl = shareUrl.replace(/\s+/g, "");
          activity.resourceInfo.shareUrl = shareUrl;
          activity.save(function(savedActivity) {})
        })(index)
      }
    })
    cb(null, {
      success: true
    })
  }
};
