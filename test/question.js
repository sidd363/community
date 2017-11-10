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
describe('question', function() {
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
  it("should get unanswered questions", function(done) {
    json('get', '/api/questions/unansweredquestions', {}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body).to.have.length.above(10);
        done();
      })
  });

  it("should get a random question", function(done) {
    json('get', '/api/questions/randomquestion', {}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        expect(res.body).to.be.instanceof(Object);
        done();
      })
  })

  it("should return a question of a particular type", function(done) {
    json('get', '/api/questions/getquestion', {'qorder':5}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        expect(res.body).to.be.instanceof(Object);
        expect(res.body.order).to.equal(5)
        done();
      })
  })

});