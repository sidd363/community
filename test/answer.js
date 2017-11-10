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
  it("should be give 422 error for video type answer", function(done) {
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
            "public": true
          })
          .expect(422, function(err, res) {
            expect(res.status).to.equal(422);
            done();
          })

      })
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
              "segments": ["abc.com"],
              "coverImage":"abc.jpg",
              "comment": {
                "message":"abc",
                "type":"Text"
              }
            }
          })
          .expect(200, function(err, res) {
            var answer = res.body;
            expect(answer.type).to.equal(question.type);
            expect(answer.firstName).to.equal('test');
            expect(answer.lastName).to.equal('test');
            expect(answer.answer.coverImage).to.equal('https://s3.ap-south-1.amazonaws.com/shrofile-videos/abc.jpg');
            expect(answer.id).to.exist;
            done();
          })

      })
  });

  it("add a new text type answer", function(done) {
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
          "Authorization": authToken
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
            done();
          })
      })
  })

  it("should give 422 for a video type comment", function(done) {
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
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/comment', null, {
              "Authorization": authToken
            })
              .send({
                "comment": {
                  "type": "videoComment"
                }
              })
              .expect(422, function(err, res) {
                expect(res.status).to.equal(422);
                done();
              })
          })
      })
  })

  it("should post a video comment", function(done) {
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
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/comment', null, {
              "Authorization": authToken
            })
              .send({
                "comment": {
                  "public": true,
                  "type": "videoComment",
                  "url": "abc.com"
                }
              })
              .expect(200, function(err, res) {
                expect(res.status).to.equal(200);
                expect(res.body.comment).to.exist;
                expect(res.body.toUserId).to.exist;
                //expect(res.body.userRelation).to.exist;
                done();
              })
          })
      })
  })

  it("should post a 5 word comment", function(done) {
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
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/comment', null, {
              "Authorization": authToken
            })
              .send({
                "comment": {
                  "public": true,
                  "type": "Cloud",
                  "words": ["adventurous", "calm", "cautious", "complacent", "confused"],
                  "userRelation": "family"
                }
              })
              .expect(200, function(err, res) {
                expect(res.status).to.equal(200);
                expect(res.body.comment).to.exist;
                expect(res.body.toUserId).to.exist;
                expect(res.body.userRelation).to.exist;
                json('post', '/api/answers/' + answer.id + '/comment', null, {
                  "Authorization": authToken
                })
                  .send({
                    "comment": {
                      "public": true,
                      "type": "Cloud",
                      "words": ["innovator", "attractive", "willing", "wacky", "visionary"],
                      "userRelation": "family"
                    }
                  })
                  .expect(200, function(err, res) {
                    expect(res.status).to.equal(200);
                    expect(res.body.comment).to.exist;
                    expect(res.body.toUserId).to.exist;
                    expect(res.body.userRelation).to.exist;
                    done();
                  })
              })
          })
      })
  })

  it("should get the comments on an answer", function(done) {
    json('get', '/api/Questions', {"filter[where][type]":"Text","filter[limit]":1}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Text');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/comment', null, {
              "Authorization": authToken
            })
              .send({
                "comment": {
                  "public": true,
                  "type": "videoComment",
                  "url": "abc.com",
                  "userRelation": "family"
                }
              })
              .expect(200, function(err, res) {
                expect(res.status).to.equal(200);
                expect(res.body.comment).to.exist;
                expect(res.body.toUserId).to.exist;
                //expect(res.body.userRelation).to.exist;
                json('get', '/api/answers/' + answer.id + '/comment', null, {
                  "Authorization": authToken
                })
                  .send()
                  .expect(200, function(err, res) {
                    expect(res.status).to.equal(200);
                    expect(res.body).to.be.instanceof(Array);
                    done();
                  })
              })
          })
      })
  })

  it("like an answer", function(done) {
    json('get', '/api/Questions', {"filter[where][type]":"Text","filter[limit]":1}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Text');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/like', null, {
              "Authorization": authToken
            })
              .send({
                isLiked: true
              })
              .expect(200, function(err, res) {
                var answer = res.body;
                expect(answer.likeCount).to.equal(1);
                done();
              })
          })
      })
  });
  it("unlike an answer", function(done) {
    json('get', '/api/Questions', {"filter[where][type]":"Text","filter[limit]":1}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Text');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/like', null, {
              "Authorization": authToken
            })
              .send({
                isLiked: true
              })
              .expect(200, function(err, res) {
                var answer = res.body;
                expect(answer.likeCount).to.equal(1);
                json('post', '/api/answers/' + answer.id + '/like', null, {
                  "Authorization": authToken
                })
                  .send({
                    isLiked: true
                  })
                  .expect(200, function(err, res) {
                    var answer = res.body;
                    expect(answer.likeCount).to.equal(2);
                    json('post', '/api/answers/' + answer.id + '/like', null, {
                      "Authorization": authToken
                    })
                      .send({
                        isLiked: false
                      })
                      .expect(200, function(err, res) {
                        var answer = res.body;
                        expect(answer.likeCount).to.equal(1);
                        done();
                      })
                  })
              })
          })
      })
  });

  it("get likes for an answer", function(done) {
    json('get', '/api/Questions', {"filter[where][type]":"Text","filter[limit]":1}, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        expect(res.body).to.be.instanceof(Array);
        expect(res.body.length).to.equal(1);
        var question = res.body[0];
        expect(question.type).to.equal('Text');
        json('post', '/api/questions/' + question.id + '/answers', null, {
          "Authorization": authToken
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
            json('post', '/api/answers/' + answer.id + '/like', null, {
              "Authorization": authToken
            })
              .send({
                isLiked: true
              })
              .expect(200, function(err, res) {
                var answer = res.body;
                expect(answer.likeCount).to.equal(1);
                json('get', '/api/answers/' + answer.id + '/like', null, {
                  "Authorization": authToken
                })
                  .send()
                  .expect(200, function(err, res) {
                    var likes = res.body;
                    console.log("likes======",likes)
                    expect(likes).to.be.instanceof(Array);
                    expect(likes[0].isLiked).to.equal(true);
                    done();
                  })
              })
          })
      })
  });

  it("get private profile", function(done) {
    json('get', '/api/users/myprofile', null, {
      "Authorization": authToken
    })
      .send()
      .expect(200, function(err, res) {
        console.log("body=====",res.body)
        expect(res.body.feed).to.be.instanceof(Array);
        done();
      });
  });
});
