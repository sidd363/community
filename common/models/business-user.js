var path = require('path');
var searchClient = require("../lib/elasticsearch");
var redis = require("../lib/redis");
var randomize = require('randomatic');
var loopback = require('loopback');
var Promise = require("bluebird");
module.exports = function(Businessuser) {
  Businessuser.beforeRemote("create", function(ctx, model, next) {
    var role = ctx.req.body.role;
    var companyId = ctx.req.body.companyId;
    ctx.req.body.password = randomize('A0!', 6);
    ctx.req.body.joiningDate = new Date();
    ctx.req.body.firstLogin = true;
    if (role == "businessAdmin" && !companyId) {
      var companyDomain = ctx.req.body.email.split("@")[1];
      Businessuser.app.models.company.findOne({
        where: {
          companyDomain: companyDomain
        }
      }, function(err, company) {
        ctx.req.body.companyId = company.id;
        next();
      })
    } else {
      Businessuser.app.models.company.findById(companyId, function(err, company) {
        if (err)
          return next(err);
        var e;
        if (role == "freeBusinessUser" && company.freeusers + 1 > company.allowedFreeUsers) {
          e = new Error("Only " + company.allowedFreeUsers + " free users are allowed as per your package.");
          e.statu = 403;
          return next(e);
        } else if ((role == "recruiter" || role == "businessAdmin") && company.recruiters + 1 > company.allowedRecruiters) {
          e = new Error("Only " + company.allowedRecruiters + " recruiters are allowed as per your package.");
          e.statu = 403;
          return next(e);
        } else {
          next();
        }
      })
    }
  });
  Businessuser.beforeRemote('*.updateAttributes', function(ctx, model, next) {
    ctx.req.body.updatedAt = new Date();
    next()
  });
  Businessuser.afterRemote("create", function(context, model, next) {
    var instance = context.args.data;
    var password = instance.password;
    Businessuser.emit("sendInviteEmail", model, password);
    Businessuser.emit("assignRoletoNewUser", model)
    Businessuser.app.models.company.emit("newBusinessUser", model);
    next();
  });
  Businessuser.beforeRemote('login', function(ctx, model, next) {
    if (ctx.args && ctx.args.credentials) {
      ctx.args.credentials.ttl = 60 * 60 * 24 * 7 * 52;
    }
    next();
  });
  Businessuser.afterRemote('login', function(context, accessToken, next) {
    Businessuser.findById(accessToken.userId, function(err, user) {
      if (err) {
        user = {}
      }
      accessToken.firstName = user.firstName || "";
      accessToken.lastName = user.lastName || "";
      accessToken.image_url = user.image_url || "";
      accessToken.firstLogin = user.firstLogin || false;
      accessToken.companyId = user.companyId;
      accessToken.email = user.email;
      accessToken.role = user.role;
      accessToken.save(function(err, savedAccesstoken) {
        return next();
      })
    })
  });
  Businessuser.afterRemote("confirm", function(ctx, user, next) {
    Businessuser.findById(ctx.args.uid, function(err, user) {
      //Businessuser.emit("onWelcomeEmail",user);
      next();
    })
  })
  Businessuser.on("assignRoletoNewUser", function(businessuser) {
    var roleType = businessuser.role;
    Businessuser.app.models.Role.findOne({
      where: {
        name: roleType
      }
    }, function(err, role) {
      if (err) next(err);
      if (role && role.id) {
        role.principals.create({
          principalType: 'USER',
          principalId: businessuser.id
        }, function(err, principal) {
          console.log("principal====", principal)
        });
      }
    });
  })
  Businessuser.searchUser = function(queryObj, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var savedSearch = {
      "identifier": "",
      "queryObj": queryObj
    }
    var esQuery = {};
    if (queryObj.searchName) {
      esQuery = {
        "size": 1000,
        "query": {
          "multi_match": {
            "query": queryObj.searchName,
            "fields": ["displayname^2", "searchLocation^1.5", "company", "college", "degree", "designation"],
            "type": "phrase"
          }
        }
      }
      savedSearch["identifier"] = queryObj.searchName;
    } else {
      esQuery = {
        "size": 1000,
        "query": {
          "bool": {
            "must": []
          }
        }
      }
      console.log("queryObj===", Object.keys(queryObj))
      var indMatchObj = {};
      for (var index = 0; index < Object.keys(queryObj).length; index++) {
        var key = Object.keys(queryObj)[index];
        if (key != "workingSince") {
          savedSearch["identifier"] += queryObj[key] + " ";
        }
        console.log(key)
        if (key != "workingSince") {
          indMatchObj = {
            "match_phrase": {}
          };
          indMatchObj["match_phrase"][key] = queryObj[key];
        } else {
          indMatchObj = {
            "range": {}
          };
          indMatchObj["range"][key] = queryObj[key];
        }
        esQuery["query"]["bool"]["must"].push(indMatchObj)
      }
    }
    console.log("esQuery====", esQuery)
    searchClient.search("user", esQuery, function(err, data) {
      console.log("data====", data);
      var returnArr = [];
      if (data && data.hits && data.hits.hits) {
        data.hits.hits.forEach(function(hit) {
          returnArr.push(hit._source);
        })
      }
      redis.get("saveSearch_" + currentUser.id, function(err, data) {
        console.log(data)
        if (!data) {
          data = []
        } else {
          data = JSON.parse(data)
        }
        data.unshift(savedSearch);
        redis.set("saveSearch_" + currentUser.id, JSON.stringify(data), function(err, data) {})
      })
      return cb(null, returnArr);
    })
  }
  Businessuser.getSavedSearches = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    redis.get("saveSearch_" + currentUser.id, function(err, data) {
      if (!data)
        data = [];
      else
        data = JSON.parse(data)
      return cb(null, data);
    })
  }
  Businessuser.on("sendInviteEmail", function(businessueser, password) {
    var url = global.config.shrofilehost + '/reset-password';
    var emailRole = "";
    if (businessueser.role == "businessAdmin") {
      emailRole = "Admin"
    } else if (businessueser.role == "recruiter") {
      emailRole = "Recruiter"
    } else if (businessueser.role == "freeBusinessUser") {
      emailRole = "Free User"
    }
    var html = 'Hi ' + businessueser.firstName + ',<br />' + 'You have a new ' + emailRole + 'account at <a href=" ' + url + '">Shrofile</a><br />Account details:<br /> Username:' + businessueser.email + '<br />Password:' + password;
    Businessuser.app.models.Email.send({
      to: businessueser.email,
      from: businessueser.email,
      subject: 'New account at Shrofile',
      html: html
    }, function(err) {
      if (err) return console.log('> error sending password reset email');
      console.log('> sending password reset email to:', businessueser.email);
    });
  })
  Businessuser.changePassword = function(oldpassword, newpassword, id, cb) {
    console.log("comes here");
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.findById(id, function(err, user) {
      if (err)
        return cb(err)
      console.log("user===", user)
      user.hasPassword(oldpassword, function(err, isMatch) {
        console.log("erroo==", err);
        console.log("isMatch====", isMatch)
        if (isMatch) {
          user.updateAttributes({
            "password": newpassword,
            "firstLogin": false
          }, function(err, instance) {
            if (err)
              cb(err)
            else {
              return cb(null, true);
            }
          })
        } else {
          newErrMsg = 'User specified wrong current password !';
          newErr = new Error(newErrMsg);
          newErr.statusCode = 401;
          newErr.code = 'LOGIN_FAILED_PWD';
          return cb(newErr);
        }
      })
    })
  }
  Businessuser.inviteCandidates = function(jobId, userList, cb) {
    console.log("userList====", userList)
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Businessuser.app.models.job.findById(jobId, function(err, job) {
      for (var index in userList) {
        (function(index) {
          var inviteuser = userList[index];
          if (inviteuser.email) {
	    inviteuser.email = inviteuser.email.toLowerCase();
            Businessuser.app.models.user.findOne({
              where: {
                "email": inviteuser.email
              }
            }, function(err, user) {
              if (!user) {
                var password = randomize('A0', 6);
                var newUser = new Businessuser.app.models.User({
                  firstName: inviteuser.firstName,
                  lastName: inviteuser.lastName,
                  email: inviteuser.email,
                  password: password,
                  tempPass:password,
                  emailVerified:true,
                  invitedOn: new Date()
                });
                newUser.save(function(err, savedNewUser) {
                  //Businessuser.emit("sendCandidateInviteEmail", newUser, password, job);
                  Businessuser.emit("createInvite", job, savedNewUser,'uploaded');
                })
              } else {
                Businessuser.emit("createInvite", job, user,'invited');
              }
            })
          }
        })(index)
      }
    })
    cb(null, {
      "success": true
    })
  }
  Businessuser.on("sendCandidateInviteEmail", function(inviteduser, password, job) {
    var url = global.config.shrofilehost + '/reset-password';
    var html = 'Hi ' + inviteduser.firstName + ',<br />' + 'You have been invited to Shrofile by' + job.companyName + ' for ' + job.title + '. Username:' + inviteduser.email + '<br />Password:' + password;
    Businessuser.app.models.Email.send({
      to: inviteduser.email,
      from: inviteduser.email,
      subject: 'New account at Shrofile',
      html: html
    }, function(err) {
      if (err) return console.log('> error sending password reset email');
      console.log('> sending password reset email to:', inviteduser.email);
    });
  })
  Businessuser.on("createInvite", function(job, user,status) {
    Businessuser.app.models.job.invite(job, user,status);
  })
  Businessuser.dashboardCount = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    console.log("userid-------", typeof currentUser.id)

    var jobPostedCountPromise = new Promise(function(resolve, reject) {
      Businessuser.app.models.job.count({
        "userId": currentUser.id
      }, function(err, data) {
        if (err)
          reject(err)
        else {
          resolve(data || 0)
        }
      })
    });
    var shortlistedCountPromise = new Promise(function(resolve, reject) {
      Businessuser.app.models.application.count({
        "postedByUserId": currentUser.id,
        "status": "shortlisted"
      }, function(err, data) {
        if (err)
          reject(err)
        else {
          resolve(data || 0);
        }
      })
    });
    var appliedCountPromise = new Promise(function(resolve, reject) {
      Businessuser.app.models.application.count({
        "postedByUserId": currentUser.id,
        "status": "applied"
      }, function(err, data) {
        if (err)
          reject(err)
        else {
          resolve(data || 0)
        }
      })
    });
    var arrPromise = [jobPostedCountPromise, shortlistedCountPromise, appliedCountPromise];
    Promise.all(arrPromise).then(function(resolveArr) {
      var returnObj = {
        "posted": resolveArr[0],
        "shortlisted": resolveArr[1],
        "responses": resolveArr[2]
      }
      cb(null, returnObj)
    })
  };
}

