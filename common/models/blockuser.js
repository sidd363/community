var loopback = require("loopback");
var ObjectID = require('mongodb').ObjectID;
var searchClient = require("../lib/elasticsearch");
var Promise = require("bluebird");
module.exports = function(Blockuser) {
  Blockuser.disableRemoteMethod("create", true);
  Blockuser.disableRemoteMethod("upsert", true);
  Blockuser.disableRemoteMethod("updateAll", true);
  Blockuser.disableRemoteMethod("updateAttributes", false);

  Blockuser.disableRemoteMethod("find", true);
  Blockuser.disableRemoteMethod("findById", true);
  Blockuser.disableRemoteMethod("findOne", true);
  Blockuser.disableRemoteMethod("deleteById", true);
  Blockuser.disableRemoteMethod("confirm", true);
  Blockuser.disableRemoteMethod("count", true);
  Blockuser.disableRemoteMethod("exists", true);
  Blockuser.validatesPresenceOf('userId', 'blockedUserId');

  Blockuser.block = function(blockid, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Blockuser.app.models.user.findById(blockid, function(err, user) {
      var userId = ObjectID(currentUser.id).toString();
      console.log("userId", userId);
      var blockeduser = new Blockuser({
        userId: userId,
        blockedUserId: user.id,
        blockedFirstName: user.firstName,
        blockedLastName: user.lastName,
        blockedImageUrl: user.image_url,
        uniqueblockId: currentUser.id + "_" + blockid
      });
      blockeduser.save(function(err, savedBlockeduser) {
        if (err)
          return cb(err)
        return cb(null, {
          "success": true
        })
      })
    })
  }
  Blockuser.listBlockedUsers = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.find({
      where: {
        userId: currentUser.id
      },
      fields: {
        blockedUserId: true,
        blockedFirstName: true,
        blockedImageUrl: true,
        blockedLastName: true
      }
    }, function(err, blockedUsers) {
      if (err)
        return cb(err)
      return cb(null, blockedUsers);
    })
  }
  Blockuser.unblock = function(blockedId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var uniqueblockId = currentUser.id + "_" + blockedId;
    this.destroyById(uniqueblockId, function(err) {
      if (err)
        return cb(err)
      return cb(null, {
        "success": true
      })
    })
  }
  Blockuser.searchUser = function(query, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');

    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var returnArr = [];
    if (query && query.searchName) {
      var queryObj = {
        "query": {
          "match": {
            "displayname": query.searchName
          }
        }
      }
      var searchPromise = new Promise(function(resolve, reject) {
        searchClient.search("user", queryObj, function(err, data) {
          console.log("data====", data);
          var searchedUsers = [];
          data.hits.hits.forEach(function(hit) {
            searchedUsers.push(hit._source);
          })
          resolve(searchedUsers)
        })
      })
      var blockedUsersPromise = new Promise(function(resolve, reject) {
        Blockuser.find({
          where: {
            userId: currentUser.id
          }
        }, function(err, data) {
          var blockedUsers = [];
          console.log("data====",data)
          for(index=0;index<data.length;index++){
            var blockedUser = data[index];
            console.log("blockedUser===",JSON.parse(JSON.stringify(blockedUser)).blockedUserId)
            blockedUsers.push(JSON.parse(JSON.stringify(blockedUser)).blockedUserId)
          }
          console.log(blockedUsers)
          resolve(blockedUsers)
        })
      })
      Promise.all([searchPromise, blockedUsersPromise]).then(function(resolveArr) {
        var searchedUsers = resolveArr[0];
        var blockedUsers = resolveArr[1];
        searchedUsers = searchedUsers.filter(function(user) {
          if (blockedUsers.indexOf(user.userid) == -1) {
            return true
          }
        })
        return cb(null, searchedUsers);
      })
    } else {
      return cb(null, returnArr)
    }
  }
};
