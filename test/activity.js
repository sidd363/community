'use strict';

var expect = require('chai').expect;
var assert = require('chai').assert;
var describe = require('mocha').describe;
var it = require('mocha').it;
var request = require('supertest');
var app = require('../server/server');
var userId;
var authToken;
var userId1;
var authToken1;
var answerUser;

function json(verb, url, params, headers) {
  if (params) {
    var queryString = Object.keys(params).reduce(function(a, k) {
      a.push(k + '=' + params[k]);
      return a;
    }, []).join('&');

    url = url + '?' + queryString;
  }
  var result = request(app)[verb](url)
    .set('Content-Type', 'application/json')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/);

  if (headers) {
    Object.keys(headers).forEach(function(a) {
      result.set(a, headers[a]);
    });
  }
  return result;
}
describe('activity', function() {
  before(function(done) {
    var newUser = "username" + (new Date).getTime() + "@test.com";
    var newUser1 = "username" + (new Date).getTime() + "@test1.com";
    json('post', '/api/users', {}, {})
      .send({
        "email": newUser,
        "password": "123456",
        "firstName": "test",
        "lastName": "test",
        "deviceId": "12345"
      })
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        userId = res.body.id;
        json('post', '/api/users/login', {}, {})
          .send({
            "email": newUser,
            "password": "123456"
          })
          .expect(200, function(err, res) {
            assert.isDefined(res.body.id, 'id should be defined');
            authToken = res.body.id;
            json('post', '/api/users', {}, {})
              .send({
                "email": newUser1,
                "password": "123456",
                "firstName": "test",
                "lastName": "test",
                "deviceId": "12345"
              })
              .expect(200, function(err, res) {
                assert.isDefined(res.body.id, 'id should be defined');
                userId1 = res.body.id;
                json('post', '/api/users/login', {}, {})
                  .send({
                    "email": newUser1,
                    "password": "123456"
                  })
                  .expect(200, function(err, res) {
                    assert.isDefined(res.body.id, 'id should be defined');
                    authToken1 = res.body.id;
                    answerUser = res.body;
                    done();
                  });
              });
          });
      });
  });
  it("should give my feed", function(done) {
    json('get', '/api/activities/myfeed', {"type":['all']}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        var feed = res.body;
        expect(feed.question).to.exist;
        expect(feed.question).to.be.instanceof(Array);
        var question = feed.question[0];
        expect(question.position).to.exist;
        expect(question.name).to.exist;
        expect(question.hint).to.exist;
        expect(question.text).to.exist;
        expect(feed.all).to.exist;
        expect(feed.all).to.be.instanceof(Array);
        var firstActivity = feed.all[0];
        //expect(firstActivity.resourceInfo.isLiked).to.exist;
        done()
      })
  });
  it("should update the activity", function(done) {
    json('get', '/api/Questions?filter[where][type]=Text&filter[limit]=1', null, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Text');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken1
        })
          .send({
            "public": true,
            "answer": {
              "message": "answer for text question"
            }
          })
          .expect(200, function(err, res) {
            var answer = res.body;
            expect(answer.type).to.equal(question.type);
            expect(answer.id).to.exist;
            app.models.activity.createNewActivity(question, answer, "answered", "QUESTION", answerUser, function(err, activity) {
              expect(activity.actorInfo).to.exist;
              expect(activity.resourceId).to.exist;
              expect(activity.resourceInfo).to.exist;
              json('get', '/api/activities/myfeed', {"type":['all']}, {
                "Authorization": authToken
              })
                .send()
                .expect(200, function(err, res) {
                  var feed = res.body;
                  console.log("feed===",feed);
                  expect(feed.question).to.exist;
                  expect(feed.question).to.be.instanceof(Array);
                  var question = feed.question[0];
                  expect(question.name).to.exist;
                  expect(question.hint).to.exist;
                  expect(question.text).to.exist;
                  expect(feed.all).to.exist;
                  expect(feed.all).to.be.instanceof(Array);
                  var answer = activity.resourceInfo;
                  console.log("activity====", activity)
                  var activityCommentData = {
                    firstName: 'check',
                    lastName: 'check',
                    comment: 'jlhjkhjkh'
                  };
                  var updateActivityData = {
                    count: 2,
                    comment: activityCommentData
                  };
                  app.models.activity.updateActivity(activity.resourceId, 'comment',updateActivityData, function(err, activity) {
                    //console.log("activity====", activity)
                    expect(activity.resourceInfo.commentCount).to.equal(2);
                    expect(activity.resourceInfo.answerId.toString()).to.equal(answer.answerId)
                    done();
                  })
                })
            })
          })
      })
  });
});
