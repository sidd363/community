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
describe('followers :', function() {
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
  it('should give 422 user does not exist', function(done) {
    json('post', '/api/friends', {}, {
      "Authorization": authToken
    })
      .send({
        "friendId": "random"
      })
      .expect(422, function(err, res) {
        expect(res.status).to.equal(422);
        done();
      });
  });
  it('should follow the user', function(done) {
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
        var newUserId = res.body.id;
        json('post', '/api/friends', {}, {
          "Authorization": authToken
        })
          .send({
            "friendId": newUserId
          })
          .expect(200, function(err, res) {
            expect(res.status).to.equal(200);
            expect(res.body.uniqueFollowerId).to.exist;
            done();
          });
      })
  })
  it('should not allow to follow the same user twice', function(done) {
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
        var newUserId = res.body.id;
        json('post', '/api/friends', {}, {
          "Authorization": authToken
        })
          .send({
            "friendId": newUserId
          })
          .expect(200, function(err, res) {
            json('post', '/api/friends', {}, {
              "Authorization": authToken
            })
              .send({
                "friendId": newUserId
              })
              .expect(500, function(err, res) {
                expect(res.status).to.equal(500);
                expect(res.error).to.exist;
                done();
              })
          });
      })
  });

  var followUser = "username" + (new Date).getTime() + "@test.com";
  var followUserId = null;
  it('should follow the user', function(done) {
    json('post', '/api/users', {}, {})
      .send({
        "email": followUser,
        "password": "123456",
        "firstName": "test",
        "lastName": "test",
        "deviceId": "12345"
      })
      .expect(200, function(err, res) {
        followUserId = res.body.id;
        json('post', '/api/friends', {}, {
          "Authorization": authToken
        })
          .send({
            "friendId": followUserId
          })
          .expect(200, function(err, res) {

            expect(res.status).to.equal(200);
            done();

          });
      })
  });

  it('should be in follower list', function(done) {
    json('post', '/api/users/login', {}, {})
      .send({
        "email": followUser,
        "password": "123456"
      })
      .expect(200, function(err, res) {
        assert.isDefined(res.body.id, 'id should be defined');
        var fauthToken = res.body.id;
        json('get', '/api/followers', {}, {
          "Authorization": fauthToken
        })
          .expect(200, function(err, res) {
            expect(res.status).to.equal(200);
            expect(res.body).to.have.length(1);
            done();
          })
      });
  });

  it('should unfollow the user', function(done) {
    json('post', '/api/friends/' + followUserId + '/unfollow', {}, {
      "Authorization": authToken
    })
      .expect(200, function(err, res) {
        expect(res.status).to.equal(200);
        json('get', '/api/friends', {}, {
          "Authorization": authToken
        })
          .expect(200, function(err, res) {
            expect(res.status).to.equal(200);
            expect(res.body).to.have.length(2);
            done();
          })
      })
  });
});
