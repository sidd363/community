//
// This is the custom model. This stores questions against user.  The questions are loaded from question-template.json
// To know about model structure check question.json
//
// GET "/getquestion"
// GET "/getquestion/:id"
// GET "/updatequestions"
// GET "/unansweredquestions"
// GET "/randomquestion"
// GET "/getallquestions"
//
var loopback = require('loopback');
var app = require('../../server/server');
var notifTag = require("../../config/notificationConfig.json")
var dataSource = app.datasources.db;
module.exports = function(Question) {
  //
  // GET "/unansweredquestions"
  // API to get list of unanswered questions by the user.
  //
  Question.unansweredquestions = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    var userId = currentUser.id;
    this.find({
      where: {
        userId: userId,
        answerCount: 0
      },
      order: 'submittedAt DESC'
    }, function(err, data) {
      if (err)
        return cb(err);
      return cb(null, data);
    });
  }
  Question.remoteMethod(
    'unansweredquestions', {
      isStatic: true,
      description: 'returns list of questions which is not answered by logged in user.',
      returns: {
        arg: 'data',
        type: 'question',
        root: true
      },
      http: {
        path: '/unansweredquestions',
        verb: 'get',
        status: 200
      }
    }
  );

  //
  // GET "/randomquestion"
  // API to get a random question.
  //
  Question.randomquestion = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }

    var userId = currentUser.id;
    this.find({
      where: {
        userId: userId
      },
      order: 'submittedAt ASC'
    }, function(err, data) {
      if (err)
        return cb(err);
      return cb(null, data[Math.floor(Math.random() * data.length)]);
    });
  }

  Question.remoteMethod(
    'randomquestion', {
      description: 'return a random question for logged in user.',
      returns: {
        arg: "data",
        type: "question",
        root: true
      },
      http: {
        path: '/randomquestion',
        verb: 'get',
        status: 200
      },
    }
  );

  //
  // Function to get an unanswered question based on priority of questions in tempalate
  //
  Question.priorityUnansweredQuestion = function(id, cb) {
    var userId = id;
    this.find({
      where: {
        userId: userId,
        answerCount: 0
      },
      order: 'order ASC',
      limit: 3
    }, function(err, data) {
      if (err)
        return cb(err);
      return cb(null, data); //Currently we want to return unanswered question in the order we have added in the template
    });
  }

  Question.remoteMethod(
    'getAllQuestions', {
      description: 'return a random question for logged in user.',
      "accepts": {
        "arg": "flavor",
        "type": "string",
        "description": "type of device"
      },
      returns: {
        arg: "data",
        type: "question",
        root: true
      },
      http: {
        path: '/getallquestions',
        verb: 'get',
        status: 200
      },
    }
  );

  //
  // GET "/getallquestions"
  //
  Question.getAllQuestions = function(flavor, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("currentUser==", currentUser)
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var userId = currentUser.id;
    var Config = dataSource.getModel('config');
    this.find({
      where: {
        userId: userId
      }
    }, function(err, questions) {
      var questionTemplate = {};
      var orderedQuestions = [];
      if (questions) {
        for (var index in questions) {
          var question = questions[index];
          var displayOrder = question.displayOrder;
          for (var i in displayOrder) {
            if (i > 0) {
              var newQuestion = JSON.parse(JSON.stringify(question));
              newQuestion.section = "Overall";
              orderedQuestions.splice(displayOrder[i] - 1, 0, newQuestion);
            } else {
              orderedQuestions.splice(displayOrder[i] - 1, 0, question);
            }
          }
        }
      }
      if (orderedQuestions) {
        for (var index in orderedQuestions) {
          var question = orderedQuestions[index];
          var section = question["section"];
          if (!questionTemplate[section]) {
            questionTemplate[section] = [];
          }
            questionTemplate[section].push(question);
        }
        if (flavor == 'android') {
          var returnArr = [];
          for (var section in questionTemplate) {
            var returnObj = {
              'section': section,
              'questions': questionTemplate[section]
            }
            returnArr.push(returnObj)
          }
          questionTemplate = returnArr;
        }
        cb(null, questionTemplate)
      }
    });
  }

  //
  // GET "/getquestion"
  //
  // Get question by question template id for logged in user.
  //
  Question.getQuestion = function(qorder, cb) {
      var ctx = loopback.getCurrentContext();
      var currentUser = ctx && ctx.get('currentUser');
      if (!currentUser) {
        var error = new Error("Unauthorised Request");
        error.status = 401;
        return cb(error);
      }
      var userId = currentUser.id;
      console.log("userid===", userId);
      this.findOne({
        where: {
          userId: userId,
          order: qorder
        }
      }, function(err, data) {
        if (err)
          return cb(err);
        return cb(null, data);
      });
    },

    //
    // GET "/getquestion/:id"
    //
    // get question by unique id.
    //
    Question.getSpecificQuestion = function(id, cb) {
      var ctx = loopback.getCurrentContext();
      var currentUser = ctx && ctx.get('currentUser');
      if (!currentUser) {
        var error = new Error("Unauthorised Request");
        error.status = 401;
        return cb(error);
      }

      var userId = currentUser.id;
      console.log("userid===", userId);
      this.findById(id, {
        include: {
          relation: 'answers',
          scope: {
            order: "submittedAt DESC"
          }
        }
      }, function(err, data) {
        if (err)
          return cb(err);
        cb(null, data);
      })
    }

  //
  // GET "/updatequestions"
  //
  // update all question image based on question template image
  //
  // Question.updateQuestions = function(cb) {
  //   var Config = dataSource.getModel('config');
  //   Config.find({
  //     where: {
  //       name: 'QUESTION_TEMPLATE'
  //     },
  //     limit: 1
  //   }, function(err, config) {
  //
  //     if (err) {
  //       throw err;
  //     }
  //     if (config) {
  //       templates = JSON.parse(config[0].value);
  //       for (var i = 0; i < templates.length; i++) {
  //         var image = templates[i].icon;
  //         var order = templates[i].id;
  //         (function(image, order) {
  //           console.log("order=====", order, "   image====", image)
  //           Question.find({
  //             where: {
  //               order: order
  //             }
  //           }, function(err, questions) {
  //             if (!err) {
  //               for (var index = 0; index < questions.length; index++) {
  //                 var question = questions[index];
  //                 question['image'] = image;
  //                 question.save(function(err, savedQuestion) {});
  //               }
  //             }
  //           })
  //         })(image, order);
  //       }
  //     }
  //   });
  //   cb(null, {
  //     'success': true
  //   })
  // }

  Question.updateQuestions = function(cb) {
    var Config = dataSource.getModel('config');
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
        console.log(config);
        for (var i = templates.length - 1; i >= 0; i--) {
          (function(i){
            var q = {};
            q.type = templates[i].type;
            q.name = templates[i].name;
            q.description = templates[i].description;
            q.section = templates[i].section;
            if (templates[i].hint.length > 0) {
              q.hint = templates[i].hint.split(',');
            }
            q.order = templates[i].id;
            Question.updateAll({"order":q.order},{"name":q.name,"description":q.description,hint:q.hint,type:q.type,"text":q.description},function(err,data){
            })
            Question.app.models.activity.updateAll({qorder:q.order},{"resourceInfo.title":q.name.toProperCase(),"resourceInfo.text":q.description,"resourceInfo.section":q.section},function(err,data){})
          })(i);
          }
        }
        cb(null,{'success':true})
    })
  }
  Question.sendIntroNotifications = function(cb){
    Question.find({
      where:{
        order:1,
        answerCount:0
      }
    },function(err,questions){
      console.log(err)
      console.log(questions)
      var postNewAnswerData = notifTag["sendIntroNotifications"];
      for(var index in questions){
        (function(i){
          var question=questions[i];
          console.log(question)
          Question.app.models.user.findById(question.userId, function(err, user) {
            if (user && user.userTopicARN) {
              var message = {
                tagid: postNewAnswerData.tagid,
                message: postNewAnswerData.message.format(user.firstName, question.title),
                dataobj: {
                  qorder: question.order,
                  userid: user.id,
                  type:"Video",
                  firstName: user.firstName,
                  lastName: user.lastName,
                  image_url: user.image_url
                }
              }
              console.log(message)
              Question.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing message to topic.");
                }
              });
              Question.app.models.Notification.saveNotification(user.id, message, user.userTopicARN);
            }
          })
        })(index)
      }
    })
    return cb(null,{"success":true})
  }
  Question.sendDailyUpdateNotifications = function(cb){
    Question.find({
      where:{
        order:111
      }
    },function(err,questions){
      console.log(err)
      console.log(questions)
      var postNewAnswerData = notifTag["sendDailyUpdateNotifications"];
      for(var index in questions){
        (function(i){
          var question=questions[i];
          console.log(question)
          Question.app.models.user.findById(question.userId, function(err, user) {
            if (user && user.userTopicARN) {
              var message = {
                tagid: postNewAnswerData.tagid,
                message: postNewAnswerData.message,
                dataobj: {
                  qorder: question.order,
                  userid: user.id,
                  type:"Video",
                  firstName: user.firstName,
                  lastName: user.lastName,
                  image_url: user.image_url
                }
              }
              console.log(message)
              Question.app.models.Notification.publish(message, user.userTopicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing message to topic.");
                }
              });
              Question.app.models.Notification.saveNotification(user.id, message, user.userTopicARN);
            }
          })
        })(index)
      }
    })
    return cb(null,{"success":true})
  }
};
