var loopback = require('loopback');
var app = require('../../server/server');
var ObjectID = require('mongodb').ObjectID;

module.exports = function(Member) {
  Member.validatesUniquenessOf('userId', { scopedTo: ['communityId'] ,message:"You are already a member of this group"});
  Member.validatesInclusionOf('role', { in: ['member', 'admin']
  });
  Member.validatesInclusionOf('status', { in: ['approved', 'submitted']
  });
  Member.observe('after save', function(ctx, next) {
    var instance = ctx.instance;
    var isNew = ctx.instance && ctx.isNewInstance;
    console.log("here after",instance)
    Member.app.models.community.findById(instance.communityId,function(err,community){
      if(community){
        if(isNew)
          community.memberCount+=1;
        if(instance.status=='approved'){
          community.approvedMemberCount+=1;
        }
        community.save(function(savedComunity){
          next();
        })
      }
    })
  })
  Member.approve = function(communityId,id,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    var error;
    if (!currentUser) {
      error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Member.findOne({
      where:{
        userId:currentUser.id,
        communityId:communityId
      }
    },function(err,adminMember){
      if(adminMember.role!="admin"){
        error = new Error('You are not authorised to approve users');
        error.status = error.statusCode = 401;
        return cb(error);
      }else{
        Member.findById(id,function(err,member){
          member.status="approved";
          Member.app.models.userActivity.emit('newUserActivity','addUserToCommunity',{"userId":member.userId,"communityId":communityId});
          member.save(function(err,savedMember){
            Member.app.models.community.emit("addedToCommunity",savedMember,adminMember);
            cb(null,{"success":true})
          });
        })
      }
    })
  }
//  /:id/remove/:memberId
  Member.removeUser = function(id,memberId,cb){
    console.log("here-")
    console.log("id===",id);
    console.log("memberId==",memberId)
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    var error;
    var isApprovedMember=false;
    if (!currentUser) {
      error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.findOne({
      where:{
        userId:currentUser.id,
        communityId:id
      }
    },function(err,adminmember){
      if(adminmember && adminmember.role!="admin"){
        error = new Error('You are not authorised to remove users');
        error.status = error.statusCode = 401;
        return cb(error);
      }
      else{
        Member.findById(memberId,function(err,removedMember){
          if(removedMember.status=="approved"){
            isApprovedMember=true;
          }
          Member.deleteById(memberId,function(err,member){
            Member.app.models.community.findById(id,function(err,community){
              community.memberCount--;
              if(isApprovedMember)
                community.approvedMemberCount--;
              Member.app.models.userActivity.emit('newUserActivity', 'removeUserFromCommunity', {
                "userId": currentUser.id,
                "communityId": community.id
              })
              community.save(function(savedComunity){
                return cb(null,{success:true});
              })
            })
          })
        })
      }
    })
  }
};
