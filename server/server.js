var appconfig = require('../config').loadConfig();
global.config = appconfig;
if (global.config.monitoringEnabled) {
  //console.log("global.config.monitoringEnabled", global.config.monitoringEnabled)
  require('newrelic');
}


var loopback = require('loopback');
var boot = require('loopback-boot');
var app = module.exports = loopback();
var bodyParser = require('body-parser');
var crypto = require('crypto');
var path = require('path')
var config = {};
var request = require("request");
var Promise = require("bluebird");
var path = require('path');
boot(app, __dirname);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.middleware('parse', bodyParser.json());
app.middleware('parse', bodyParser.urlencoded({
  extended: true
}));
// set current user
app.use(loopback.context());
app.use(loopback.token());
app.use(function setCurrentUser(req, res, next) {
  if (!req.accessToken) {
    return next();
  }
  console.log(req.accessToken)
  var loopbackContext = loopback.getCurrentContext();
  var headers = req.headers;
  console.log("req.accessToken===", req.accessToken);
  if (loopbackContext) {
    var currentUser = {
      "id": req.accessToken.userId,
      "firstName": req.accessToken.firstName,
      "lastName": req.accessToken.lastName,
      "image_url": req.accessToken.image_url,
      email: req.accessToken.email,
      userTopicARN: req.accessToken.userTopicARN
    };
    console.log("currentUser==", currentUser)
    if (!currentUser.userTopicARN) {
      app.models.user.findById(currentUser.id, function(err, user) {
        if (user) {
          currentUser.userTopicARN = user.userTopicARN;
          app.models.AccessToken.findOne({
            where: {
              userId: currentUser.id
            }
          }, function(err, accessToken) {
            accessToken.userTopicARN = user.userTopicARN;
            accessToken.save(function(err, savedAccesstoken) {});
            loopbackContext.set('currentUser', currentUser);
            loopbackContext.set('lat', headers.lat);
            loopbackContext.set('lon', headers.lon);
            loopbackContext.set('city', headers.city);
            loopbackContext.set('country', headers.country);
            next()
          })
        }else{
          loopbackContext.set('currentUser', currentUser);
          loopbackContext.set('lat', headers.lat);
          loopbackContext.set('lon', headers.lon);
          loopbackContext.set('city', headers.city);
          loopbackContext.set('country', headers.country);
          next()
        }
      })
    } else {
      loopbackContext.set('currentUser', currentUser);
      loopbackContext.set('lat', headers.lat);
      loopbackContext.set('lon', headers.lon);
      loopbackContext.set('city', headers.city);
      loopbackContext.set('country', headers.country);
      next();
    }


  }
});
app.get('/reset-password', function(req, res, next) {
  if (!req.accessToken) return res.sendStatus(401);
  res.render('password-reset', {
    accessToken: req.accessToken.id
  });
});

app.post("/get-password", function(req, res, next) {
  app.models.user.find({
    where: {
      email: req.body.email
    }
  }, function(err, user) {
    app.models.AccessToken.find({
      where: {
        userId: user.id
      }
    }, function(err, avc) {
      console.log("====", avc)
    })
  })
})
//linkedin code]
var passport = require('passport');
var LinkedInStrategy = require('passport-linkedin-oauth2').Strategy;
app.use(passport.initialize());
app.use(passport.session());
// Passport session setup.
//   To support persistent login sessions, Passport needs to be able to
//   serialize users into and deserialize users out of the session.  Typically,
//   this will be as simple as storing the user ID when serializing, and finding
//   the user by ID when deserializing.  However, since this example does not
//   have a database of user records, the complete Linkedin profile is
//   serialized and deserialized.
passport.serializeUser(function(user, done) {
  console.log("serialize user", user)
  done(null, user);
});

