//
// Conversation model stores private messages between user.
//
// Suppose User A starts Sending message to B. Backend
// * There is a entry created for A and B in conversation collection
// * The messages are stroed in message collection.
// * If B send message to A, we use the same conversation id. So that we can see the history of message between A and B
//
var app = require('../../server/server');
var dataSource = app.datasources.db;
var loopback = require('loopback');
var HTTPClient = require('httpclient');
var Validator = require('jsonschema').Validator;
var v = new Validator();
var ObjectID = require('mongodb').ObjectID;

module.exports = function(Conversation) {

  Conversation.observe('before save', function(ctx, next) {

    var isNew = ctx.instance && ctx.isNewInstance;

    // console.log("ctx===", JSON.stringify(ctx));
    var e;
    var currentActiveContext = loopback.getCurrentContext();
    var currentUser = currentActiveContext && currentActiveContext.get('currentUser')
    if (!currentUser) {
      e = new Error('Invalid accessToken');
      e.status = e.statusCode = 401;
      return next(e);
    }

    if (isNew) {
      ctx.instance.submittedAt = new Date();
    }

    return next();

  });

};
