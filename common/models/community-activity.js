var notifTag = require("../../config/notificationConfig.json");
var ObjectID = require('mongodb').ObjectID;
module.exports = function(Communityactivity) {
  Communityactivity.on('newPostInCommmunity', function(data) {
    Communityactivity.app.models.member.find({
      where: {
        communityId: data.communityId,
        "status": "approved"
      }
    }, function(err, members) {
      if (members && members.length) {
        var newPostNotifData = notifTag["newPostInCommmunity"];
        for (var index in members) {
          (function(index) {
            var member = members[index];
            var memberId = member.userId;
            console.log("if============",JSON.parse(JSON.stringify(member.userId)) != JSON.parse(JSON.stringify(data.userId)))
            if (JSON.parse(JSON.stringify(member.userId)) != JSON.parse(JSON.stringify(data.userId)) && member.userTopicARN != undefined) {
              console.log("inner member.userId==",memberId)
              var message = {
                "tagid": newPostNotifData.tagid,
                "message": newPostNotifData.message.format(data.firstName,data.lastName,member.communityName),
                "dataobj": {
                  "id": member.communityId,
                  "resourceId": data.resourceId
                }
              }
              Communityactivity.app.models.Notification.publish(message, member.userTopicARN, function(err, subscribe) {
                if (err) {
                  console.log("Error publishing message to topic.");
                }
              });
              Communityactivity.app.models.Notification.saveNotification(memberId, message, member.userTopicARN);
            }
          })(index)
        }
      }
    })

  })
};