passport.deserializeUser(function(obj, done) {
  console.log("de serialize user", obj)
  done(null, obj);
});
passport.use(new LinkedInStrategy({
  clientID: "819mb7xsnentl3",
  clientSecret: "yBpaFsaq4i3aqTxJ",
  callbackURL: "http://127.0.0.1:4000/auth/linkedin/callback",
  scope: ['r_emailaddress', 'r_basicprofile']
}, function(accessToken, refreshToken, profile, done) {
  // asynchronous verification, for effect...
  console.log("de serialize user", accessToken, refreshToken)
  process.nextTick(function () {
    return done(null, profile);
  });
}));
// GET /auth/linkedin
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Linkedin authentication will involve
//   redirecting the user to linkedin.com.  After authorization, Linkedin
//   will redirect the user back to this application at /auth/linkedin/callback
app.get('/auth/linkedin',
  passport.authenticate('linkedin', { state: 'SOME STATE' }),
  function(req, res){
    // The request will be redirected to Linkedin for authentication, so this
    // function will not be called.
  });

// GET /auth/linkedin/callback
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
app.get('/auth/linkedin/callback',
  passport.authenticate('linkedin', {
    failureRedirect: '/login'
  }
),function(req, resp) {
    console.log("res, req here auth token needs to be generated res", req.user._json, JSON.stringify(req.user._json.positions.values));
    var id = req.user._json.id;
   
    var userObj= {
      firstName: req.user._json.firstName,
      lastName: req.user._json.lastName,
      email: req.user._json.emailAddress,
      password: req.user._json.id,
      image_url: req.user._json.pictureUrls.values[0],
      username:req.user._json.emailAddress,
      experienceList:[],
      basicInfo:{},
      linkedin:{
        publicProfileUrl:req.user._json.publicProfileUrl ? req.user._json.publicProfileUrl : "",
        headline: req.user._json.headline ? req.user._json.headline : "",
        numConnections :  req.user._json.numConnections ? req.user._json.numConnections : "",
        industry: req.user._json.industry ?  req.user._json.industry : "" 
      },
      city: req.user._json.location? req.user._json.location.name :"",
      country: req.user._json.location? req.user._json.location.country.code :""
    };
    if( req.user._json.positions && req.user._json.positions.values[0]){
      var currentCompany={
        "working" : req.user._json.positions.values[0].isCurrent,
        "desc" :  req.user._json.positions.values[0].summary ? req.user._json.positions.values[0].summary:'',
        "location" : req.user._json.positions.values[0].location.name ? req.user._json.positions.values[0].location.name : '',
        "from" :  req.user._json.positions.values[0].startDate ? new Date(req.user._json.positions.values[0].startDate.year, req.user._json.positions.values[0].startDate.month).getTime()/1000 : 0,
        "title" : req.user._json.positions.values[0].title ? req.user._json.positions.values[0].title:"",
        "to" : 0,
        "company" :  req.user._json.positions.values[0].company.name ?  req.user._json.positions.values[0].company.name : "",
        "type": req.user._json.positions.values[0].company.type ? req.user._json.positions.values[0].company.type : "",
        "industry": req.user._json.positions.values[0].company.industry ? req.user._json.positions.values[0].company.industry : "",
        "companySize": req.user._json.positions.values[0].company.size ?  req.user._json.positions.values[0].company.size : 0
      };
      userObj.experienceList.push(currentCompany);
    }
    if( req.user._json.summary){
      var basicInfo = {
        "summary" : req.user._json.summary ,
        "location" : req.user._json.location? req.user._json.location.name :""
      }
      userObj.basicInfo = basicInfo
    }
    
    
    /*{ apiStandardProfileRequest: [Object],
        currentShare: [Object],
        distance: 0,
        emailAddress: 'sidd40401@gmail.com',
        firstName: 'Siddhant',
        formattedName: 'Siddhant Srivastava',
        headline: 'Software Engineer at SilverPush',
        id: 'z-Y7fCLnFp',
        industry: 'Computer Software',
        lastName: 'Srivastava',
        location: [Object],
        numConnections: 500,
        numConnectionsCapped: true,
        pictureUrl: 'https://media.licdn.com/mpr/mprx/0_Cc2LxDd823mEgSQr_zswUfP8fKhEg2RymQZLsJL8EKrIgpoueQqkUdH8eFTI4joK_zsLlIwh_F_wUHjaekdJBJE26F_oUHmymkd6y4x3D6nQlOvhGzxepulrQtMV-HJSFFSdRQgMMr9',
        pictureUrls: [Object],
        positions: [Object],
        publicProfileUrl: 'https://www.linkedin.com/in/sidd363',
        relationToViewer: [Object],
        siteStandardProfileRequest: [Object],
        summary: 'I am a Full Stack Developer of MEAN Stack at Silver Push. ' }
        location: { country: { code: 'in' }, name: 'Gurgaon, India' }
        {
          "_id" : ObjectId("589aee2319016c1b2dd847ee"),
          "firstName" : "Deepesh",
          "lastName" : "Naini",
          "profileViews" : 687,
          "likeCount" : 0,
          "deviceARN" : {
            
          },
          "userTopicARN" : "arn:aws:sns:ap-south-1:224236965178:589aee2319016c1b2dd847ee",
          "username" : "theinvincible975@gmail.com",
          "password" : 123456,
          "email" : "0.7322774184037542@gmail.com",
          "emailVerified" : true,
          "image_url" : "https://s3.ap-south-1.amazonaws.com/shrofile-videos/589aee2319016c1b2dd847ee-1487704855514.png",
          "deviceType" : "ios",
          "deviceToken" : "",
          "validate" : true,
          "throws" : false,
          "location" : "",
          "education" : "",
          "identity" : "",
          "experienceList" : [
            {
              "working" : true,
              "desc" : "Heading technology ",
              "location" : "Gurgaon",
              "from" : 1480530600,
              "title" : "Co-Founder & CTO",
              "to" : 0,
              "company" : "Shrofile"
            },
            {
              "working" : false,
              "desc" : "Leading the product and tech team of Reviews and Ratings platform",
              "location" : "Gurgaon",
              "from" : 1422297000,
              "title" : "Engineering Manager",
              "to" : 1479839400,
              "company" : "Goibibo"
            },
            {
              "working" : false,
              "desc" : "Leading front-end technology ",
              "location" : "Gurgaon",
              "from" : 1394821800,
              "title" : "Senior Software Engineer",
              "to" : 1421260200,
              "company" : "Nextag"
            }
          ],
          "basicInfo" : {
            "summary" : "It ain’t about how hard you can hit its about how hard you can get hit and keep moving forward ",
            "location" : "Gurgaon"
          },
          "educationList" : [
            {
              "from" : 1182623400,
              "institution" : "Jaypee Institute of Information Technology",
              "course" : "B-Tech CSE",
              "to" : 1309026600
            }
          ],
          "joiningDate" : ISODate("2017-02-17T23:00:00Z"),
          "lastActive" : ISODate("2017-07-06T16:23:51.643Z"),
          "lat" : "28.4456233",
          "lon" : "77.1046723",
          "country" : "india",
          "city" : "gurugram",
          "videoCreated" : true,
          "role" : "user"
        }
    */
    app.models.user.findOne({
        where: {
          "email": userObj.email
        }
      }, function(err, user) {
        console.log("err user in mongo ", err, user)
        if (user && user.email) {
          app.models.AccessToken.findOne({
            where: {
              userId: user.id
            },
            order: "created DESC"
          }, function(err, accessToken) {
            if (!accessToken) {
              user.hasPassword(id, function(err, isMatch) {
                if (!isMatch) {
                  user.updateAttribute('password', id, function(err, instance) {
                    app.models.user.login({
                      email: userObj.email,
                      password: userObj.password,
                      ttl: 60 * 60 * 24 * 7 * 52
                    }, function(err, accessToken) {
                      accessToken.firstName = userObj.firstName;
                      accessToken.lastName = userObj.lastName;
                      accessToken.image_url = userObj.image_url;
                      accessToken.email = userObj.email;
                      accessToken.save(function(err, data) {})
                      return resp.send(accessToken);
                    })
                  })
                } else {
                  app.models.user.login({
                    email: userObj.email,
                    password: userObj.password,
                    ttl: 60 * 60 * 24 * 7 * 52
                  }, function(err, accessToken) {
                    accessToken.firstName = userObj.firstName;
                    accessToken.lastName = userObj.lastName;
                    accessToken.image_url = userObj.image_url;
                    accessToken.email = userObj.email;
                    accessToken.save(function(err, data) {})
                    return resp.send(accessToken);
                  })
                }
              })
            } else {
              accessToken.created = new Date();
              accessToken.firstName = user.firstName;
              accessToken.lastName = user.lastName;
              accessToken.image_url = user.image_url;
              accessToken.email = user.email;
              accessToken.save(function(err, savedAccesstoken) {
                return resp.send(savedAccesstoken);
              })
            }
          })
        } else {
          app.models.user.create({
            firstName: userObj.firstName,
            lastName: userObj.lastName,
            image_url: userObj.image_url,
            email: userObj.email,
            password: userObj.password,
            emailVerified: true,
            experienceList: userObj.experienceList,
            basicInfo: userObj.basicInfo,
            linkedin:userObj.linkedin,
            city:userObj.city,
            country:userObj.country
          }, function(err, newUser) {
            if(err){
              console.log("err in user creation", err);
            }else{
              app.models.user.login({
                email: userObj.email,
                password: userObj.password,
                ttl: 60 * 60 * 24 * 7 * 52,
                emailVerified: true
              }, function(err, accessToken) {
                console.log("here===", err)
                if(err){
                  console.log("error while login", err)
                }else{
                  console.log("here accessToken===", err)
                  accessToken.firstName = newUser.firstName;
                  accessToken.lastName = newUser.lastName;
                  accessToken.image_url = newUser.image_url;
                  accessToken.email = newUser.email;
                  accessToken.save(function(err, savedAccesstoken) {
                    return resp.send(savedAccesstoken);
                  })
                }
              })
            }
          })
        }
    })
  }
);
//
app.post('/auth/facebook', function(req, resp, next) {
  var facebookAccessToken = req.body.token;
  var firstName = req.body.firstName;
  var lastName = req.body.lastName;
  var email = req.body.email;
  email = email.toLowerCase();
  var id = req.body.id;
  var image_url = req.body.imageUrl || req.body.image_url;
  console.log("facebookAccessToken==", facebookAccessToken)
  var facebookTokenUrl = "https://graph.facebook.com/me?access_token=" + facebookAccessToken;
  request({
    "method": "GET",
    "url": facebookTokenUrl,
    "json": true
  }, function(err, res) {
    console.log("res.body===", res.body);
    if (err) {

    } else {
      if (res.error) {
        var error = new Error("Unauthorised Request");
        error.status = 401;
        error.message = "Unauthorised Request";
        return resp.status(401).send({
          "error": error
        });
      }
      console.log("res.id====", res.body.id)
      if (res.body.id != id) {
        console.log("comes here");
        var error = new Error("Unauthorised Request");
        error.status = 401;
        error.message = "Unauthorised Request";
        return resp.status(401).send({
          "error": error
        });
      } else {
        app.models.user.findOne({
          where: {
            "email": email
          }
        }, function(err, user) {
          if (user && user.email) {
            app.models.AccessToken.findOne({
              where: {
                userId: user.id
              },
              order: "created DESC"
            }, function(err, accessToken) {
              if (!accessToken) {
                user.hasPassword(id, function(err, isMatch) {
                  if (!isMatch) {
                    user.updateAttribute('password', id, function(err, instance) {
                      app.models.user.login({
                        email: email,
                        password: id,
                        ttl: 60 * 60 * 24 * 7 * 52
                      }, function(err, accessToken) {
                        accessToken.firstName = user.firstName;
                        accessToken.lastName = user.lastName;
                        accessToken.image_url = user.image_url;
                        accessToken.email = user.email;
                        accessToken.save(function(err, data) {})
                        return resp.send(accessToken);
                      })
                    })
                  } else {
                    app.models.user.login({
                      email: email,
                      password: id,
                      ttl: 60 * 60 * 24 * 7 * 52
                    }, function(err, accessToken) {
                      accessToken.firstName = user.firstName;
                      accessToken.lastName = user.lastName;
                      accessToken.image_url = user.image_url;
                      accessToken.email = user.email;
                      accessToken.save(function(err, data) {})
                      return resp.send(accessToken);
                    })
                  }
                })
              } else {
                accessToken.created = new Date();
                accessToken.firstName = user.firstName;
                accessToken.lastName = user.lastName;
                accessToken.image_url = user.image_url;
                accessToken.email = user.email;
                accessToken.save(function(err, savedAccesstoken) {
                  return resp.send(savedAccesstoken);
                })
              }
            })
          } else {
            app.models.user.create({
              firstName: firstName,
              lastName: lastName,
              image_url: image_url,
              email: email,
              password: id,
              emailVerified: true
            }, function(err, newUser) {
              app.models.user.login({
                email: email,
                password: id,
                ttl: 60 * 60 * 24 * 7 * 52,
                emailVerified: true
              }, function(err, accessToken) {
                console.log("here===", err)
                console.log("here accessToken===", err)
                accessToken.firstName = newUser.firstName;
                accessToken.lastName = newUser.lastName;
                accessToken.image_url = newUser.image_url;
                accessToken.email = newUser.email;
                accessToken.save(function(err, savedAccesstoken) {
                  return resp.send(savedAccesstoken);
                })
              })
            })
          }
        })
      }
    }
  });
})

