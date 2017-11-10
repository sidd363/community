var ObjectID = require('mongodb').ObjectID;
var redis = require("../lib/redis.js")
var _ = require('lodash');
module.exports = function(Useractivity) {
    Useractivity.observe("after save", function(ctx, next) {
      var savedUserActivity = ctx.instance
      var userActivityArr = [];
      userActivityArr = userActivityArr.concat.apply([], [savedUserActivity.communityBucket.itemArr, savedUserActivity.followerBucket.itemArr, savedUserActivity.commentBucket.itemArr, savedUserActivity.likeBucket.itemArr]);
      var key = "activity_" + savedUserActivity.userId;
      redis.set(key, JSON.stringify(userActivityArr), function(err, data) {});
      next()
    });
    Useractivity.on('newUserActivity', function(type, resourceObject) {
          switch (type) {
            case 'newCommunityAnswer':
              //Attach the answer to all the members of that community
              var communityId = resourceObject.communityId;
              var answerId = resourceObject.resourceId;
              var arrUsers = [];
              arrUsers.push(resourceObject.userId);
              Useractivity.app.models.member.find({
                where: {
                  communityId: communityId,
                  status:"approved"
                },
                fields: {
                  userId: true
                }
              }, function(err, members) {
                if (members && members.length) {
                  for (var index in members) {
                    (function(index) {
                      var userId = members[index].userId;
                      Useractivity.findOne({
                        where: {
                          "userId": userId
                        }
                      }, function(err, userActivity) {
                        if (!userActivity.communityBucket.itemObj[answerId]) {
                          userActivity.communityBucket.itemObj[answerId] = true;
                          userActivity.communityBucket.itemArr.unshift(answerId);
                          if (userActivity.followerBucket.itemObj[answerId]) {
                            delete userActivity.followerBucket.itemObj[answerId];
                            userActivity.followerBucket.itemArr = Object.keys(userActivity.followerBucket.itemObj)
                          }
                          if (userActivity.likeBucket.itemObj[answerId]) {
                            delete userActivity.likeBucket.itemObj[answerId];
                            userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                          }
                          if (userActivity.commentBucket.itemObj[answerId]) {
                            delete userActivity.commentBucket.itemObj[answerId];
                            userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                          }
                        }
                        userActivity.save(function(savedUserActivity) {})
                      })
                    })(index)
                  }
                }
              })
              break;
            case 'newGeneralAnswer':
              //Attach the answer to all the followers
              var userId = resourceObject.userId;
              var answerId = resourceObject.resourceId;
              redis.get('allPublicAnswers', function(err, data) {
                var answerIds = JSON.parse(data) || []
                if (answerIds.indexOf(answerId) == -1) {
                  answerIds.unshift(answerId);
                }
                redis.set("allPublicAnswers", JSON.stringify(answerIds), function(err, data) {
                  Useractivity.app.models.follower.myFollowers(userId, null, null, function(err, followers) {
                    console.log("followers===",followers)
                    if (followers && followers.length) {
                      for (var index in followers) {
                        (function(index) {
                          var follower = followers[index];
                          var followerId = JSON.parse(JSON.stringify(follower)).userId;
                          Useractivity.findOne({
                            where: {
                              "userId": followerId
                            }
                          }, function(err, userActivity) {
                            console.log("followerId===",followerId);
                            console.log("userActivity===",userActivity);
                            if (userActivity.communityBucket.itemObj[answerId]) {
                              //continue;
                            } else if (!userActivity.followerBucket.itemObj[answerId]) {
                              userActivity.followerBucket.itemObj[answerId] = true;
                              userActivity.followerBucket.itemArr.unshift(answerId)
                              if (userActivity.likeBucket.itemObj[answerId]) {
                                delete userActivity.likeBucket.itemObj[answerId];
                                userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                              }
                              if (userActivity.commentBucket.itemObj[answerId]) {
                                delete userActivity.commentBucket.itemObj[answerId];
                                userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                              }
                            }
                            userActivity.save(function() {});
                          })
                        })(index)
                      }
                    }else{
                      Useractivity.findOne({
                        where: {
                          "userId": userId
                        }
                      }, function(err, userActivity) {
                        if (userActivity.communityBucket.itemObj[answerId]) {
                          //continue;
                        } else if (!userActivity.followerBucket.itemObj[answerId]) {
                          userActivity.followerBucket.itemObj[answerId] = true;
                          userActivity.followerBucket.itemArr.unshift(answerId)
                          if (userActivity.likeBucket.itemObj[answerId]) {
                            delete userActivity.likeBucket.itemObj[answerId];
                            userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                          }
                          if (userActivity.commentBucket.itemObj[answerId]) {
                            delete userActivity.commentBucket.itemObj[answerId];
                            userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                          }
                        }
                        userActivity.save(function() {});
                      })
                    }
                  });
                })
              });
              break;
            case 'removeGeneralAnswer':
              //Attach the answer to all the followers
              var userId = resourceObject.userId;
              var answerId = resourceObject.resourceId;
              redis.get('allPublicAnswers', function(err, data) {
                var answerIds = JSON.parse(data) || []
                if (answerIds.indexOf(answerId) != -1) {
                  var index = answerIds.indexOf(answerId);
                  answerIds.splice(index, 1)
                }
                redis.set("allPublicAnswers", JSON.stringify(answerIds), function(err, data) {
                    Useractivity.app.models.follower.myFollowers(userId, null, null, function(err, followers) {
                        if (followers && followers.length) {
                          for (var index in followers) {
                            (function(index) {
                              var follower = followers[index];
                              var followerId = follower.userId;
                              Useractivity.findOne({
                                where: {
                                  "userId": followerId
                                }
                              }, function(err, userActivity) {
                                if (userActivity.communityBucket.itemObj[answerId]) {
                                  delete userActivity.communityBucket.itemObj[answerId];
                                  userActivity.communityBucket.itemArr = Object.keys(userActivity.communityBucket.itemObj)
                                } else if (userActivity.followerBucket.itemObj[answerId]) {
                                  delete userActivity.followerBucket.itemObj[answerId];
                                  userActivity.followerBucket.itemArr = Object.keys(userActivity.followerBucket.itemObj);
                                  if (userActivity.likeBucket.itemObj[answerId]) {
                                    delete userActivity.likeBucket.itemObj[answerId];
                                    userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                                  }
                                  if (userActivity.commentBucket.itemObj[answerId]) {
                                    delete userActivity.commentBucket.itemObj[answerId];
                                    userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                                  }
                                }
                                userActivity.save(function() {});
                              })

                            })(index)
                          }
                        }else{
                          Useractivity.findOne({
                            where: {
                              "userId": userId
                            }
                          },function(err,userActivity){
                            if (userActivity.communityBucket.itemObj[answerId]) {
                              delete userActivity.communityBucket.itemObj[answerId];
                              userActivity.communityBucket.itemArr = Object.keys(userActivity.communityBucket.itemObj)
                            } else if (userActivity.followerBucket.itemObj[answerId]) {
                              delete userActivity.followerBucket.itemObj[answerId];
                              userActivity.followerBucket.itemArr = Object.keys(userActivity.followerBucket.itemObj)
                              if (userActivity.likeBucket.itemObj[answerId]) {
                                delete userActivity.likeBucket.itemObj[answerId];
                                userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                              }
                              if (userActivity.commentBucket.itemObj[answerId]) {
                                delete userActivity.commentBucket.itemObj[answerId];
                                userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                              }
                            }
                            userActivity.save(function() {});
                          })
                        }
                        });
                    })
                    })
                    break;
                  case 'newLike':
                    var userId = resourceObject.userId;
                    var answerId = resourceObject.resourceId; Useractivity.findOne({
                      where: {
                        "userId": userId
                      }
                    }, function(err, userActivity) {
                      if (userActivity.communityBucket.itemObj[answerId]) {
                        //continue;
                      } else if (userActivity.followerBucket.itemObj[answerId]) {
                        //continue;
                      } else if (!userActivity.likeBucket.itemObj[answerId]) {
                        userActivity.likeBucket.itemObj[answerId] = true;
                        userActivity.likeBucket.itemArr.unshift(answerId);
                        if (userActivity.commentBucket.itemObj[answerId]) {
                          delete userActivity.commentBucket.itemObj[answerId];
                          userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)                        }
                      }
                      userActivity.save(function() {})
                    })
                    break;
                  case 'newComment':
                    var userId = resourceObject.userId;
                    var answerId = resourceObject.resourceId; Useractivity.findOne({
                      where: {
                        "userId": userId
                      }
                    }, function(err, userActivity) {
                      if (userActivity.communityBucket.itemObj[answerId]) {
                        //continue;
                      } else if (userActivity.followerBucket.itemObj[answerId]) {
                        //continue;
                      } else if (userActivity.likeBucket.itemObj[answerId]) {
                        //continue;
                      } else if (!userActivity.commentBucket.itemObj[answerId]) {
                        userActivity.commentBucket.itemObj[answerId] = true;
                        userActivity.commentBucket.itemArr.unshift(answerId);
                      }
                      userActivity.save(function() {})
                    });
                    break;
                  case 'newFollower':
                    var userId = resourceObject.userId;
                    var followerId = resourceObject.followerId;
                    Useractivity.app.models.answer.find({
                      where: {
                        userId: userId,
                        public:true
                      }
                    }, function(err, answers) {
                      Useractivity.findOne({
                        where: {
                          "userId": followerId
                        }
                      }, function(err, userActivity) {
                        for (var index in answers) {
                          var answerId = answers[index].id;
                          if (answerId) {
                            if (userActivity.communityBucket.itemObj[answerId]) {
                              //continue;
                            } else if (!userActivity.followerBucket.itemObj[answerId]) {
                              userActivity.followerBucket.itemObj[answerId] = true;
                              userActivity.followerBucket.itemArr.unshift(answerId);
                              if (userActivity.likeBucket.itemObj[answerId]) {
                                delete userActivity.likeBucket.itemObj[answerId];
                                userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                              }
                              if (userActivity.commentBucket.itemObj[answerId]) {
                                delete userActivity.commentBucket.itemObj[answerId];
                                userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj);
                              }
                            }
                          }
                        }
                        userActivity.save(function(err, savedUserActivity) {});
                      })
                    })
                    break;
                  case 'removeFollower':
                    var userId = resourceObject.userId;
                    var followerId = resourceObject.followerId;
                    Useractivity.app.models.answer.find({
                      where: {
                        userId: userId
                      }
                    }, function(err, answers) {
                      Useractivity.findOne({
                        where: {
                          userId: followerId
                        }
                      }, function(err, userActivity) {
                        for (var index in answers) {
                          var id = answers[index].id;
                          (function(answerId) {
                            if (userActivity.followerBucket.itemObj[answerId]) {
                              delete userActivity.followerBucket.itemObj[answerId];
                              userActivity.followerBucket.itemArr = Object.keys(userActivity.followerBucket.itemObj)
                            }
                          })(id)
                        }
                        userActivity.save(function() {});
                      })

                    })
                    break;
                  case 'removeAnswerFromCommunity':
                    var communityId = resourceObject.communityId;
                    var answerId = resourceObject.resourceId;
                    var arrUsers = [];
                    arrUsers.push(resourceObject.userId);
                    Useractivity.app.models.member.find({
                      where: {
                        communityId: communityId
                      },
                      fields: {
                        userId: true
                      }
                    }, function(err, members) {
                      for (var index in members) {
                        (function(index) {
                          var userId = members[index].userId;
                          Useractivity.findOne({
                            where: {
                              "userId": userId
                            }
                          }, function(err, userActivity) {
                            if (userActivity.communityBucket.itemObj[answerId]) {
                              delete userActivity.communityBucket.itemObj[answerId];
                              userActivity.communityBucket.itemArr = Object.keys(userActivity.communityBucket.itemObj)
                            }
                            userActivity.save(function(err, savedUserActivity) {})
                          })
                        })(index)
                      }
                    })
                    break;
                  case 'addUserToCommunity':
                    var userId = resourceObject.userId;
                    var communityId = resourceObject.communityId;
                    Useractivity.findOne({
                      where: {
                        "userId": userId
                      }
                    }, function(err, userActivity) {
                      Useractivity.app.models.communityActivity.find({
                        "communityId": communityId
                      }, function(err, activities) {
                        for (var index in activities) {
                          var answerId = activities[index].answerId;
                          if (answerId && !userActivity.communityBucket.itemObj[answerId]) {
                            userActivity.communityBucket.itemObj[answerId] = true;
                            userActivity.communityBucket.itemArr.unshift(answerId);
                            if (userActivity.followerBucket.itemObj[answerId]) {
                              delete userActivity.followerBucket.itemObj[answerId];
                              userActivity.followerBucket.itemArr = Object.keys(userActivity.followerBucket.itemObj)
                              if (userActivity.likeBucket.itemObj[answerId]) {
                                delete userActivity.likeBucket.itemObj[answerId];
                                userActivity.likeBucket.itemArr = Object.keys(userActivity.likeBucket.itemObj)
                              }
                              if (userActivity.commentBucket.itemObj[answerId]) {
                                delete userActivity.commentBucket.itemObj[answerId];
                                userActivity.commentBucket.itemArr = Object.keys(userActivity.commentBucket.itemObj)
                              }
                            }
                          }
                        }
                      })
                      userActivity.save(function(err, savedUserActivity) {
                      })
                    })
                    break;
                  case 'removeUserFromCommunity':
                    var userId = resourceObject.userId;
                    var communityId = resourceObject.communityId;
                    Useractivity.app.models.communityActivity.find({
                      where:{
                        communityId:communityId
                      },
                      field:{
                        "answerId":true
                      }
                    },function(err,activities){
                      Useractivity.findOne({
                        where:{
                          userId:userId
                        }
                      },function(err,userActivity){
                        for(var index in activities){
                          var answerId = activities[index].answerId;
                          if(userActivity.communityBucket.itemObj[answerId]){
                            delete userActivity.communityBucket.itemObj[answerId];
                            userActivity.communityBucket.itemArr = Object.keys(userActivity.communityBucket.itemObj);
                          }
                        }
                        userActivity.save(function(){})
                      })
                    })
                  break;
                  default:
                }
              })
              Useractivity.createNew = function(cb) {
                Useractivity.app.models.activity.find({
                  where: {
                    public: true
                  },
                  fields: {
                    resourceId: true
                  },
                  order:"submittedAt DESC"
                }, function(err, activities) {
                  var itemObj = {}
                  var itemArr = [];
                  for (var index in activities) {
                    var activity = activities[index];
                    itemArr.push(activity.resourceId)
                  }
                  redis.set("allPublicAnswers", JSON.stringify(itemArr), function(err, data) {
                    Useractivity.app.models.user.find({
                      where: {

                      }
                    }, function(err, users) {
                      for (var index in users) {

                        (function(index) {
                          var user = users[index];
                          var userActivity = new Useractivity({
                            "userId": user.id,
                            "communityBucket": {
                              "itemObj": {},
                              "itemArr": []
                            },
                            "followerBucket": {
                              "itemObj": {},
                              "itemArr": []
                            },
                            "likeBucket": {
                              "itemObj": {},
                              "itemArr": []
                            },
                            "commentBucket": {
                              "itemObj": {},
                              "itemArr": []
                            }
                          });
                          userActivity.save(function() {});
                        })(index)
                      }
                    })
                  })
                  cb(null,{"success":true})
                })
              }
              Useractivity.backFillData = function(cb) {
                Useractivity.app.models.user.find({
                  where: {

                  }
                }, function(err, users) {
                  for (var index in users) {
                    var user = users[index];
                    (function(user) {
                      Useractivity.findOne({
                        where: {
                          userId: user.id
                        }
                      }, function(err, userActivity) {
                        if (userActivity && userActivity.id) {
                          Useractivity.app.models.follower.getFriendsIamFollowing(user.id, null, null, function(err, followerIds) {
                            Useractivity.app.models.activity.find({
                              where: {
                                actorId: {
                                  inq: followerIds
                                },
                                public: true
                              },
                              fields: {
                                resourceId: true
                              },
                              order:"submittedAt DESC"
                            }, function(err, activities) {
                              for (var i in activities) {
                                var answerId = activities[i].resourceId;
                                if (!userActivity.followerBucket.itemObj[answerId]) {
                                  userActivity.followerBucket.itemObj[answerId] = true;
                                  userActivity.followerBucket.itemArr.push(answerId);
                                }

                              }

                              Useractivity.app.models.like.find({
                                where: {
                                  userId: user.id
                                },
                                fields: {
                                  answerId: true
                                },
                                order:"submittedAt DESC"
                              }, function(err, data) {
                                for (var i in data) {
                                  var answerId = data[i].answerId;
                                  if (userActivity.followerBucket.itemObj[answerId]) {

                                  } else if (!userActivity.likeBucket.itemObj[answerId]) {
                                    userActivity.likeBucket.itemObj[answerId] = true;
                                    userActivity.likeBucket.itemArr.unshift(answerId);
                                    if (userActivity.commentBucket.itemObj[answerId]) {
                                      delete userActivity.commentBucket.itemObj[answerId];
                                      var index = userActivity.commentBucket.itemArr.indexOf(answerId);
                                      userActivity.commentBucket.itemArr.splice(index, 1);
                                    }
                                  }
                                }
                                Useractivity.app.models.comment.find({
                                  where: {
                                    userId: user.id
                                  },
                                  fields: {
                                    answerId: true
                                  },
                                  order:"submittedAt DESC"
                                }, function(err, data) {
                                  for (var i in data) {
                                    var answerId = data[i].answerId;
                                    if (userActivity.followerBucket.itemObj[answerId]) {

                                    } else if (userActivity.likeBucket.itemObj[answerId]) {

                                    } else if (!userActivity.commentBucket.itemObj[answerId]) {
                                      userActivity.likeBucket.itemObj[answerId] = true;
                                      userActivity.likeBucket.itemArr.unshift(answerId)
                                    }
                                  }
                                  userActivity.save(function(err, savedActivity) {})

                                }) //comment

                              }) //like
                            }) //follower


                          })

                        }

                      })
                    })(user);
                  }
                  cb(null,{"success":true})
                });
              }
              Useractivity.getResourceIds = function(userActivity, offset, limit) {
                var communityBucketLength = userActivity.communityBucket.itemArr.length;
                var followerBucket = userActivity.followerBucket.itemArr.length;
                var likeBucket = userActivity.likeBucket.itemArr.length;
                var commentBucket = userActivity.commentBucket.itemArr.length;

              }
              Useractivity.createCache = function(cb){
                Useractivity.app.models.answer.find({
                  where:{
                    public:true
                  },
                  fields:{
                    "_id":true
                  }
                },function(err,answers){
                  var answerIds=[]
                  for(var index in answers){
                    answerIds.push(answers[index].answerId);
                  }
                  redis.set("allPublicAnswers", JSON.stringify(answerIds), function(err, data) {
                  });
                })
              }

          };
