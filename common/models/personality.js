var request = require('request');
var loopback = require('loopback');
var ObjectID = require('mongodb').ObjectID;
var Promise = require('bluebird');
module.exports = function(Personality) {
  Personality.disableRemoteMethod("find", true);
  Personality.disableRemoteMethod("findById", true);
  Personality.disableRemoteMethod("findOne", true);

  Personality.updateProfileChart = function(instanceObj) {
    console.log('instanceObj====', instanceObj);
    var words = instanceObj.comment.words;
    var id = instanceObj.toUserId;
    var firstName = instanceObj.toUserFirstName;
    var lastName = instanceObj.toUserLastName;
    var image_url = instanceObj.image_url;
    var relationType = instanceObj.userRelation;
    var calibratorUrl = global.config.calibrator.host + global.config.calibrator.vibechartpath + "?words=" + JSON.stringify(words);
    var wordCloudUrl = global.config.calibrator.host + global.config.calibrator.wordcloudpath + "?words=" + JSON.stringify(words);
    var personalityPromiseArr = [];
    var vibeChartPromise = new Promise(function(resolve, reject) {
      request({
        "method": "GET",
        "url": calibratorUrl,
        "json": true
      }, function(err, res) {
        if (err)
          reject(err);
        else {
          resolve(res.body);
        }
      });
    });
    var wordCloudPromise = new Promise(function(resolve, reject) {
      resolve(words)
    });
    personalityPromiseArr.push(vibeChartPromise, wordCloudPromise);
    Promise.all(personalityPromiseArr).then(function(resolveArr) {
      var personalityChart = resolveArr[0];
      var words = resolveArr[1];
      var uniqueDocId = id + relationType;
      console.log("personalityChart===", personalityChart);
      Personality.findById(uniqueDocId, function(err, personality) {
        if (!personality) {
          var wordCloudData = createWordCloudData(undefined, words);
          var personalityChartData = createPersonalitychartData(undefined, personalityChart);
          var newPersonality = new Personality({
            userid: id,
            relationType: relationType,
            uniqueDocId: uniqueDocId,
            personalityChart: personalityChartData,
            wordcloud: wordCloudData,
            firstName: firstName,
            lastName: lastName,
            image_url: image_url,
            responses: 1
          });
          newPersonality.save(function(err, data) {})
        } else {
          personality.wordcloud = createWordCloudData(personality.wordcloud, words);
          personality.personalityChart = createPersonalitychartData(personality.personalityChart, personalityChart);
          personality.responses += 1;
          personality.save(function(err, data) {
            console.log("updatedPersonality")
          })
        }
      });
    })
  }
  Personality.updateWordCloud = function(instanceObj) {
    var words = instanceObj.comment.words;
    var id = instanceObj.toUserId;
    var firstName = instanceObj.firstName;
    var lastName = instanceObj.lastName;
    var relationType = instanceObj.userRelation;

  }
  Personality.getMyPersonality = function(userRelation, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    userRelation = userRelation || 'myself';
    console.log(userRelation);
    var userid = ObjectID(currentUser.id);
    var uniqueDocId = userid + userRelation;
    Personality.findById(uniqueDocId, function(err, personality) {
      if (!personality)
        return cb(null, {})
      var wordcloud = personality.wordcloud;
      var newwordcloud = [];
      for (var word in wordcloud) {
        var cloud = {};
        cloud.word = word;
        cloud.frequency = wordcloud[word]["frequency"];
        console.log("frq======", wordcloud[word]["frequency"])
        newwordcloud.push(cloud)
      }
      personality.wordcloud = newwordcloud;
      cb(null, personality);
    })
  }

  Personality.getUserPersonality = function(userRelation, id, cb) {
    userRelation = userRelation || 'myself';
    console.log(userRelation);
    var userid = id;
    var uniqueDocId = userid + userRelation;
    Personality.findById(uniqueDocId, function(err, personality) {
      if (!personality)
        return cb(null, {})
      var personalityChart = personality.personalityChart;
      var dimensionMapping = {};
      var wordcloud = personality.wordcloud;
      var newwordcloud = [];
      for (var dimension in personalityChart) {
        var averageaddition = personalityChart[dimension]["averageaddition"];
        var sdevaddition = personalityChart[dimension]["sdevaddition"];
        var count = personalityChart[dimension]["count"];
        var average = averageaddition / count;
        var sdev = Math.sqrt(sdevaddition / count);
        if (personalityChart[dimension]["name1"] || personalityChart[dimension]["name2"]) {
          var name1 = personalityChart[dimension]["name1"].toLowerCase();
          var name2 = personalityChart[dimension]["name2"].toLowerCase();
          dimensionMapping[name1] = Math.round((average + sdev) * 100) / 100;
          dimensionMapping[name2] = Math.abs(Math.round((average - sdev) * 100) / 100);
        }
      }
      for (var word in wordcloud) {
        var cloud = {};
        cloud.word = word;
        cloud.frequency = wordcloud[word]["frequency"];
        newwordcloud.push(cloud)
      }
      personality.wordcloud = newwordcloud;
      personality.personalityChart = dimensionMapping;
      cb(null, personality);
    })
  }


  function createWordCloudData(existingWordCloud, newWords) {
    console.log("existingWordCloud===", existingWordCloud);
    if (!existingWordCloud) {
      existingWordCloud = {};
    }
    for (var index in newWords) {
      var word = newWords[index].toLowerCase();

      if (!existingWordCloud[word]) {
        console.log("existingWordCloud[word]", existingWordCloud[word]);
        existingWordCloud[word] = {};
      }
      console.log("existingWordCloud[word]['frequency']====", existingWordCloud[word]['frequency'] | 0);
      existingWordCloud[word]['frequency'] = (existingWordCloud[word]['frequency'] | 0) + 1;
    }
    return existingWordCloud;
  }

  function createPersonalitychartData(existingPersonality, newPersonality) {
    if (!existingPersonality)
      existingPersonality = {}
    for (var word in newPersonality) {
      for (var dimension in newPersonality[word]) {
        if (!existingPersonality[dimension])
          existingPersonality[dimension] = {
            "averageaddition": 0,
            "sdevaddition": 0,
            "count": 0
          }
        existingPersonality[dimension]["averageaddition"] += newPersonality[word][dimension]["average"];
        existingPersonality[dimension]["sdevaddition"] += Math.pow(newPersonality[word][dimension]["sdev"], 2);
        existingPersonality[dimension]["count"] += 1;
        existingPersonality[dimension]["name1"] = newPersonality[word][dimension]["name1"];
        existingPersonality[dimension]["name2"] = newPersonality[word][dimension]["name2"];
      }
    }
    console.log("existingPersonality==", existingPersonality);
    return existingPersonality;
  }
};