app.post('/reset-password', function(req, res, next) {
  if (!req.accessToken) return res.sendStatus(401);

  //verify passwords match
  if (!req.body.password ||
    !req.body.confirmation ||
    req.body.password !== req.body.confirmation) {
    return res.sendStatus(400, new Error('Passwords do not match'));
  }

  app.models.user.findById(req.accessToken.userId, function(err, user) {
    if (err) return res.sendStatus(404);
    user.updateAttribute('password', req.body.password, function(err, user) {
      var promArr = [];
      app.models.AccessToken.find({
        where: {
          userId: req.accessToken.userId
        }
      }, function(err, arrAccessToken) {
        for (var index in arrAccessToken) {
          (function(i) {
            var token = arrAccessToken[i];
            var delAccesssTokenProm = new Promise(function(resolve, reject) {
              app.models.AccessToken.destroyById(token.id, function(err) {
                resolve({
                  "success": true
                });
              })
            })
            promArr.push(delAccesssTokenProm);
          })(index);
        }
        Promise.all(promArr).then(function(resolveArr) {
          console.log('> password reset processed successfully');
          res.render('response', {
            title: 'Password reset success',
            content: 'Your password has been reset successfully',
            redirectTo: '/',
            redirectToLinkText: 'Log in'
          });
        })
      })
    });
  });
});
app.start = function() {
  return app.listen(function() {
    app.emit('started');
    var baseUrl = app.get('url').replace(/\/$/, '');
    console.log('Web server listening at: %s', baseUrl);
    if (app.get('loopback-component-explorer')) {
      var explorerPath = app.get('loopback-component-explorer').mountPath;
      console.log('Browse your REST API at %s%s', baseUrl, explorerPath);
    }
  });
};
if (require.main === module) {
  app.start();
}
String.prototype.toProperCase = function() {
  return this.replace(/\w\S*/g, function(txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};
