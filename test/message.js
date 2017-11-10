'use strict';

var expect = require('chai').expect;
var assert = require('chai').assert;
var describe = require('mocha').describe;
var it = require('mocha').it;
var request = require('supertest');
var app = require('../server/server');
var userIdOne;
var authTokenOne;
var userIdTwo;
var authTokenTwo;

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

describe('messages', function() {
  before(function(done) {

    // Create first user
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
        userIdOne = res.body.id;
        json('post', '/api/users/login', {}, {})
          .send({
            "email": newUser,
            "password": "123456"
          })
          .expect(200, function(err, res) {
            assert.isDefined(res.body.id, 'id should be defined');
            authTokenOne = res.body.id;
            console.log(res.body);
            done();
          });
      });
  });

  before(function(done) {
    // Create user two
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
        userIdTwo = res.body.id;
        json('post', '/api/users/login', {}, {})
          .send({
            "email": newUser,
            "password": "123456"
          })
          .expect(200, function(err, res) {
            assert.isDefined(res.body.id, 'id should be defined');
            authTokenTwo = res.body.id;
            console.log(res.body);
            done();
          });
      });
  });

  it("should post a private message", function(done) {
    json('post', '/api/messages/' + userIdTwo, null, {
        "Authorization": authTokenOne
      })
      .send({
        "message": "Hi Two. How are you...?"
      })
      .expect(200, function(err, res) {
        console.log(res.body);
        var pmessage = res.body;
        expect(pmessage.id).to.exist;
        done();
      })

  });

  it("should post a private message", function(done) {
    json('post', '/api/messages/' + userIdOne, null, {
        "Authorization": authTokenTwo
      })
      .send({
        "message": "Yes One. I am doing good."
      })
      .expect(200, function(err, res) {
        var pmessage = res.body;
        console.log(res.body);
        expect(pmessage.id).to.exist;
        done();
      })

  });

  it("should post a private message", function(done) {
    json('post', '/api/messages/' + userIdTwo, null, {
        "Authorization": authTokenOne
      })
      .send({
        "message": "Your video profile is awesome. :)"
      })
      .expect(200, function(err, res) {
        console.log(res.body);
        var pmessage = res.body;
        expect(pmessage.id).to.exist;
        done();
      })

  });

  it("should post a private message", function(done) {
    json('post', '/api/messages/' + userIdOne, null, {
        "Authorization": authTokenTwo
      })
      .send({
        "message": "Thanks."
      })
      .expect(200, function(err, res) {
        var pmessage = res.body;
        console.log(res.body);
        expect(pmessage.id).to.exist;
        done()
      })

  });

  it("list all private messages of user one", function(done) {
    json('get', '/api/messages', null, {
        "Authorization": authTokenOne
      })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body).to.have.length(4);
        done();
      })
  })

  it("list all private messages user 2", function(done) {
    json('get', '/api/messages', null, {
        "Authorization": authTokenTwo
      })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body).to.have.length(4);
        done();
      })
  })

   it("user2 should have 2 private messages from user1", function(done) {
    json('get', '/api/messages/' + userIdTwo, null, {
        "Authorization": authTokenOne
      })
      .send()
      .expect(200, function(err, res) {
        console.log(res.body)
        expect(res.body).to.be.instanceof(Array);
        expect(res.body).to.have.length(4);
        done();
      })
  });
 it("should has 4 private messages", function(done) {
    json('get', '/api/messages/' + userIdOne, null, {
        "Authorization": authTokenTwo
      })
      .send()
      .expect(200, function(err, res) {
        console.log(res.body)
        expect(res.body).to.be.instanceof(Array);
        expect(res.body).to.have.length(4);
        done();
      })
  });

});
