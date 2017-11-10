'use strict';

var expect = require('chai').expect;
var assert = require('chai').assert;
var describe = require('mocha').describe;
var it = require('mocha').it;
var request = require('supertest');
var app = require('../server/server');
var authToken1;
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
describe('user', function() {
  var newUser = "username" + (new Date).getTime() + "@test.com";
  var newUser1 = "username" + (new Date).getTime() + "@test1.com";
  before(function(done) {
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
        var userId = res.body.id;
        json('post', '/api/users/login', {}, {})
          .send({
            "email": newUser1,
            "password": "123456"
          })
          .expect(200, function(err, res) {
            assert.isDefined(res.body.id, 'id should be defined');
            authToken1 = res.body.id;
            done();
          });
      });
  });
  it("should not create a new user", function(done) {
    json('post', '/api/users', {}, {})
      .send({
        "email": newUser,
        "password": "123456"
      })
      .expect(422, function(err, res) {
        expect(res.status).to.equal(422);
        done();
      });
  });
  it("should create a new user", function(done) {
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
        done();
      });
  });
  it("should login the user", function(done) {
    json('post', '/api/users/login', {}, {})
      .send({
        "email": newUser,
        "password": "123456"
      })
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        done();
      });
  });

  it("update the profile view", function(done) {
    json('post', '/api/users/login', {}, {})
      .send({
        "email": newUser,
        "password": "123456"
      })
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        json('post', '/api/users/' + res.body.userId + '/profileviews', null, {
            "Authorization": authToken1
          })
          .send()
          .expect(200, function(err, res) {
            if (err) {
              console.log(err);
              throw err;
            }
            var count = res.body;
            expect(count).to.equal(1);
            done();
          });
      });
  });

  it("should get the profile views", function(done) {
    json('post', '/api/users/login', {}, {})
      .send({
        "email": newUser,
        "password": "123456"
      })
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        json('post', '/api/users/' + res.body.userId + '/profileviews', null, {
            "Authorization": authToken1
          })
          .send()
          .expect(200, function(err, res) {
            if (err) {
              console.log(err);
              throw err;
            }
            var count = res.body;
            expect(count).to.equal(2);
            done();
          });
      });
  });


});
