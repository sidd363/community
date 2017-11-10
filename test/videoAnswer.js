'use strict';

var expect = require('chai').expect;
var assert = require('chai').assert;
var describe = require('mocha').describe;
var it = require('mocha').it;
var request = require('supertest');
var app = require('../server/server');
var userId;
var authToken;

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
describe('answer', function() {
  before(function(done) {
    var newUser = "username" + (new Date).getTime() + "@test.com";
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
            done();
          });
      });
  });
  it("add a new video type answer", function(done) {
    json('get', '/api/Questions?filter[where][type]=Video&filter[limit]=1', null, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Video');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken
        })
          .send({
            "public": true,
            "answer": {
              "segments": ["1.mp4","2.mp4","3.mp4"],
              "message": "abc"
            }
          })
          .expect(200, function(err, res) {
            var answer = res.body;
            expect(answer.type).to.equal(question.type);
            expect(answer.firstName).to.equal('test');
            expect(answer.lastName).to.equal('test');
            expect(answer.id).to.exist;
            done();
          })

      })
  });

});