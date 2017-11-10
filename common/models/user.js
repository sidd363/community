//
// We are using built-in loopback User model which has common functionalites.
// Refer https://loopback.io/doc/en/lb2/Managing-users.html
//
// The CRUD and Relational object API will come from loopback itself.
//
// This responsible for these are the custom API's endpoints.
//
//  GET "/:userId/profileviews"
//  POST /:userId/profileviews
//  GET "/myprofile"
//  POST "/resetpassword"
//  GET "/profile/:id"
//  POST "/devicetoken"
//  GET "/search"
//  GET "/updateImageurl"
//
var app = require('../../server/server');
var config = require('../../server/config.json');
var searchClient = require("../lib/elasticsearch")
var notifTag = require("../../config/notificationConfig.json")
var dataSource = app.datasources.db;
var path = require('path');
var loopback = require('loopback');
var ObjectID = require('mongodb').ObjectID;
var Promise = require("bluebird");
var EJS = require('ejs');
var s3helper = require('../lib/s3helper.js');
var moment = require("moment");
var assert = require('assert');
module.exports = function(User) {

  //
  // Validate password length and mail id.
  //
  User.validatesLengthOf('password', {
    min: 5,
    message: {
      min: 'Password is too short'
    }
  });

  var mailre = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

  User.validatesFormatOf('email', {
    with: mailre,
    message: 'Must provide a valid email'
  });

  User.beforeRemote('*.updateAttributes', function(ctx, model, next) {
    console.log("here before remote updateee", ctx.req.params.id)
    if (ctx.req.body && ctx.req.body.image_url && ctx.req.body.image_url.indexOf(global.config.s3BucketBase) == -1) {
      ctx.req.body.image_url = global.config.s3BucketBase + ctx.req.body.image_url;
      var image_url = ctx.req.body.image_url.replace(/ /g, '+');
      User.emit("updateUser", {
        "userId": ctx.req.params.id,
        "image_url": image_url
      });
      console.log("here", image_url);
    }
    next()
  });
  User.afterRemote('*.updateAttributes', function(ctx, model, next) {
    console.log("here in update after ", ctx.req.body);
    var user = ctx.instance;
    var reqBody = ctx.req.body;
    var location = user.basicInfo ? user.basicInfo.location || "" : user.location || "";
    var company = "";
    var designation = "";
    var degree = "";
    var college="";
    var indexBody = {
      "doc": {}
    }
    if (user.experienceList && user.experienceList.length) {
      for(var index in user.experienceList){
        var currentCompany = user.experienceList[index];
        company +=currentCompany.company+",";
        designation += currentCompany.title+",";
      }
      indexBody.doc.company = company;
      indexBody.doc.designation = designation;
    }
    if (user.educationList && user.educationList.length) {
      for(var index in user.educationList){
        var currentEducation = user.educationList[0];
        college += currentEducation.institution+",";
        degree += currentEducation.course+",";
      }
      indexBody.doc.college = college;
      indexBody.doc.degree = degree;
    }
    if(location.length){
      indexBody.doc.searchLocation=location;
    }
    if (indexBody.doc.company || indexBody.doc.college) {
      searchClient.update("user", user.id, indexBody, function(err, resp) {})
    }
    company = "";
    designation = "";

    if (user.experienceList && user.experienceList.length) {
      var currentCompany = user.experienceList[0];
      company = currentCompany.company;
      designation = currentCompany.title;
      indexBody.doc.company = company;
    } else if (user.educationList && user.educationList.length) {
      var currentEducation = user.educationList[0];
      company = currentEducation.institution;
      designation = currentEducation.course;
      indexBody.doc.college = company;
    }
    var newActorInfo = {
      firstName: user.firstName,
      lastName: user.lastName,
      image_url: user.image_url,
      location: location,
      company: company,
      designation: designation
    }

    User.app.models.activity.updateAll({
      "actorId": user.id
    }, {
      "actorInfo": newActorInfo
    }, function(cb, err) {
      next();
    });
  });
  User.beforeRemote('logout', function(ctx, model, next) {
    if (ctx.req && ctx.req.headers && ctx.req.headers["user-agent"]) {
      var userAgent = ctx.req.headers["user-agent"];
      var userId = ctx.req.accessToken.userId;
      var deviceType = "android";
      var res = ctx.res;
      res.clearCookie("shtoken");
      res.clearCookie("shid");
      if (userAgent.indexOf("iOS") > 0) {
        deviceType = "ios";
      }
      User.findById(userId, function(err, user) {
        if(user.deviceARN)
          user.deviceARN[deviceType] = null;
        user.save(function(err, savedUser) {
          next();
        })
      })
    }
  })
  User.beforeRemote('login', function(ctx, model, next) {
    if (ctx.args && ctx.args.credentials) {
      ctx.args.credentials.ttl = 60 * 60 * 24 * 7 * 52;
    }
    ctx.req.body.email = ctx.req.body.email.toLowerCase();
    next();
  });
  // On login success
  User.afterRemote('login', function(context, accessToken, next) {
    var res = context.res;
    var req = context.req;
    var instance = context.instance;
    console.log("req.signedCookies==",req.signedCookies)
    if (accessToken != null) {
      if (accessToken.id != null) {
        res.cookie('shtoken', accessToken.id, {
          signed: req.signedCookies ? true : false,
          maxAge: 1000 * accessToken.ttl
        });
        res.cookie('shid', accessToken.userId.toString(), {
          signed: req.signedCookies ? true : false,
          maxAge: 1000 * accessToken.ttl
        });
      }
      User.findById(accessToken.userId, function(err, user) {
        if(err){
          user={}
        }
        accessToken.firstName = user.firstName || "";
        accessToken.lastName = user.lastName || "";
        accessToken.image_url = user.image_url || "";
        accessToken.email = user.email || "";
        accessToken.role = user.role;
        accessToken.save(function(err,savedAccesstoken){
          return next();
        })
      })
    }
  });

  User.beforeRemote("create",function(ctx,model,next){
    if(!ctx.req.body.role){
      ctx.req.body.role="user";
    }
    //console.log("user in create before remote==>>>", model);
    ctx.req.body.email = ctx.req.body.email ? ctx.req.body.email.toLowerCase() : "";

    User.find({
      where:{
        email:ctx.req.body.email
      }
    }, function(err, userObj) {
      //console.log("userObj in before create model", userObj);
      if(err){
        return next(err);
      } else if( userObj && userObj[0] && userObj[0].isVerificationCodeSent && userObj[0].verificationToken){
        ctx.res.send(userObj[0]);
      } else{
        next();
      }
    })
  })
  var myTokenGenerator = function(user, cb) {
    var rn = require('random-number');
    var gen = rn.generator({
      min:  100000
      ,max: 999999
      ,integer: true
    });
    myToken = gen();
    //console.log("my token after creation of user==>>>", myToken );
    cb(null, myToken);
  };
  User.afterRemote('create', function(context, user, next) {
    if (!context.req.body.emailVerfied) {
      var host = global.config.shrofilehost.replace("http://", "");
      // myTokenGenerator = function(user, cb) {
      //   var rn = require('random-number');
      //   var gen = rn.generator({
      //     min:  100000
      //     ,max: 999999
      //     ,integer: true
      //   });
      //   myToken = gen();
      //   console.log("my token after creation of user==>>>", myToken );
      //   cb(null, myToken);
      // };
      var options = {
        type: 'email',
        to: user.email,
        from: 'noreply@loopback.com',
        subject: 'Thanks for registering.',
        template: path.resolve(__dirname, '../../server/views/verify.ejs'),
        user: user,
        host: host,
        port: "443",
        protocol: 'https',
        text : "Your confirmation code is",
        generateVerificationToken: myTokenGenerator
      };
      User.prototype.verify = function(options, fn) {
        console.log("in my verify method===>>");
        var user = this;
        var userModel = this.constructor;
        var registry = userModel.registry;
        assert(typeof options === 'object', 'options required when calling user.verify()');
        assert(options.type, 'You must supply a verification type (options.type)');
        assert(options.type === 'email', 'Unsupported verification type');
        assert(options.to || this.email, 'Must include options.to when calling user.verify() or the user must have an email property');
        assert(options.from, 'Must include options.from when calling user.verify()');

        options.redirect = options.redirect || '/';
        options.template = path.resolve(options.template || path.join(__dirname, '..', '..', 'templates', 'verify.ejs'));
        options.user = this;
        options.protocol = options.protocol || 'http';

        var app = userModel.app;
        options.host = options.host || (app && app.get('host')) || 'localhost';
        options.port = options.port || (app && app.get('port')) || 3000;
        options.restApiRoot = options.restApiRoot || (app && app.get('restApiRoot')) || '/api';

        var displayPort = (
          (options.protocol === 'http' && options.port == '80') ||
          (options.protocol === 'https' && options.port == '443')
        ) ? '' : ':' + options.port;


        // Email model
        var Email = options.mailer || this.constructor.email || registry.getModelByType(loopback.Email);

        // Set a default token generation function if one is not provided
        var tokenGenerator = options.generateVerificationToken ;

        tokenGenerator(user, function(err, token) {
          if (err) { return fn(err); }
          console.log("tokenGenerator manual==>>", token);
          user.verificationToken = token;
          user.save(function(err) {
            if (err) {
              fn(err);
            } else {
              sendEmail(user);
            }
          });
        });

        // TODO - support more verification types
        function sendEmail(user) {
          options.text = options.text +"  " + user.verificationToken ;

          options.to = options.to || user.email;

          options.subject = options.subject || 'Thanks for Registering';

          options.headers = options.headers || {};

          var template = loopback.template(options.template);
          options.html = template(options);

          Email.send(options, function(err, email) {
            if (err) {
              console.log("email send not successfully", err);
              fn(err);
            } else {
              console.log("email send successfully");
              user.verificationSentTime = new Date();
              user.isVerificationCodeSent = true;
              user.save(function(err) {
                if (err) {
                  fn(err);
                } else {
                  console.log("verificationSentTime added")
                  fn(null, {email: email, token: user.verificationToken, uid: user.id});
                }
              });
            }
          });
        }
        return fn.promise;
      };


      user.verify(options, function(err, response) {
        if (err) {
          User.deleteById(user.id);
          return next(err);
        }
        if (response && response.email && response.email.accepted.length > 0) {
          context.result.emailVerfied = false;
          context.result.message = "You have successfully signed up. Please check your email and copy the verification code."
        } else if (response && response.email && response.email.rejected.length > 0) {
          context.result.emailVerfied = false;
          context.result.message = "Please provide a valid email id"
        }
        console.log('> verification email sent:', response);
        next()
      });
    }else{
      User.emit("onWelcomeEmail",user);
      next()
    }
    User.emit("assignRoletoNewUser",user)
  });
  //
  // before user created
  //
  // Password reset mail will send before create user.
  //
  User.afterRemote("confirm",function(ctx,user,next){
    User.findById(ctx.args.uid,function(err,user){
      User.emit("onWelcomeEmail",user);
      next();
    })
  })
  User.observe('before save', function(ctx, next) {
    if (ctx.instance) {
      ctx.instance.username = ctx.instance.email;
    }
    var isNew = ctx.instance && ctx.isNewInstance;
    if (isNew) {
      ctx.instance.joiningDate = new Date();
      ctx.instance.firstName= ctx.instance.firstName ? ctx.instance.firstName.toProperCase() : "";
      ctx.instance.lastName= ctx.instance.lastName ? ctx.instance.lastName.toProperCase() : "";
    }
    if (ctx.currentInstance) {
      ctx.currentInstance.username = ctx.currentInstance.email;
    }
    if (ctx.instance && ctx.instance.imageUrl) {
      ctx.instance.imageUrl = ctx.instance.imageUrl.replace("http", "https");
      ctx.instance.image_url = ctx.instance.imageUrl;
    }

    console.log("provider====", ctx.instance);
    next();
  });

  //send password reset link when requested
  User.on('resetPasswordRequest', function(info) {
    User.findOne({
      where:{
        email:info.email
      }
    }, function(err, data) {
      if (err) {
        return cb(err)
      } else {
        var url = global.config.shrofilehost + '/reset-password';
        var html = 'Hi ' + data.firstName + ',<br />' + 'Please click on the link below to to reset your password:' + '<br />' + '<a href=" ' + url + '?access_token=' + info.accessToken.id + '">Reset Password</a>';
        User.app.models.Email.send({
          to: info.email,
          from: info.email,
          subject: 'Forgot your password?',
          html: html
        }, function(err) {
          if (err) return console.log('> error sending password reset email');
          console.log('> sending password reset email to:', info.email);
        });
      }
    })
  });

  //
  // This is a model hook. This will be called after each user created.
  // https://loopback.io/doc/en/lb2/Operation-hooks.html
  //
  // 1. Add questions to the newly created user from question templates. The question templates are loaded at the time of boot.
  // 2.
  User.observe('after save', function(ctx, next) {

    var isNew = ctx.instance && ctx.isNewInstance;
    if (!isNew) {
      // Don't continue if its not a new instance
      return next();
    }
    var instance = ctx.instance;
    console.log('user created ' + instance.username);
    var userId = instance.id;
    var firstName = instance.firstName;
    var lastName = instance.lastName;
    var Config = dataSource.getModel('config');
    var templates = null;
    Config.find({
        where: {
          name: 'QUESTION_TEMPLATE'
        },
        limit: 1
      }, function(err, config) {

        if (err) {
          throw err;
        }

        if (config) {
          templates = JSON.parse(config[0].value);

          var userQuestions = [];

          for (var i = templates.length - 1; i >= 0; i--) {
            var q = {};
            q.type = templates[i].type;
            q.section = templates[i].section;
            q.name = templates[i].name;
            q.description = templates[i].description;
            q.submittedAt = new Date();
            q.text = templates[i].description;
            q.colorcode = templates[i].color;
            if (templates[i].hint.length > 0) {
              q.hint = templates[i].hint.split(',');
            }
            q.userId = userId;
            q.order = templates[i].id;
            q.multiple = templates[i].multiple;
            q.displayOrder = templates[i].displayOrder;
            q.image = templates[i].icon;
            q.answerTemplate = templates[i].answerTemplate;
            userQuestions.push(q);
          }

          console.log("Questions " + userQuestions.length + " created for user " + userId);

          app.models.question.create(userQuestions,
            function(err, question) {
              if (err)
                console.log('Error in loading questions', err);
            });
        }
      }

    );
    var userActivity = new User.app.models.userActivity({
      "userId": instance.id,
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
    User.emit("newUser", instance);
    next();
  });

  User.generateUserActivity = function(cb){
    this.find({
      where:{
        emailVerfied:true
      },
      fields:{
        "_id":1
      }
    },function(err,users){
      for(var index in users){
        var userId = users[index].id;
        (function(userId){

        })(userId);
      }
    })
  }
  //
  // GET /api/users/getExpressions
  //
  User.getExpressions = function(userId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    console.log("userid", userId);
   
    if(userId){
      User.app.models.activity.find({
        where: {
          actorId: ObjectID(userId),
        },
        order: 'createdAt DESC'
      }, function(err, data) {
        if (err) {
          cb(err);
        } else {
          console.log("in getExpressions api data==>>>", data)
          cb(null,data);
        }
      });
    }else{
      cb(null, []);
    }
  };
  //
  // API GET /profile/:id
  //
  User.getPublicProfile = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var profile = {};
    var profilePromise = new Promise(function(resolve, reject) {
      User.findById(id, function(err, data) {
        if (err)
          reject(err);
        else {
          resolve(data);
        }
      })
    })
    var followersPromise = new Promise(function(resolve, reject) {
      User.app.models.follower.find({
        where: {
          followerId: id
        }
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    var communityCountPromise = new Promise(function(resolve, reject) {
      User.app.models.member.count({
        "userId": currentUser.id,
        "status": "approved"
      }, function(err, data) {
        if (err)
          reject(err)
        else
          resolve(data.count)
      })
    })
    var followingPromise = new Promise(function(resolve, reject) {
      User.app.models.follower.find({
        where: {
          userId: id
        }
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // getting all the answer activities
    var activitiesPromise = new Promise(function(resolve, reject) {
      User.app.models.activity.find({
        where: {
          actorId: id,
          public: true
        },
        order: 'submittedAt DESC'
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var taglinePromise = new Promise(function(resolve, reject) {
      User.app.models.answer.find({
        where: {
          userId: id,
          order: 53
        },
        order: 'submittedAt DESC',
        limit: 1
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var isFollowingPromise = new Promise(function(resolve, reject) {
      var uniqueFollowerId = currentUser.id + id;
      User.app.models.follower.findById(uniqueFollowerId, function(err, data) {
        var isFollowing = false;
        if (err)
          reject(err)
        else {
          if (data && data.id) {
            isFollowing = true;
          }
          resolve(isFollowing);
        }
      })
    })

    var introVideoPromise = new Promise(function(resolve, reject) {
      User.app.models.answer.findOne({
        where: {
          userId: id,
          order: 1,
          public: true
        },
        order: 'submittedAt DESC'
      }, function(err, answer) {
        if (err)
          reject(err)
        else {
          var url = "";
          var coverImage = "";
          if (answer && answer.answer && answer.answer.url) {
            url = answer.answer.url;
            coverImage = answer.answer.coverImage;
          }
          var returnObj = {
            url: url,
            coverImage: coverImage
          }
          resolve(returnObj)
        }
      })
    })

    var myLikesPromise = new Promise(function(resolve, reject) {
      User.app.models.like.find({
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

    var blockedUserPromise = new Promise(function(resolve, reject) {
      User.app.models.blockuser.find({
        where: {
          or: [{
            and: [{
              userId: currentUser.id,
              blockedUserId: id
            }]
          }, {
            and: [{
              userId: id,
              blockedUserId: currentUser.id
            }]
          }]
        }
      }, function(err, blockedUsers) {
        if (err)
          reject(err)
        else {
          resolve(blockedUsers);
        }
      })
    })
    var promiseArray = [];
    promiseArray.push(profilePromise, followersPromise, followingPromise, activitiesPromise, taglinePromise, isFollowingPromise, introVideoPromise, myLikesPromise, blockedUserPromise, communityCountPromise);
    Promise.all(promiseArray).then(function(resolveArr) {
      var profileData = resolveArr[0];
      var blockeduser = resolveArr[8];
      profile.id = id;
      profile.firstName = profileData.firstName.replace(/\s+/g,"");;
      profile.lastName = profileData.lastName.replace(/\s+/g,"");;
      profile.image_url = profileData.image_url;
      profile.communityCount = resolveArr[9];
      profile.psychographicVisible = false;
      if (blockeduser && blockeduser.length > 0) {
        profile.userBlocked = true;
      }
      profile.views = profileData.profileViews;
      profile.tagLine = "";
      profile.educationList = profileData.educationList || [];
      profile.experienceList = profileData.experienceList || [];
      if (profileData && profileData.basicInfo && profileData.basicInfo.summary) {
        profile.tagLine = profileData.basicInfo.summary;
      } else if (resolveArr[4].length) {
        profile.tagLine = resolveArr[4][0].answer.message;
      }
      if (profileData && profileData.basicInfo && profileData.basicInfo.location) {
        profile.location = profileData.basicInfo.location || "";
      } else {
        profile.location = profileData.location || "";
      }
      var company = "";
      var designation = "";
      profile.identity = profileData.identity || "";
      if (profileData.experienceList && profileData.experienceList.length) {
        var currentCompany = profileData.experienceList[0];
        company = currentCompany.company;
        designation = currentCompany.title;
        profile.identity = designation + " at " + company
      } else if (profileData.educationList && profileData.educationList.length) {
        var currentEducation = profileData.educationList[0];
        company = currentEducation.institution;
        designation = currentEducation.course;
        profile.identity = designation + " at " + company
      }

      profile.followers = resolveArr[1].length;
      profile.following = resolveArr[2].length;
      profile.feed = resolveArr[3];
      var myLikes = resolveArr[7];
      for (var index = 0; index < profile.feed.length; index++) {
        var resourceInfoAnswerId = profile.feed[index]['resourceInfo']['answerId'];
        profile.feed[index]['resourceInfo']['isLiked'] = false;
        if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
          profile.feed[index]['resourceInfo']['isLiked'] = true;
        }
      }
      profile.eduInfo = {};
      profile.workInfo = {};
      profile.isfollowing = resolveArr[5];
      profile.url = resolveArr[6].url;
      profile.coverImage = resolveArr[6].coverImage;
      if (profile.userBlocked) {
        profile.feed = [];
      }
      cb(null, profile);
    }, function(rejectArr) {
      return cb(rejectArr)
    });
  }

  //
  // API GET /myprofile
  //
  User.myProfile = function(cb) {

    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var profile = {};
    var followersPromise = new Promise(function(resolve, reject) {
      User.app.models.follower.find({
        where: {
          followerId: ObjectID(currentUser.id)
        }
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var followingPromise = new Promise(function(resolve, reject) {
      User.app.models.follower.find({
        where: {
          userId: ObjectID(currentUser.id)
        }
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    var communityCountPromise = new Promise(function(resolve, reject) {
      User.app.models.member.count({
        "userId": currentUser.id,
        "status": "approved"
      }, function(err, data) {
        if (err)
          reject(err)
        else
          resolve(data)
      })
    })
    // Getting unanswered question.
    var questionPromise = new Promise(function(resolve, reject) {
      User.app.models.question.find({
        where: {
          userId: currentUser.id,
          answerCount: 0
        },
        order: 'order'
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    // getting all the answer activities
    var activitiesPromise = new Promise(function(resolve, reject) {
      User.app.models.activity.find({
        where: {
          actorId: ObjectID(currentUser.id),
        },
        order: 'createdAt DESC'
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var eduPromise = new Promise(function(resolve, reject) {
      User.app.models.answer.find({
        where: {
          userId: currentUser.id,
          order: 48
        },
        order: 'submittedAt DESC',
        limit: 1
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var workPromise = new Promise(function(resolve, reject) {
      User.app.models.answer.find({
        where: {
          userId: currentUser.id,
          order: 47
        },
        order: 'submittedAt DESC',
        limit: 1
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    var introVideoPromise = new Promise(function(resolve, reject) {
      User.app.models.answer.find({
        where: {
          userId: currentUser.id,
          order: 1
        },
        order: 'submittedAt DESC'
      }, function(err, answers) {
        if (err)
          reject(err)
        else {
          var url = "";
          var coverImage = "";
          for (var index in answers) {
            var answer = answers[index];
            if (answer && answer.answer && answer.answer.url && index == 0) {
              url = answer.answer.url;
              coverImage = answer.answer.coverImage;
            }
            if (answer && answer.answer && answer.answer.url && answer.public) {
              url = answer.answer.url;
              coverImage = answer.answer.coverImage;
              break;
            }
          }

          var returnObj = {
            url: url,
            coverImage: coverImage
          }
          resolve(returnObj)
        }
      })
    })

    var myLikesPromise = new Promise(function(resolve, reject) {
      User.app.models.like.find({
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

    var currentUserPromise = new Promise(function(resolve,reject){
      User.findById(currentUser.id,function(err,user){
        if(err)
          reject(err)
        else {
          resolve(user)
        }
      })
    })
    var promiseArray = [];
    promiseArray.push(followersPromise, followingPromise, questionPromise, activitiesPromise, eduPromise, workPromise, introVideoPromise, myLikesPromise, communityCountPromise,currentUserPromise);
    Promise.all(promiseArray).then(function(resolveArr) {
      profile.followers = resolveArr[0].length;
      profile.following = resolveArr[1].length;
      profile.eduInfo = resolveArr[4];
      profile.workInfo = resolveArr[5];
      profile.question = resolveArr[2];
      profile.feed = resolveArr[3];
      profile.communityCount = resolveArr[8];
      var currentUser = resolveArr[9];

      //start filling basic info
      profile.id = currentUser.id;
      profile.firstName = currentUser.firstName.replace(/\s+/g,"");
      profile.lastName = currentUser.lastName.replace(/\s+/g,"");;
      profile.image_url = currentUser.image_url;
      profile.views = currentUser.profileViews;
      profile.email = currentUser.email;
      profile.tagLine = "";
      if (currentUser.basicInfo && currentUser.basicInfo.summary) {
        profile.tagLine = currentUser.basicInfo.summary;
      }
      if (currentUser.basicInfo && currentUser.basicInfo.location) {
        profile.location = currentUser.basicInfo.location || "";
      } else {
        profile.location = currentUser.location || "";
      }
      var company = "";
      var designation = "";
      profile.identity = currentUser.identity || "";
      if (currentUser.experienceList && currentUser.experienceList.length) {
        var currentCompany = currentUser.experienceList[0];
        company = currentCompany.company;
        designation = currentCompany.title;
        profile.identity = designation + " at " + company
      } else if (currentUser.educationList && currentUser.educationList.length) {
        var currentEducation = currentUser.educationList[0];
        company = currentEducation.institution;
        designation = currentEducation.course;
        profile.identity = designation + " at " + company
      }
      profile.education = currentUser.education || "";
      profile.educationList = currentUser.educationList || [];
      profile.experienceList = currentUser.experienceList || [];
      profile.psychographicVisible = false;
      //end filling basic info

      var myLikes = resolveArr[7];
      for (var index = 0; index < profile.feed.length; index++) {
        var resourceInfoAnswerId = profile.feed[index]['resourceInfo']['answerId'];
        profile.feed[index]['resourceInfo']['isLiked'] = false;
        if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
          profile.feed[index]['resourceInfo']['isLiked'] = true;
        }
      }
      profile.url = resolveArr[6].url;
      profile.coverImage = resolveArr[6].coverImage;
      cb(null, profile);
    }, function(rejectArr) {
      return cb(rejectArr)
    });
  }
  var getParticularTabData = function(currentUser, getTab, callback){
    //get a particular tab data logic here
    //getTab={"tabid":1, "skip":5, "limit":8}
    console.log("getParticularTabData is called ===>>>")
    if(getTab && getTab.tabid==1){
      //expressions tab data
      var skipCount = getTab.skip ? getTab.skip :0;
      var limitCount = getTab.limit ? getTab.limit:0;
      var myLikesPromise = new Promise(function(resolve, reject) {
        User.app.models.like.find({
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
            console.log("returnArr in likes promise", returnArr);
            resolve(returnArr);
          }
        })
      });

      // getting all the answer activities
      var activitiesPromise = new Promise(function(resolve, reject) {
        User.app.models.activity.find({
          where: {
            actorId: ObjectID(currentUser.id),
          },
          order: 'createdAt DESC',
          limit: limitCount, skip: skipCount
        }, function(err, data) {
          if (err) {
            reject(err);
          } else {
            console.log("in v2 my profile activitiesPromise==>>>", data)
            resolve(data);
          }
        });
      });
      var promiseArray = [];

      promiseArray.push(activitiesPromise,  myLikesPromise);
      
      Promise.all(promiseArray).then(function(resolveArr) {
        console.log("promise all", resolveArr);
        var myLikes = resolveArr[1];
        var feed = resolveArr[0];
        for (var index = 0; index < feed.length; index++) {
          var resourceInfoAnswerId = feed[index]['resourceInfo']['answerId'];
          feed[index]['resourceInfo']['isLiked'] = false;
          if (myLikes && (myLikes.indexOf(resourceInfoAnswerId.toString())) != -1) {
            console.log("feed is liked ", myLikes.indexOf(resourceInfoAnswerId.toString()))
            feed[index]['resourceInfo']['isLiked'] = true;
          }
        }
        var expressionsTab = {
          "name":"Expressions",
          "tabid":1,
          "priority":1,
          "tabData":feed
        };
        callback(null, expressionsTab);
      }, function(rejectArr) {
        console.log("promise all rejectarr", rejectArr);
        callback(rejectArr)
      });
    }else if(getTab && getTab.tabid==2){
      User.findById(currentUser.id,function(err, data){
        if(err){
          callback(err)
        }else {
          console.log("getParticularTabData where tabid is not 1 but it's 2", data)

          var resumeTab = { 
            "name":"Resume",
            "tabid":2,
            "priority":2,
            "tabData":{
              "educationList":data.educationList ? data.educationList: [],
              "experienceList": data.experienceList ? data.experienceList: [],
              "resumeUrl" : data.resumeUrl? data.resumeUrl : ''
            }
          };
          console.log("getParticularTabData where tabid is not 1 but it's 2", resumeTab)
          callback(null, resumeTab);
        }
      })
    }else if(getTab && getTab.tabid==3){
      console.log("getParticularTabData where tabid is 3 i.e Updates section");
      var skipCount = getTab.skip ? getTab.skip :0;
      var limitCount = getTab.limit ? getTab.limit:0;
      User.app.models.answer.find({
        where: {
          "userId": ObjectID(currentUser.id),
          "questionName" : /^MY\nSTATUS UPDATE/i
        },
        order: 'submittedAt DESC',
        limit: limitCount, 
        skip: skipCount
      }, function(err, statuses){
        if(err){
          console.log("Error in sending statuses  to send in my profilev2 ===>>>", err)
          callback(err)
        }else {
          console.log("statuses  to send in my profilev2 ===>>>", statuses)
          callback(null, statuses)
        }
      })
    }else if(getTab && getTab.tabid==4){
      //recommendations feed data get
      console.log("getParticularTabData where tabid is 4");
      var skipCount = getTab.skip ? getTab.skip :0;
      var limitCount = getTab.limit ? getTab.limit:0;
      User.findById(currentUser.id,function(err,user){
        if(err)
          callback(err)
        else {
          user.recommendations({limit: limitCount, skip: skipCount}, function(err, data){
            if (err) {
              console.log("in v2 my profile recommendations==>>>", err)
              callback(err);
            } else {
              console.log("in v2 my profile recommendations==>>>", data)
              var recommendationsTab = {
                "name":"Recommendations",
                "tabid":4,
                "priority":4,
                "tabData":data
              };
              callback(null, recommendationsTab);
            }
          })
        }
      })
    }
  }
  // API GET /myprofileV2
  //profile v2
  User.myprofileV2= function(tabid, skip, limit, cb) {
    //console.log("in v2 my profile==>>>")
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("in v2 my profile==>>>", ctx, tabid)
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    if(tabid){
      var getTab = {
        tabid : tabid,
        skip: skip,
        limit: limit
      };
      getParticularTabData(currentUser, getTab, function(err, response){
        if(err){
          return cb(err);
        } else{
          return cb(null, response);
        }
      })
    }else{
      var profile = {};
      var followersPromise = new Promise(function(resolve, reject) {
        User.app.models.follower.find({
          where: {
            followerId: ObjectID(currentUser.id)
          }
        }, function(err, data) {
          if (err) {
            reject(err);
          } else {
            console.log("in v2 my profile followersPromise==>>>", data)
            resolve(data);
          }
        });
      });
      var communityCountPromise = new Promise(function(resolve, reject) {
        User.app.models.member.count({
          "userId": currentUser.id,
          "status": "approved"
        }, function(err, data) {
          if (err)
            reject(err)
          else{
            console.log("in v2 my profile communityCountPromise==>>>", data)
            resolve(data)
          }
        })
      })

      var currentUserPromise = new Promise(function(resolve,reject){
        User.findById(currentUser.id,function(err,user){
          if(err)
            reject(err)
          else {
            resolve(user);
          }
        })
      })
      //written by siddhant to evaluate score for a profile
      var profileScorePromise = new Promise(function(resolve,reject){
        // {
        //   "profilePic":10,
        //   "shortIntro":20,
        //   "3expressions":30,
        //   "work/resume":10,
        //   "recommendation":10
        // }
        var eachScore ={
          "Expressions":0,
          "Updates":0,
          "Resume":0,
          "Recommendations":0
        };
        User.findById(currentUser.id,function(err,user){
          if(err)
            reject(err)
          else {
            if(user){
              console.log("user in score", user);
              if(user.image_url){
                eachScore.Updates = 10
              }
              if(user.educationList && user.educationList.length>0 ){
                eachScore.Resume += 5
              }
              if(user.experienceList && user.experienceList.length>0 ){
                eachScore.Resume += 5
              }
              if(user.publicVideoCount){
                if(user.publicVideoCount==1){
                  eachScore.Expressions = 10
                }
                if(user.publicVideoCount==2){
                  eachScore.Expressions = 20
                }
                if(user.publicVideoCount >=3){
                  eachScore.Expressions = 30
                }
              }
              console.log("in v2 my profile score1==>>>", eachScore)
              resolve(eachScore)
              eachScore ={
                "Expressions":0,
                "Updates":0,
                "Resume":0,
                "Recommendations":0
              };
            }else{
              console.log("in v2 my profile score2==>>>", eachScore)
              resolve(eachScore)
            }
          }
        })
      })
      var promiseArray = [];

      promiseArray.push(followersPromise,  communityCountPromise, currentUserPromise, profileScorePromise);
      
      Promise.all(promiseArray).then(function(resolveArr) {
        console.log("promise all", resolveArr);
        var currentUser = resolveArr[2];
        //start filling basic info
        var headerData = {
          firstName : currentUser.firstName.replace(/\s+/g,""),
          lastName :currentUser.lastName.replace(/\s+/g,""),
          image_url : currentUser.image_url ? currentUser.image_url : "",
          userstat:[
            {followers : resolveArr[0] ? resolveArr[0].length:0},
            {groups :  resolveArr[1] ?  resolveArr[1] :0}
          ],
          location:'',
          id:currentUser.id
        }
        if (currentUser.basicInfo && currentUser.basicInfo.summary) {
          headerData.tagLine = currentUser.basicInfo.summary;
        }
        if (currentUser.basicInfo && currentUser.basicInfo.location) {
          headerData.location = currentUser.basicInfo.location || "";
        } else {
          headerData.location = currentUser.location || "";
        }
        var company = "";
        var designation = "";
        headerData.identity = currentUser.identity || "";
        if (currentUser.experienceList && currentUser.experienceList.length) {
          var currentCompany = currentUser.experienceList[0];
          company = currentCompany.company;
          designation = currentCompany.title;
          headerData.identity = designation + " at " + company
        } else if (currentUser.educationList && currentUser.educationList.length) {
          var currentEducation = currentUser.educationList[0];
          company = currentEducation.institution;
          designation = currentEducation.course;
          headerData.identity = designation + " at " + company
        }

        //profile score calculate
        var score = resolveArr[3];
        headerData.profileScore = score.Expressions + score.Updates + score.Resume + score.Recommendations ;
        profile.headerData = headerData;
        profile.tabs = []

        var ExpressionsTab = {
          "name":"Expressions",
          "tabid":1,
          "priority":1,
          "score":score.Expressions,
          "tabData":[]
        };
        
        var ResumeTab = { 
          "name":"Resume",
          "tabid":2,
          "priority":2,
          "score":30,
          "tabData":{}
        };

        var RecommendationsTab = { 
          "name":"Recommendations",
          "tabid":4,
          "priority":4,
          "score":score.Recommendations,
          "tabData":[]
        };

        var UpdatesTab = { "name":"Updates",
          "tabid":3,
          "priority":3,
          "score":score.Updates,
          "tabData":[]
        };
        profile.tabs.push(ExpressionsTab);
        profile.tabs.push(ResumeTab);  
        profile.tabs.push(UpdatesTab);    
        profile.tabs.push(RecommendationsTab); 
        cb(null, profile);
      }, function(rejectArr) {
        console.log("promise all rejectarr", rejectArr);
        return cb(rejectArr)
      });
    }
  }
  //new profile mock apis
  //GET "/myProfileV2Mock"
  User.myProfileV2Mock = function(cb){
    var dataToSend ={
      "followers":1,
      "following":5,
      "eduInfo":[
      ],
      "workInfo":[
      ],
      "question":[
          {
              "answerCount":0,
              "type":"Video",
              "section":"Lifestyle",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"HOW DO\nI UNWIND",
              "description":"How do you unwind when you are stressed? ",
              "text":"How do you unwind when you are stressed? ",
              "colorcode":"#8e7cc3",
              "hint":[
                  "What relaxes you?",
                  " Thoughts",
                  " People",
                  " Why this one?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/10.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2733d",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":10,
              "multiple":0,
              "displayOrder":[
                  39
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nINSPIRATION",
              "description":"Who is your inspiration? ",
              "text":"Who is your inspiration? ",
              "colorcode":"#f56d44",
              "hint":[
                  "Your Role Model",
                  " A Distinctive Attribute",
                  " What You Learnt?",
                  " Share it!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/11.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27325",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":11,
              "multiple":0,
              "displayOrder":[
                  16
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"IF I WERE\nA SUPERHERO",
              "description":"If you were a superhero, who would you be?",
              "text":"If you were a superhero, who would you be?",
              "colorcode":"#303F9F",
              "hint":[
                  "Who'd you be?",
                  " Unleash your",
                  " superpower",
                  " Why?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/12.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27353",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":12,
              "multiple":0,
              "displayOrder":[
                  61
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nQUOTE",
              "description":"What is your favorite quote? ",
              "text":"What is your favorite quote? ",
              "colorcode":"#26abd1",
              "hint":[
                  "The quote",
                  " Say it",
                  " Feel it!",
                  " Who said it?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/13.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems 10-23 14:49:33.553 19119-21321/? D/OkHttp: ":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27332",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":13,
              "multiple":0,
              "displayOrder":[
                  28,
                  4
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY EDITED\nWORLD",
              "description":"One thing you would change in the world?",
              "text":"One thing you would change in the world?",
              "colorcode":"#dfc72b",
              "hint":[
                  "Imagine it!",
                  " Explain the change",
                  " Why this one?",
                  " What's the impact?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/14.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734d",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":14,
              "multiple":0,
              "displayOrder":[
                  55
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"AS SEEN BY\nMY FRIENDS",
              "description":"How do your friends see you?",
              "text":"How do your friends see you?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Their feelings",
                  " Experiences",
                  " Views",
                  " Perception"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/15.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27341",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":15,
              "multiple":0,
              "displayOrder":[
                  43
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Aspirations",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"SPENDING A\nBILLION DOLLARS",
              "description":"How would you spend a billion dollars? ",
              "text":"How would you spend a billion dollars? ",
              "colorcode":"#a0b723",
              "hint":[
                  "What'll you buy?",
                  " Why so",
                  " Your feeling",
                  " What'll you save?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/16.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27330",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":16,
              "multiple":0,
              "displayOrder":[
                  27
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"ONE CHANGE\nIN ME",
              "description":"One thing you would change about yourse 10-23 14:49:33.553 19119-21321/? D/OkHttp: lf?",
              "text":"One thing you would change about yourself?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Describe it",
                  " Why this one?",
                  " What Impact?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/17.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27345",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":17,
              "multiple":0,
              "displayOrder":[
                  47
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"A\nFUN FACT",
              "description":"A fun fact about you",
              "text":"A fun fact about you",
              "colorcode":"#ea4e23",
              "hint":[
                  "Talent",
                  " Collection",
                  " Experience",
                  " Moment"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/18.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27342",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":18,
              "multiple":0,
              "displayOrder":[
                  44
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY TOTAL\nMAKEOVER",
              "description":"If you could, how'd you totally change yourself?",
              "text":"If you could, how'd you totally change yourself?",
              "colorcode":"#dfc72b",
              "hint":[
                  "Alternate you",
                  " Physical...",
                  " or spiritual",
                  " Why this one? Explain it!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/19.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734e",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":19,
              "multiple":0,
              "displayOrder":[
                  56
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY TALENT\nUPGRADE",
              "description":"What skills would you like to develop?",
              "text":"What skills would you like to develop?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Your Desire",
                  " For how long?",
                  " What's stopping you?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/20.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27343",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":20,
              "multiple":0,
              "displayOrder":[
                  45
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Lifestyle",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nHOBBY",
              "description":"What is your active hobby? ",
              "text":"What is your active hobby? ",
              "colorcode":"#8e7cc3",
              "hint":[
                  "Sports",
                  " Painting",
                  " Music",
                  " Reading"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/21.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2733e",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":21,
              "multiple":0,
              "displayOrder":[
                  40
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"FLAUNT MY\nTALENT",
              "description":"What talent would you like to show off?",
              "text":"What talent would you like to show off?",
              "colorcode":"#f56d44",
              "hint":[
                  "Introduce",
                  " Perform",
                  " Show-off",
                  " Take a bow!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/22.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27326",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":22,
              "multiple":0,
              "displayOrder":[
                  17
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nBOOK",
              "description":"Which book can you not put down?",
              "text":"Which book can you not put down?",
              "colorcode":"#26abd1",
              "hint":[
                  "Book",
                  " Author",
                  " Genre",
                  " The favorite part!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/23.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27333",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":23,
              "multiple":0,
              "displayOrder":[
                  29
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"FEEDBACK\nTO ME",
              "description":"How do you like to receive feedback?",
              "text":"How do you like to receive feedback?",
              "colorcode":"#dfc72b",
              "hint":[
                  "When",
                  " Where",
                  " How Frequently",
                  " Style of communication"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/15.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation","Contrast"]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27352",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":24,
              "multiple":0,
              "displayOrder":[
                  60
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nZEN ZONE",
              "description":"What place do you go to be at peace?",
              "text":"What place do you go to be at peace?",
              "colorcode":"#26abd1",
              "hint":[
                  "The spot",
                  " Why is it..",
                  " Peaceful?",
                  " How often d'you go?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/25.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2733a",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":25,
              "multiple":0,
              "displayOrder":[
                  36
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nRESTAURANT",
              "description":"What is your favourite restaurant?",
              "text":"What is your favourite restaurant?",
              "colorcode":"#26abd1",
              "hint":[
                  "Restaurant name",
                  " Location",
                  " Why you like it",
                  " Cuisine!!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/26.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27336",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":26,
              "multiple":0,
              "displayOrder":[
                  32
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nARTIST",
              "description":"Who is your favorite artist?",
              "text":"Who is your favorite artist?",
              "colorcode":"#26abd1",
              "hint":[
                  "Artist name",
                  " Genre",
                  " What fascinates?",
                  " Have you met?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/27.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27337",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":27,
              "multiple":0,
              "displayOrder":[
                  33
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nGET 10-23 14:49:33.553 19119-21321/? D/OkHttp: AWAY",
              "description":"What your favorite getaway destination?",
              "text":"What your favorite getaway destination?",
              "colorcode":"#26abd1",
              "hint":[
                  "Destination Name",
                  " What's special?",
                  " Memories",
                  " Favorite spot?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/28.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27339",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":28,
              "multiple":0,
              "displayOrder":[
                  35
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nSPORTS HERO",
              "description":"What is your favourite sports Personality?",
              "text":"What is your favourite sports Personality?",
              "colorcode":"#26abd1",
              "hint":[
                  "Name",
                  " Sport",
                  " Traits you admire",
                  " Do you play?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/29.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27338",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":29,
              "multiple":0,
              "displayOrder":[
                  34
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Aspirations",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY LIFE'S\nAMBITION",
              "description":"What is your ambition in life?",
              "text":"What is your ambition in life?",
              "colorcode":"#a0b723",
              "hint":[
                  "Goal",
                  " Vision",
                  " Mission",
                  " Dreams!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/30.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2732b",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":30,
              "multiple":0,
              "displayOrder":[
                  22
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Aspirations",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nDREAM JOB",
              "description":"What is your dream job? ",
              "text":"What is your dream job? ",
              "colorcode":"#a0b723",
              "hint":[
                  "Think big!",
                  " Describe it",
                  " Why this one?",
                  " Your role?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/31.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video 10-23 14:49:33.553 19119-21321/? D/OkHttp: "
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2732d",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":31,
              "multiple":0,
              "displayOrder":[
                  24
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"IF I HAD\nA SUPERPOWER",
              "description":"What superpower you'd like to have?",
              "text":"What superpower you'd like to have?",
              "colorcode":"#dfc72b",
              "hint":[
                  "Describe it",
                  " How'd you use it? ",
                  " What'll it change?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/32.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734f",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":32,
              "multiple":0,
              "displayOrder":[
                  57
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"HAPPINESS\nFOR ME",
              "description":"What makes you happy?",
              "text":"What makes you happy?",
              "colorcode":"#dfc72b",
              "hint":[
                  "Source of joy",
                  " Feeling",
                  " Why this one?",
                  " Share It!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/33.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27350",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":33,
              "multiple":0,
              "displayOrder":[
                  58
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Wishes",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY ONE\nWISH",
              "description":"If you had one wish, what would you ask for?",
              "text":"If you had one wish, what would you ask for?",
              "colorcode":"#dfc72b",
              "hint":[
                  "Share your wish",
                  " Why this one?",
                  " What will change?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/34.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27351",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":34,
              "multiple":0,
              "displayOrder":[
                  59
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nREGRET",
              "description":"What is your regret in life?",
              "text":"What is your regret in life?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Share the regret",
                  " Why this one?",
                  " Realization",
                  " Are you over it?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/36.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "gr 10-23 14:49:33.553 19119-21321/? D/OkHttp: ayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27348",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":36,
              "multiple":0,
              "displayOrder":[
                  50
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nFEARS",
              "description":"What are the things that you fear about?",
              "text":"What are the things that you fear about?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Share your fears",
                  " Explain why",
                  " the feeling...",
                  " Are you over it?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/37.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734c",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":37,
              "multiple":0,
              "displayOrder":[
                  54
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY MOMENT OF\nAMAZEMENT",
              "description":"What's your most Amazing Moment?",
              "text":"What's your most Amazing Moment?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Share the moment",
                  " How amazing",
                  " was the feeling?",
                  " Do it again?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/38.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27349",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":38,
              "multiple":0,
              "displayOrder":[
                  51
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY MEMORABLE\nMOMENT",
              "description":"What's your most Memorable Moment?",
              "text":"What's your most Memorable Moment?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Share the moment",
                  " Describe it",
                  " the pleasant memories!",
                  " Did you capture it?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/39.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734a",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":39,
              "multiple":0,
              "display 10-23 14:49:33.553 19119-21321/? D/OkHttp: Order":[
                  52
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Achievements",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY GREATEST\nCHALLENGE",
              "description":"A goal that you achieved against all odds",
              "text":"A goal that you achieved against all odds",
              "colorcode":"#19a488",
              "hint":[
                  "State the goal",
                  " Roadblocks",
                  " Your journey",
                  " Final outcome"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/40.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27329",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":40,
              "multiple":0,
              "displayOrder":[
                  20
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nBIGGEST FAILURE",
              "description":"What has been your biggest failure?",
              "text":"What has been your biggest failure?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Share it",
                  " How did you react",
                  " What did you learn",
                  " Are you over it?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/41.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2734b",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":41,
              "multiple":0,
              "displayOrder":[
                  53
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nMOTTO",
              "description":"What is your motto in life?",
              "text":"What is your motto in life?",
              "colorcode":"#f56d44",
              "hint":[
                  "Beliefs",
                  " Style",
                  " Central Idea",
                  " Say it aloud!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/42.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27322",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":42,
              "multiple":0,
              "displayOrder":[
                  13
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nLAST WORDS",
              "description":"What would you like your last words to be?",
              "text":"What would you like your last words to be?",
              "colorcode":"#ea4e23",
              "hint":[
                  "Last words",
                  " Means what...",
                  " Who is it meant for?",
                  " Why these words?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/43.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItem 10-23 14:49:33.553 19119-21321/? D/OkHttp: s":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27346",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":43,
              "multiple":0,
              "displayOrder":[
                  48
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Reflections",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY MOMENT OF\nGRATITUDE",
              "description":"What are you most grateful for?",
              "text":"What are you most grateful for?",
              "colorcode":"#ea4e23",
              "hint":[
                  "What was it?",
                  " Who was it",
                  " that helped you?",
                  " How did you feel?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/44.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27347",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":44,
              "multiple":0,
              "displayOrder":[
                  49
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY ARSENAL OF\nSKILLS",
              "description":"What are your most valuable skills?",
              "text":"What are your most valuable skills?",
              "colorcode":"#f56d44",
              "hint":[
                  "What",
                  " Since When",
                  " Acquired how?",
                  " Most useful when!!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/49.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27327",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":49,
              "multiple":0,
              "displayOrder":[
                  18
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Favorites",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY FAVORITE\nPOLITICAL LEADER",
              "description":"Who is your favourite political leader?",
              "text":"Who is your favourite political leader?",
              "colorcode":"#26abd1",
              "hint":[
                  "Name",
                  " What fascinates",
                  " Impact",
                  " Learnings"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/24.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27334",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":52,
              "multiple":0,
              "displayOrder":[
                  30
              ]
          },
          {
              "answerCount":0,
              "type":"Text",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY ONE LINE\nBIO",
              "description":"Your life in a phrase",
              "text":"Your life in a phrase",
              "colorcode":"#f56d44 10-23 14:49:33.553 19119-21321/? D/OkHttp: ",
              "hint":[
                  "Biography",
                  " Short",
                  " ..& sweet",
                  " Distinctively You!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/53.jpg",
              "answerTemplate":{
                  "type":"object",
                  "properties":{
                      "message":{
                          "type":"string",
                          "description":"brief text."
                      },
                      "bcolor":{
                          "type":"string",
                          "description":"background color"
                      }
                  },
                  "required":[
                      "message"
                  ]
              },
              "id":"59cb4f0e8781b81014b27321",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":53,
              "multiple":0,
              "displayOrder":[
                  12
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY LEARNINGS\nIN LIFE",
              "description":"What are my learnings in life?",
              "text":"What are my learnings in life?",
              "colorcode":"#f56d44",
              "hint":[
                  "Disappointments",
                  " Failure",
                  " Lessons Learnt",
                  " How it helped?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/54.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27323",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":54,
              "multiple":0,
              "displayOrder":[
                  14
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"What’s Up?",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nSTATUS UPDATE ",
              "description":"What’s on your mind?",
              "text":"What’s on your mind?",
              "colorcode":"#ec1c24",
              "hint":[
                  "Your thoughts",
                  " What's brewing",
                  " Why it matters?",
                  " Speak it out!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/55.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2731c",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":55,
              "multiple":0,
              "displayOrder":[
                  7
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Identity",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nRESUME ADD ONS",
              "description":"What's not on your resume?",
              "text":"What's not on your resume?",
              "colorcode":"#f56d44",
              "hint":[
                  "Backpacking",
                  " Photography",
                  " Hitchhiking",
                  " Adventure etc."
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/58.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27324",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":58,
              "multiple":0,
              "displayOrder":[
                  15
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"What’s Up?",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nNEWS REPORT",
              "description":"Whats going on around you?",
              "text":"Whats going on around you?",
              "colorcode":"#ec1c24",
              "hint":[
                  "Concert",
                  " Event",
                  " Rally",
                  " Breaking News"
              ],
              "image": "https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/101.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2731d",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":101,
              "multiple":0,
              "displayOrder":[
                  8
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY BEST\nTV Series",
              "description":"Which TV series are you currently hooked on to?",
              "text":"Which TV series are you currently hooked on to?",
              "colorcode":"#303F9F",
              "hint":[
                  "Name the series",
                  " Character you like",
                  " Addiction!",
                  " Why?"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/102.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27356",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":102,
              "multiple":0,
              "displayOrder":[
                  64
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nINVENTION",
              "description":"If you were an inventor, what would you create?",
              "text":"If you were an inventor, what would you create?",
              "colorcode":"#303F9F",
              "hint":[
                  "Invention",
                  " Uniqueness",
                  " Impact",
                  " Describe it!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/35.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27357",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":103,
              "multiple":0,
              "displayOrder":[
                  65
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\n'FRIENDS' MOMENT",
              "description":"What is your favorite F.R.I.E.N.D.S moment?",
              "text":"What is your favorite F.R.I.E.N.D.S moment?",
              "colorcode":"#303F9F",
              "hint":[
                  "Central Perk",
                  " Big Red Couch",
                  " Monica's Apartment",
                  " 90 Bedford Street"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/104.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"t 10-23 14:49:33.554 19119-21321/? D/OkHttp: o be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27358",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":104,
              "multiple":0,
              "displayOrder":[
                  66
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Lifestyle",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nLATEST GADGET",
              "description":"What is your latest gadget?",
              "text":"What is your latest gadget?",
              "colorcode":"#8e7cc3",
              "hint":[
                  "A Torch!",
                  " New phone!",
                  " Smartwatch!",
                  " WiFi zone!"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/46.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2733f",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":105,
              "multiple":0,
              "displayOrder":[
                  41
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nMOVIE DIALOGUE",
              "description":"What is your favourite movie dialogue?",
              "text":"What is your favourite movie dialogue?",
              "colorcode":"#303F9F",
              "hint":[
                  "You had me at hello!",
                  " Make us an offer",
                  " we cannot refuse",
                  " I'll be back"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/106.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27354",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":106,
              "multiple":0,
              "displayOrder":[
                  62,
                  6
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Geek Out",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nOLYMPIC GOLD",
              "description":"What would you win an Olympic gold for?",
              "text":"What would you win an Olympic gold for?",
              "colorcode":"#303F9F",
              "hint":[
                  "Couch potato",
                  " Gym Junkie",
                  " Marathon Sleeper",
                  " Book Worm"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/56.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27355",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":108,
              "multiple":0,
              "displayOrder":[
                  63
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Aspirations",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY DREAM\nENCOUNTER",
              "description":"A person I would like to meet?",
              "text":"A person I would like to meet?",
              "colorcode":"#a0b723",
              "hint":[
                  "Person Name",
                  " Traits you admire",
                  " Your conversation",
                  " Feeling"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/45.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings 10-23 14:49:33.554 19119-21321/? D/OkHttp: ":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2732f",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":109,
              "multiple":0,
              "displayOrder":[
                  26
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Lifestyle",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nAPP CRUSH",
              "description":"What is your latest app addiction?",
              "text":"What is your latest app addiction?",
              "colorcode":"#8e7cc3",
              "hint":[
                  "Quora",
                  " Facebook",
                  " Snapchat",
                  " AngryBird"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/47.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27340",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":110,
              "multiple":0,
              "displayOrder":[
                  42
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"What’s Up?",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nWORKDAY",
              "description":"What's happening at work these days?",
              "text":"What's happening at work these days?",
              "colorcode":"#ec1c24",
              "hint":[
                  "Fun@work",
                  " Learnings",
                  " Networking",
                  " Gossip"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/111.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b2731e",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":111,
              "multiple":0,
              "displayOrder":[
                  9
              ]
          },
          {
              "answerCount":0,
              "type":"Video",
              "section":"Aspirations",
              "submittedAt":"2017-09-27T07:11:10.497Z",
              "name":"MY\nALTERNATE CAREER",
              "description":"If not a corporate career, what alternate profession would you choose? ",
              "text":"If not a corporate career, what alternate profession would you choose? ",
              "colorcode":"#a0b723",
              "hint":[
                  "Which profession?",
                  " Your role",
                  " Why this",
                  " When will you pursue"
              ],
              "image":"https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/112.jpg",
              "answerTemplate":{
                  "type":"object",
                  "availableSettings":{
                      "filters":[
                          "grayscale",
                          "sepia",
                          "invert",
                          "blue screen"
                      ],
                      "settings":[
                          "Brightness",
                          "Hue",
                          "Saturation",
                          "Contrast"
                      ]
                  },
                  "properties":{
                      "segments":{
                          "type":"array",
                          "items":{
                              "type":"string"
                          },
                          "minItems":1,
                          "uniqueItems":true,
                          "description":"s3 keys url of video segment"
                      },
                      "videodescription":{
                          "type":"string"
                      },
                      "videotitle":{
                          "type":"string"
                      },
                      "coverImage":{
                          "type":"string",
                          "description":"cover image of video"
                      },
                      "words":{
                          "type":"array",
                          "description":"5 words about himself"
                      },
                      "url":{
                          "type":"string",
                          "description":"to be sent empty from client"
                      }
                  },
                  "required":[
                      "segments"
                  ]
              },
              "id":"59cb4f0e8781b81014b27331",
              "userId":"59cb4f0e8781b81014b2731a",
              "order":112,
              "multiple":0,
              "displayOrder":[
                  28
              ]
          }
      ],
      "communityCount":17,
      "id":"59cb4f0e8781b81014b2731a",
      "firstName":"Sumit",
      "lastName":"Marwah",
      "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
      "views":61,
      "email":"sumit@shrofile.com",
      "tagLine":"Summary",
      "location":"current location ",
      "identity":"title at company",
      "education":"",
      "psychographicVisible":false,
      "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507718607381.mp4",
      "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2731f-1507718569684.png",
      "tabs":[
        {
          "name":"Expressions",
          "priority":1,
          "score":40,
          "isActive":true,
          "tabData":[
            {
                "actorId":"59cb4f0e8781b81 10-23 14:49:33.554 19119-21321/? D/OkHttp: 014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59ed8196ab22a62b693a81d3",
                "resourceInfo":{
                    "title":"5 Words That\nDescribe Me",
                    "text":"5 words that describe you? ",
                    "section":"Identity",
                    "answerId":"59ed8196ab22a62b693a81d3",
                    "answerType":"Cloud",
                    "commentCount":0,
                    "likeCount":0,
                    "words":[
                        "knowledgeable",
                        "blunt",
                        "reliable",
                        "cautious",
                        "modest"
                    ],
                    "isLiked":false
                },
                "createdAt":"2017-10-23T05:43:50.683Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59ed8196ab22a62b693a81d4",
                "questionId":"59cb4f0e8781b81014b27320",
                "qorder":50,
                "public":false,
                "submittedAt":"2017-10-23T05:44:07.046Z",
                "isCommunityAnswer":false
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59e5c82ccf9384fa0e4c22af",
                "resourceInfo":{
                    "title":"A Typical\nSunday",
                    "text":"What do you do on a typical Sunday? ",
                    "section":"Lifestyle",
                    "answerId":"59e5c82ccf9384fa0e4c22af",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2733c-1508231194415-1.mp4"
                    ],
                    "videotitle":"A TYPICAL\nSUNDAY",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2733c-1508231199273.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1508231229762.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-a-typical-sunday-59e5c849cf9384fa0e4c22b1",
                    "isLiked":false
                },
                "createdAt":"2017-10-17T09:07:21.071Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59e5c849cf9384fa0e4c22b1",
                "questionId":"59cb4f0e8781b81014b2733c",
                "qorder":9,
                "public":false,
                "submittedAt":"2017-10-17T09:07:21.071Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59e0a2b2baaf89fb4e6ebd79",
                "resourceInfo":{
                    "title":"My Favorite\nMovie",
                    "text":"Which is your all time favorite movie?",
                    "section":"Favorites",
                    "answerId":"59e0a2b2baaf89fb4e6ebd79",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b27335-1507893897224-1.mp4"
                    ],
                    "videotitle":"MY FAVORITE\nMOVIE",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b27335-1507893930147.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507893965679.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-favorite-movie-59e0a2e0baaf89fb4e6ebd7b",
                    "isLiked":false
                },
                "createdAt":"2017-10-13T11:26:24.796Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59e0a2e0baaf89fb4e6ebd7b",
                "questionId":"59cb4f0e8781b81014b27335",
                "qorder":8,
                "public":false,
                "submittedAt":"2017-10-13T11:26:24.796Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59e05739baaf89fb4e6ebd68",
                "resourceInfo":{
                    "title":"The Perfect\nDay",
                    "text":"What is your idea of a perfect day?",
                    "section":"Lifestyle",
                    "answerId":"59e05739baaf89fb4e6ebd68",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2733b-1507874520951-1.mp4"
                    ],
                    "videotitle":"THE PERFECT\nDAY",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2733b-1507874529543.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507874633245.mp4",
                    "sha 10-23 14:49:33.554 19119-21321/? D/OkHttp: reUrl":"http://35.176.247.39:3000/videos/sumit-marwah-the-perfect-day-59e05753baaf89fb4e6ebd6a",
                    "isLiked":false
                },
                "createdAt":"2017-10-13T06:04:03.398Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59e05753baaf89fb4e6ebd6a",
                "questionId":"59cb4f0e8781b81014b2733b",
                "qorder":7,
                "public":false,
                "submittedAt":"2017-10-13T06:04:03.398Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59e05676baaf89fb4e6ebd65",
                "resourceInfo":{
                    "title":"The Perfect\nDay",
                    "text":"What is your idea of a perfect day?",
                    "section":"Lifestyle",
                    "answerId":"59e05676baaf89fb4e6ebd65",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2733b-1507874409970-1.mp4"
                    ],
                    "videotitle":"THE PERFECT\nDAY",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2733b-1507874417878.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507874437647.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-the-perfect-day-59e05690baaf89fb4e6ebd67",
                    "isLiked":false
                },
                "createdAt":"2017-10-13T06:00:48.287Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59e05690baaf89fb4e6ebd67",
                "questionId":"59cb4f0e8781b81014b2733b",
                "qorder":7,
                "public":false,
                "submittedAt":"2017-10-13T06:00:48.287Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59deee7d0c4106a11e3a7570",
                "resourceInfo":{
                    "title":"My Moment Of\nPride",
                    "text":"What has been your most proud moment? ",
                    "section":"Achievements",
                    "answerId":"59deee7d0c4106a11e3a7570",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2732a-1507782176075-1.mp4",
                        "83117109105116-59cb4f0e8781b81014b2732a-1507782228114-1.mp4"
                    ],
                    "videotitle":"MY MOMENT OF\nPRIDE",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2732a-1507782239113.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507782277195.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-moment-of-pride-59deee920c4106a11e3a7572",
                    "isLiked":false
                },
                "createdAt":"2017-10-12T04:24:50.501Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59deee920c4106a11e3a7572",
                "questionId":"59cb4f0e8781b81014b2732a",
                "qorder":6,
                "public":false,
                "submittedAt":"2017-10-12T04:24:50.501Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59deec990c4106a11e3a756d",
                "resourceInfo":{
                    "title":"My Magazine\nCover",
                    "text":"The magazine cover you want to be on?",
                    "section":"Aspirations",
                    "answerId":"59deec990c4106a11e3a756d",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2732e-1507781748179-1.mp4"
                    ],
                    "videotitle":"MY MAGAZINE\nCOVER",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2732e-1507781780721.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507781793003.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-magazine-cover-59deeca50c4106a11e3a756f",
                    "isLiked":false
                },
                "createdAt":"2017-10-12T04:16:37.017Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59deeca50c4106a11e3a756f",
                "questionId":"59cb4f0e8781b81014b2732e",
                "qorder":5,
                "public":false,
                "submittedAt":"2017-10-12T04:16:37.017Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https 10-23 14:49:33.554 19119-21321/? D/OkHttp: ://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59deec550c4106a11e3a756a",
                "resourceInfo":{
                    "title":"In\n5 Years ",
                    "text":"Where would you like to be 5 years from now? ",
                    "section":"Aspirations",
                    "answerId":"59deec550c4106a11e3a756a",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2732c-1507781694650-1.mp4"
                    ],
                    "videotitle":"IN\n5 YEARS",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2732c-1507781703895.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507781725491.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-in-5-years--59deec6a0c4106a11e3a756c",
                    "isLiked":false
                },
                "createdAt":"2017-10-12T04:15:38.320Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59deec6a0c4106a11e3a756c",
                "questionId":"59cb4f0e8781b81014b2732c",
                "qorder":4,
                "public":false,
                "submittedAt":"2017-10-12T04:15:38.320Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59deebf20c4106a11e3a7567",
                "resourceInfo":{
                    "title":"In\n5 Years ",
                    "text":"Where would you like to be 5 years from now? ",
                    "section":"Aspirations",
                    "answerId":"59deebf20c4106a11e3a7567",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2732c-1507781579634-1.mp4"
                    ],
                    "videotitle":"IN\n5 YEARS",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2732c-1507781589403.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507781626523.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-in-5-years--59deec070c4106a11e3a7569",
                    "isLiked":false
                },
                "createdAt":"2017-10-12T04:13:59.412Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59deec070c4106a11e3a7569",
                "questionId":"59cb4f0e8781b81014b2732c",
                "qorder":4,
                "public":false,
                "submittedAt":"2017-10-12T04:13:59.412Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59dee51a0c4106a11e3a7564",
                "resourceInfo":{
                    "title":"My\nLegacy",
                    "text":"What legacy would you like to leave behind? ",
                    "section":"Reflections",
                    "answerId":"59dee51a0c4106a11e3a7564",
                    "answerType":"Video",
                    "commentCount":0,
                    "likeCount":0,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b27344-1507779758481-1.mp4",
                        "83117109105116-59cb4f0e8781b81014b27344-1507779766640-1.mp4",
                        "83117109105116-59cb4f0e8781b81014b27344-1507779798796-1.mp4"
                    ],
                    "videotitle":"MY\nLEGACY",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b27344-1507779804030.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507779894123.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-legacy-59dee5490c4106a11e3a7566",
                    "isLiked":false
                },
                "createdAt":"2017-10-12T03:45:13.328Z",
                "likeCount":0,
                "replyCount":0,
                "id":"59dee5490c4106a11e3a7566",
                "questionId":"59cb4f0e8781b81014b27344",
                "qorder":3,
                "public":false,
                "submittedAt":"2017-10-12T03:45:13.328Z"
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59de072d57c711e9514a67e0",
                "resourceInfo":{
                    "title":"My Important\nAchievements",
                    "text":"What are your most important achievements?",
                    "section":"Achievements",
                    "answerId":"59de072d57c711e9514a67e0",
                    "answerT 10-23 14:49:33.554 19119-21321/? D/OkHttp: ype":"Video",
                    "commentCount":3,
                    "likeCount":1,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b27328-1507723024777-1.mp4",
                        "83117109105116-59cb4f0e8781b81014b27328-1507723029747-1.mp4"
                    ],
                    "videotitle":"MY IMPORTANT\nACHIEVEMENTS",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b27328-1507723045532.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507723080190.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-important-achievements-59de076357c711e9514a67e2",
                    "isLiked":false
                },
                "createdAt":"2017-10-11T11:58:27.134Z",
                "likeCount":0,
                "replyCount":0,
                "comment":{
                    "firstName":"Rupal",
                    "lastName":"Prasad",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/59d747f3c2c5a9745cc1dea7-1507321912331.png",
                    "userId":"59d747f3c2c5a9745cc1dea7",
                    "comment":{
                        "public":true,
                        "type":"Text",
                        "message":"Haley"
                    }
                },
                "id":"59de076357c711e9514a67e2",
                "questionId":"59cb4f0e8781b81014b27328",
                "qorder":2,
                "public":true,
                "submittedAt":"2017-10-11T11:59:39.533Z",
                "isCommunityAnswer":false
            },
            {
                "actorId":"59cb4f0e8781b81014b2731a",
                "actorInfo":{
                    "firstName":"Sumit",
                    "lastName":"Marwah",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/Sumit-59cb4f0e8781b81014b2731a-1507661172698.png",
                    "location":"",
                    "company":"",
                    "designation":""
                },
                "verb":"answered",
                "resourceType":"QUESTION",
                "resourceId":"59ddf5b2521f7e274b192fab",
                "resourceInfo":{
                    "title":"My Short\nIntro",
                    "text":"It’s time to record your Intro!",
                    "section":"Identity",
                    "answerId":"59ddf5b2521f7e274b192fab",
                    "answerType":"Video",
                    "commentCount":1,
                    "likeCount":3,
                    "segments":[
                        "83117109105116-59cb4f0e8781b81014b2731f-1507718548791-1.mp4"
                    ],
                    "videotitle":"MY SHORT\nINTRO",
                    "coverImage":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/83117109105116-59cb4f0e8781b81014b2731f-1507718569684.png",
                    "url":"http://d203lvyahe3q46.cloudfront.net/Sumit-1507718607381.mp4",
                    "shareUrl":"http://35.176.247.39:3000/videos/sumit-marwah-my-short-intro-59ddf5ea521f7e274b192fad",
                    "isLiked":false
                },
                "createdAt":"2017-10-11T10:43:54.837Z",
                "likeCount":0,
                "replyCount":0,
                "comment":{
                    "firstName":"Rupal",
                    "lastName":"Prasad",
                    "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/59d747f3c2c5a9745cc1dea7-1507321912331.png",
                    "userId":"59d747f3c2c5a9745cc1dea7",
                    "comment":{
                        "public":true,
                        "type":"Text",
                        "message":"Bnb do gift"
                    }
                },
                "id":"59ddf5ea521f7e274b192fad",
                "questionId":"59cb4f0e8781b81014b2731f",
                "qorder":1,
                "public":true,
                "submittedAt":"2017-10-11T12:00:05.090Z",
                "isCommunityAnswer":false
            }
        ]
        },
        { "name":"Resume",
          "priority":2,
          "score":30,
          "isActive":false,
          "tabData":{"educationList":[
          ],"experienceList":[
              {
                  "company":"company",
                  "from":1506830400,
                  "location":"location",
                  "title":"title",
                  "to":1507003200,
                  "working":false
              }
          ]}
        },
        { "name":"Updates",
          "priority":3,
          "score":20,
          "isActive":false,
          "tabData":{}
        },
        { "name":"Recommendations",
          "priority":4,
          "score":10,
          "isActive":false,
          "tabData":{}
        }
      ],
      "profileScore":70
    }
    cb(null, dataToSend)
  }
  //
  // GET "/:userId/profileviews"
  //
  User.getProfileView = function(userId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    User.findById(userId, function(err, givenUser) {
      if (err) {
        throw err;
      }
      return cb(null, givenUser ? givenUser.profileViews : {} );
    });
  };

  //
  // POST /:userId/profileviews
  //
  User.updateProfileView = function(userId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    if (userId !== ObjectID(currentUser.id)) {
      User.findById(userId, function(err, givenUser) {
        if (err) {
          throw err;
        }
        givenUser.profileViews = givenUser.profileViews + 1;
        givenUser.save(givenUser, function(err, savedUser) {
          if (err)
            return cb(err);
          return cb(null, savedUser.profileViews);
        });
      });
    }
  };

  //
  // POST "/devicetoken"
  //
  // 1. Register the device with notification service or update the device token for registered device.
  // 2. Create new topic in notification service.
  // 3. Logged-in user subscribe to that topic
  // 4. So that if you want to send message to the particular user using `userTopicARN` in user model.
  //
  //
  User.addDeviceToken = function(deviceDetail, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    User.findById(currentUser.id, function(err, user) {
      user.deviceType = deviceDetail.deviceType;
      user.deviceToken = deviceDetail.deviceToken;
      User.app.models.Notification.registerDevice(user, deviceDetail.deviceToken, deviceDetail.deviceType, function(err, deviceARN) {
        console.log("deviceARN===", deviceARN)
        if (!user.deviceARN) {
          user.deviceARN = {};
        }
        if (deviceARN) {
          user.deviceARN[deviceDetail.deviceType] = deviceARN;
        }
        if (user.userTopicARN) {
          user.save(function(err, savedUser) {
            User.app.models.Notification.subscribeToPost(savedUser.id, savedUser.userTopicARN, function(err, data) {});
          });
        } else {
          User.app.models.Notification.createTopic(user.id, function(err, topic) {
            if (err) {
              console.log("Error in creating topic.")
            }
            if (topic && topic["attributes"]) {
              user.userTopicARN = topic["attributes"]["TopicArn"];
              user.save(function(err, savedUser) {
                var indexBody = {
                  doc: {
                    "userTopicARN": user.userTopicARN
                  }
                };
                searchClient.update("user", user.id, indexBody, function(err, resp) {
                  console.log("indexresponse=====", resp);
                })
                User.app.models.AccessToken.findOne({
                  where:{
                    "userId":user.id
                  }
                },function(err,accessToken){
                  accessToken.userTopicARN = user.userTopicARN;
                  accessToken.save(function(err,savedAccesstoken){})
                })
                if (err) {
                  console.log("Error in saving topicArn.")
                }
                User.app.models.Notification.subscribeToPost(savedUser.id, savedUser.userTopicARN, function(err, data) {});
              });
            }
          });

        }
        return cb(null, user);
      });
    })
  }

  //
  // GET /search
  //
  User.searchUser = function(query, cb) {
    var returnArr = [];
    if (query && query.searchName) {
         // "query": {
        //   "multi_match": {
        //     "query": query.searchName,
        //     "fields": [ "firstName^2","displayname", "searchLocation^1.5", "company", "college","degree","designation"],
        //     "type": "phrase_prefix"
        //   }
        // }
        // "query": {
        //       "match_phrase_prefix": {
        //         "displayname": query.searchName
        //       }
        //     }
        var queryObj = {
            "size":1000,
            "query": {
                "multi_match": {
                    "query": query.searchName,
                    "fields": [ "firstName^3","displayname"],
                    "type": "phrase_prefix"
                }
            }
        }
        searchClient.search("user", queryObj, function(err, data) {
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

  //
  // Once the user created Save that information in elasticsearch.
  //
  User.on("newUser", function(instance) {
    var indexBody = {
      "firstName": instance.firstName,
      "lastName": instance.lastName,
      "image_url": instance.image_url,
      "displayname": instance.firstName + " " + instance.lastName,
      "userid": instance.id,
      "email": instance.email
    };
    searchClient.index("user", instance.id, indexBody, function(err, resp) {
      console.log(resp);
    })
    User.app.models.Notification.createTopic(instance.id, function(err, topic) {
      if (err) {
        console.log("Error in creating topic.")
      }
      if (topic && topic["attributes"]) {
        instance.userTopicARN = topic["attributes"]["TopicArn"];
        instance.save(instance, function(err, savedUser) {
          if (err) {
            console.log("Error in saving topicArn.")
          }
        });
      }
    });
  })

  //
  // GET "/updateImageurl"
  //
  User.updateImageurl = function(cb) {
    this.find({}, function(err, users) {
      for (var index in users) {
        var user = users[index];
        if (user.image_url)
          User.emit("updateUser", {
            "userId": user.id,
            "image_url": user.image_url
          })
      }
      cb(null, users);
    })
  }

  //
  // If the user changed update his profile photo it has to be updated in other relational collections also.
  // So once profile photo updated in User collection update the same in like, comment and personality collections.
  //
  User.on("updateUser", function(userInstance) {
    console.log("updateUser============", userInstance);
    User.app.models.like.updateAll({
      "userId": userInstance.userId
    }, {
      "image_url": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.comment.updateAll({
      "userId": userInstance.userId
    }, {
      "image_url": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.personality.updateAll({
      "userid": userInstance.userId
    }, {
      "image_url": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.activity.updateAll({
      "actorId": userInstance.userId
    }, {
      "actorInfo.image_url": userInstance.image_url
    }, function(cb, err) {
      User.app.models.activity.updateAll({
        "comment.userId": userInstance.userId
      }, {
        "comment.image_url": userInstance.image_url
      }, function(cb, err) {

      })
    })
    User.app.models.message.updateAll({
      "toId": userInstance.userId
    }, {
      "toImageUrl": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.message.updateAll({
      "fromId": userInstance.userId
    }, {
      "fromImageUrl": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.notification.updateAll({
      "message.dataobj.userid": userInstance.userId
    }, {
      "message.dataobj.image_url": userInstance.image_url
    }, function(cb, err) {

    })
    User.app.models.answer.updateAll({
      "userId": userInstance.userId
    }, {
      "image_url": userInstance.image_url
    }, function(cb, err) {

    })


    User.app.models.follower.updateAll({
      "userId": userInstance.userId
    }, {
      "userImageUrl": userInstance.image_url
    }, function(cb, err) {
      User.app.models.follower.updateAll({
        "followerId": userInstance.userId
      }, {
        "followerImageUrl": userInstance.image_url
      }, function(cb, err) {})
    })



    var indexBody = {
      doc: {
        "image_url": userInstance.image_url,
      }
    };
    searchClient.update("user", userInstance.userId, indexBody, function(err, resp) {
      console.log("indexresponse=====", resp);
    })
  })
  User.changePassword = function(oldpassword, newpassword, id, cb) {
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
            "password": newpassword
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
  User.indexUsers = function(cb) {
    this.find({}, function(err, users) {
      var promArr = [];
      for (var i in users) {
        (function(i) {
          var instance = users[i];
          var company = "";
          var college = "";
          var searchLocation = ""
          var designation = "";
          var degree = "";
          var workingSinceTimestamp = 0;
          var workingSince= "";
          if (instance.experienceList && instance.experienceList.length) {
            for(var index in instance.experienceList){
              var currentCompany = instance.experienceList[index];
              company += currentCompany.company+",";
              designation += currentCompany.title+",";
            }
            workingSinceTimestamp = instance.experienceList[instance.experienceList.length-1].from;
          }
          if (instance.educationList && instance.educationList.length) {
            for(var index in instance.educationList){
              var currentEducation = instance.educationList[index];
              college += currentEducation.institution+",";
              degree += currentEducation.course+",";
            }
          }
          if (instance.city && instance.city.length) {
            searchLocation = instance.city
          }
          if (instance.country && instance.country.length) {
            searchLocation = searchLocation + " " + instance.country
          }
          if(searchLocation.length==0){
            searchLocation = instance.basicInfo ? instance.basicInfo.location || "" : instance.location || "";
          }
          workingSince = moment.utc(workingSinceTimestamp*1000).format("YYYY-MM-DD")
          var promObj = new Promise(function(resolve, reject) {
            var indexBody = {
              "firstName": instance.firstName,
              "lastName": instance.lastName,
              "image_url": instance.image_url,
              "displayname": instance.firstName + " " + instance.lastName,
              "userid": instance.id,
              "email": instance.email,
              "userTopicARN":instance.userTopicARN,
              "workingSince":workingSince
            };
            if (company && company.length) {
              indexBody.company = company;
            }
            if (college && college.length) {
              indexBody.college = college;
            }
            if(designation && designation.length){
              indexBody.designation = designation;
            }
            if(degree && degree.length){
              indexBody.degree = degree;
            }
            if (searchLocation && searchLocation.length) {
              indexBody.searchLocation = searchLocation;
            }
            if (instance.lat && instance.lon) {
              indexBody.geoLocation = {
                "lat": instance.lat,
                "lon": instance.lon
              }
            }
            searchClient.index("user", instance.id, indexBody, function(err, resp) {
              resolve()
            })
          })
          promArr.push(promObj);
        })(i)
      }
      Promise.all(promArr).then(function(resArr) {

      })
    })
  }
  User.sendWelcomeEmail = function(offset, limit, cb) {
    var url = global.config.shrofilehost + '/reset-password';
    this.find({
      where: {},
      limit: limit,
      offset: offset
    }, function(err, users) {
      var promArr = [];
      for (var i in users) {
        (function(i) {
          var instance = users[i];
          var promObj = new Promise(function(resolve, reject) {
            EJS.renderFile("server/views/welcome.ejs", {
              "name": instance.firstName
            }, {}, function(err, str) {
              User.app.models.Email.send({
                to: instance.email,
                from: "neha.lal@shrofile.com",
                subject: 'Shrofile is Live!',
                html: str
              }, function(err) {
                if (err) return console.log('> error sending password reset email', instance.email);
                resolve();
              });
            });
          })
          promArr.push(promObj);
        })(i)
      }
      Promise.all(promArr).then(function(resArr) {
        cb({
          "success": true
        })
      })
    })
  }
  User.sendHoliEmail = function(offset, limit, cb) {
    var url = global.config.shrofilehost + '/reset-password';
    this.find({
      where: {},
      limit: limit,
      offset: offset
    }, function(err, users) {
      var promArr = [];
      for (var i in users) {
        (function(i) {
          var instance = users[i];
          var promObj = new Promise(function(resolve, reject) {
            EJS.renderFile("server/views/holi.ejs", {
              "name": instance.firstName
            }, {}, function(err, str) {
              User.app.models.Email.send({
                to: instance.email,
                from: "neha@shrofile.com",
                subject: 'Happy Holi Shrofilers!',
                html: str
              }, function(err) {
                if (err) return console.log('> error sending password reset email', instance.email);
                resolve();
              });
            });
          })
          promArr.push(promObj);
        })(i)
      }
      Promise.all(promArr).then(function(resArr) {
        cb({
          "success": true
        })
      })
    })
  }

  User.getWebProfile = function(id, cb) {
    var profile = {};
    var profilePromise = new Promise(function(resolve, reject) {
      User.findById(id, function(err, data) {
        if (err)
          reject(err);
        else {
          resolve(data);
        }
      })
    })
    var followersPromise = new Promise(function(resolve, reject) {
      User.app.models.follower.find({
        where: {
          followerId: id
        }
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });


    // getting all the answer activities
    var activitiesPromise = new Promise(function(resolve, reject) {
      User.app.models.activity.find({
        where: {
          actorId: id,
          public: true
        },
        order: 'submittedAt DESC'
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var taglinePromise = new Promise(function(resolve, reject) {
      User.app.models.answer.find({
        where: {
          userId: id,
          order: 53
        },
        order: 'submittedAt DESC',
        limit: 1
      }, function(err, data) {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });

    var introVideoPromise = new Promise(function(resolve, reject) {
      User.app.models.answer.findOne({
        where: {
          userId: id,
          order: 1,
          public: true
        },
        order: 'submittedAt DESC'
      }, function(err, answer) {
        if (err)
          reject(err)
        else {
          var url = "";
          var coverImage = "";
          if (answer && answer.answer && answer.answer.url) {
            url = answer.answer.url;
            coverImage = answer.answer.coverImage;
          }
          var returnObj = {
            url: url,
            coverImage: coverImage
          }
          resolve(returnObj)
        }
      })
    })

    var promiseArray = [];
    promiseArray.push(profilePromise, followersPromise, activitiesPromise, taglinePromise, introVideoPromise);
    Promise.all(promiseArray).then(function(resolveArr) {
      var profileData = resolveArr[0];
      profile.id = id;
      profile.firstName = profileData.firstName;
      profile.lastName = profileData.lastName;
      profile.image_url = profileData.image_url;
      profile.views = profileData.profileViews;
      profile.tagLine = "";
      profile.educationList = profileData.educationList || [];
      profile.experienceList = profileData.experienceList || [];
      if (profileData && profileData.basicInfo && profileData.basicInfo.summary) {
        profile.tagLine = profileData.basicInfo.summary;
      } else if (resolveArr[3].length) {
        profile.tagLine = resolveArr[3][0].answer.message;
      }
      if (profileData && profileData.basicInfo && profileData.basicInfo.location) {
        profile.location = profileData.basicInfo.location || "";
      } else {
        profile.location = profileData.location || "";
      }
      var company = "";
      var designation = "";
      profile.identity = profileData.identity || "";
      if (profileData.experienceList && profileData.experienceList.length) {
        var currentCompany = profileData.experienceList[0];
        company = currentCompany.company;
        designation = currentCompany.title;
        profile.identity = designation + " at " + company;
      } else if (profileData.educationList && profileData.educationList.length) {
        var currentEducation = profileData.educationList[0];
        company = currentEducation.institution;
        designation = currentEducation.course;
        profile.identity = designation + " at " + company;
      }

      profile.followers = resolveArr[1].length;
      profile.feed = resolveArr[2];
      profile.url = resolveArr[4].url;
      profile.coverImage = resolveArr[4].coverImage;
      if (profile.userBlocked) {
        profile.feed = [];
      }
      cb(null, profile);
    }, function(rejectArr) {
      return cb(rejectArr)
    });
  }
  User.getCommunities = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    User.app.models.member.find({
      where: {
        userId: id,
        status: "approved"
      },
      fields: {
        "communityId": true,
        "communityName": true,
        "communityCoverImageUrl": true
      },
      order: "joiningDate DESC"
    }, function(err, communities) {
      if (err)
        return cb(err)
      else
        return cb(null, communities);
    })
  }
  User.on('updateUserLocation', function(currentUser) {
    console.log("updateUserLocation==", currentUser)
    User.findById(currentUser.id, function(err, user) {
      user.lat = currentUser.lat;
      user.lon = currentUser.lon;
      user.country = currentUser.country;
      user.city = currentUser.city;
      user.save(function(err, savedUser) {

      })
    })
    var indexBody = {
      doc: {
        "searchLocation": currentUser.city + " " + currentUser.country,
        "geoLocation":{
          "lat":currentUser.lat,
          "lon":currentUser.lon
        }
      }
    };
    searchClient.update("user", currentUser.id, indexBody, function(err, resp) {
      console.log("indexresponse=====", resp);
    })
  })
  User.getRecommendedUsers = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("ctx===",ctx)
    var queryObj={};
    var lat = ctx.get("lat");
    var lon = ctx.get("lon");
    var locationFilter={};
    if(lat.length && lon.length){
      locationFilter = {
        "geo_distance": {
          "geoLocation": {
            "lat": lat,
            "lon": lon
          },
          "distance": "1000km"
        }
      }
    }
    var returnArr=[];
    if (currentUser) {
      User.findById(currentUser.id, function(err, user) {
        var company = "";
        var college = "";
        if (user.experienceList && user.experienceList.length) {
          var currentCompany = user.experienceList[0];
          company = currentCompany.company;
        } else if (user.educationList && user.educationList.length) {
          var currentEducation = user.educationList[0];
          college = currentEducation.institution;
        }
        var queryString = "";
        if (company.length) {
          queryString = company + " ";
        }
        if (college.length) {
          queryString = queryString + college + " ";
        }
        if (user.city && user.city.length) {
          queryString = queryString + user.city + " ";
        }
        if (queryString.length > 0) {
          queryObj = {
            "size":1000,
            "from":0,
            "query": {
              "bool": {
                "must": {
                  "multi_match": {
                    "query": queryString,
                    "type": "most_fields",
                    "fields": ["searchLocation", "company", "college"]
                  }
                }
              }
            }
          }
          if(locationFilter && locationFilter.geo_distance){
            queryObj["query"]["bool"]["filter"]=locationFilter
          }
          searchClient.search("user", queryObj, function(err, data) {
            console.log("data====", data);
            if(err){
              return cb(null,returnArr)
            }
            data.hits.hits.forEach(function(hit) {
              console.log(hit._source)
              if(hit._source.userid!=currentUser.id){
                returnArr.push(hit._source);
              }
            })
            return cb(null, returnArr);
          })
        }
        else{
          return cb(null, returnArr);
        }
      })
    }else{
      searchClient.search("user", queryObj, function(err, data) {
        console.log("data====", data);
        data.hits.hits.forEach(function(hit) {
          console.log(hit._source)
          returnArr.push(hit._source);
        })
        return cb(null, returnArr);
      })
    }
  }
  User.on("updateLastActiveTime",function(currentUser){
    User.findById(currentUser.id,function(err,user){
      user.lastActive = new Date();
      user.save(function(err,savedUser){})
    })
  })

  User.on("userVideoCreated",function(currentUser,answerCount){
    User.findById(currentUser.id,function(err,user){
      user.videoCreated = true;
      if(!user.videoCount)
        user.videoCount=0;
      user.videoCount+=1;
      user.save(function(err,savedUser){
        //User.app.models.application.emit('userVideoCreated',savedUser);
      })
    })
  })

  User.on("createPublicVideo",function(currentUser){
    User.findById(currentUser.id,function(err,user){
      User.app.models.answer.count({"type":"Video","public":true,"userId":currentUser.id},function(err,data){
        user.publicVideoCount = data;
        user.save(function(err,savedUser){
          User.app.models.application.emit('userVideoCreated',savedUser);
        })
      })
    })
  })

  User.on("onWelcomeEmail",function(user){
    console.log("in welcome email==>>>>");
    EJS.renderFile("server/views/newUser.ejs", {
      "firstName": user.firstName
    }, {}, function(err, str) {
      console.log("err",err)
      User.app.models.Email.send({
        to: user.email,
        from: "neha.lal@shrofile.com",
        subject: 'Welcome to Shrofile!',
        html: str
      }, function(err) {
        if (err) return console.log('> error sending password reset email', instance.email);
      });
    });
  })
  User.sendNotificationToAll = function(cb){
    User.find({
      where:{
        "emailVerified":true
      }
    },function(err,users){
      var postNewAnswerData = notifTag["blogPost"];
      for(var index in users){
        (function(i){
          var user = users[i];
          if (user && user.userTopicARN) {
            var message = {
              tagid: postNewAnswerData.tagid,
              message: postNewAnswerData.message.format(),
              dataobj: {
                "id":"59607d2bdfdac7356e8b7239",
                "userId":"589aee2319016c1b2dd847ee",
                "userid":"589aee2319016c1b2dd847ee",
                "firstName":"Deepesh",
                "lastName":"Naini",
                "image_url":"https://s3.ap-south-1.amazonaws.com/shrofile-videos/589aee2319016c1b2dd847ee-1487704855514.png"
              }
            }
            console.log(message)
            User.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
              if (err) {
                console.log("Error publishing message to topic.");
              }
            });
            User.app.models.Notification.saveNotification(user.id, message, user.userTopicARN);
          }
        })(index)
      }
    })
    cb(null,{"success":true})
  }
  User.getVerifiedUsers = function(cb){
    var startDate = new Date("May 01, 2017 23:59:00");
    var endDate = new Date("August 06, 2017 23:59:00");
    User.find({
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
      order:"joiningDate DESC"
    },function(err,users){
      if(err)
        return cb(err)
      return cb(null,users)
    })
  }
  User.uploadResume = function(id,file,cb){
    var resumeFileName = "resume-"+id+"."+file.ext;
    console.log("upload resume ==>>", id, file);
    var userPromise = new Promise(function(resolve,reject){
      User.findById(id,function(err,user){
        if(err)
          reject(err)
        else {
          resolve(user);
        }
      })
    })
    var s3Promise= new Promise(function(resolve,reject){
      s3helper.getSignedUrl(resumeFileName,file.type,function(err,retData){
        if(err)
          reject(err)
        else{
          resolve(retData);
        }
      })
    })
    var promArr = [userPromise,s3Promise];
    Promise.all(promArr).then(function(resolveArr){
      var user = resolveArr[0];
      var retData = resolveArr[1];
      user.resumeUrl = retData.bucketUrl;
      user.save(function(err,savedUser){
        cb(null,retData)
      })
    })
  }
  User.addRole = function(cb){
    User.find({
      where:{
        "emailVerified":true
      }
    },function(err,users){
      for (var index in users){
        (function(index){
          var user = users[index];
          var id = user.id;
          var roleType = "user";
          User.app.models.Role.findOne({
            where: {
              name: roleType
            }
          }, function(err, role) {
            if (role && role.id) {
              role.principals.create({
                principalType: 'USER',
                principalId: user.id
              }, function(err, principal) {
                console.log("principal====",principal)
                user.role=roleType;
                user.save(function(err,savedUser){})
                if (err) next(err);
              });
            } else {
            }
          });
        })(index)
      }
    })
    cb(null,{"success":true})
  }
  User.on("assignRoletoNewUser",function(user){
    var roleType = user.role || "user";
    User.app.models.Role.findOne({
      where: {
        name: roleType
      }
    }, function(err, role) {
      if (err) next(err);
      if (role && role.id) {
        role.principals.create({
          principalType: 'USER',
          principalId: user.id
        }, function(err, principal) {
          console.log("principal====",principal)
          if (err) next(err);
        });
      }
    });
  })
 
  /**
   * Confirm the user's identity.
   *
   * @param {Any} userId
   * @param {String} token The verification token
   * @callback {Function} callback
   * @param {Error} err
   */
  User.confirmVerificationCode = function(uid, token, fn) {
    fn = fn || utils.createPromiseCallback();
    var ctx = loopback.getCurrentContext();
    User.findById(ObjectID(uid), function(err, user) {
      if (err) {
        fn(err);
      } else {
        //console.log("uid, token", uid, token, user);
        if (user && user.verificationToken &&  user.verificationToken ==token) {
          var currentTime = new Date().getTime();
          var verificationCodeSentTime = new Date(user.verificationSentTime).getTime();
          if(currentTime - verificationCodeSentTime > 1000*60*1000*100000){
            //sent error to regenerate verification code
            err = new Error('Verification token expired: ' + token);
            err.statusCode = 400;
            err.code = 'TOKEN_EXPIRED';
            fn(err);
          } else{
            //save user
            user.verificationToken = undefined;
            user.emailVerified = true;
            user.save(function(err, res) {
              if (err) {
                fn(err);
              } else {
                User.emit("onWelcomeEmail",user);
                user.accessTokens.create({ttl: 31449600}, function(err, accessToken) {
                  if (err) {
                    console.log("errror in accessToken", err)
                    fn(err);
                  } else{
                    //console.log("accessToken", accessToken)
                    user.ttl = accessToken.ttl;
                    user.id = accessToken.id;
                    user.created = accessToken.created;
                    user.userId = accessToken.userId;
                    fn(null, user );
                  }
                });
              }
            });
          }
        } else {
          if (user) {
            err = new Error('Invalid token: ' + token);
            err.statusCode = 400;
            err.code = 'INVALID_TOKEN';
          } else {
            err = new Error('User not found: ' + uid);
            err.statusCode = 404;
            err.code = 'USER_NOT_FOUND';
          }
          fn(err);
        }
      }
    });
    return fn.promise;
  };

};

