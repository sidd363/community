var loopback = require('loopback');
var ObjectID = require('mongodb').ObjectID;
var Promise = require("bluebird");
module.exports = function(Application) {
  Application.validatesUniquenessOf('userId', { scopedTo: ['jobId'] ,message:"You have already applied for this job"});
  Application.validatesInclusionOf('status', { in: ['uploaded','invited', 'applied','shortlisted','waitlisted','rejected']
  });
  Application.updateStatus = function(id,status,cb){
    Application.findById(id,function(err,application){
      application.status=status;
      application.save(function(err,savedApplication){
        cb(null,{"success":true,"message":"Application status changed to "+status});
      })
    })
  }
  Application.observe("after save",function(ctx,next){
    var instance = ctx.instance;
    var promArr = [];
    console.log("ctx==>>in application", JSON.stringify(ctx), "instance");
    if(instance){
      Application.app.models.job.findById(instance.jobId,function(err,job){
        if(err || !job){
          next(err)
        }
        else{
          if(!job.counts){
            job.counts={};
          }
          if(!job.counts[instance.status]){
            job.counts[instance.status]=0;
          }
          for(var key in job.counts){
            (function(key){
              promArr.push(
                new Promise(function(resolve,reject){
                  Application.count({
                    jobId:instance.jobId,
                    status:key
                  },function(err,data){
                    console.log("count====",data)
                    job.counts[key]=data;
                    resolve();
                  })
                })
              )
            })(key);
          }
          Promise.all(promArr).then(function(resolveArr){
            job.save(function(err,savedJob){
              next();
            })
          })
        }
      })
    }else{
      console.log("instance is empty==>>");
      next();
    }
  });
  Application.getApplication = function(id,status,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("currentUser===",currentUser);
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var filterObj = {
      where:{
        jobId:id
      }
    }
    if(status!="all"){
      filterObj["where"]["status"]=status;
    }
    Application.find(filterObj,function(err,applications){
      if(err)
        return cb(err)
      else {
        var application = applications[0];
        if(application && application.postedByUserId){
          console.log(typeof ObjectID(application.postedByUserId).toString())
          if(ObjectID(application.postedByUserId).toString() != ObjectID(currentUser.id).toString()){
            var error = new Error("Unauthorised Request");
            error.status = 401;
            return cb(error);
          }
        }
        return cb(null,applications)
      }
    });
  }
  Application.changeStatus = function(id,status,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("currentUser===",currentUser);
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.findById(id,function(err,application){
      if(ObjectID(application.postedByUserId).toString() != ObjectID(currentUser.id).toString()){
        var error = new Error("Unauthorised Request");
        error.status = 401;
        return cb(error);
      }
      application.status=status;
      application.save(function(err,savedApplication){
        cb(null,{"success":true,"message":"You have successfully "+status+" the candidate"});
      })
    })
  }
  Application.getShortlistedCandidates = function(cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("currentUser===",currentUser);
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.find({
      where:{
        postedByUserId:currentUser.id,
        status:"shortlisted"
      }
    },function(err,applications){
      if(err)
        cb(err)
      else{
        cb(null,applications);
      }
    })
  }
  Application.sendApplicationEmail = function(userId,subject,message,cb){
    console.log("userid=====",userId)
    Application.app.models.user.findById(userId,function(err,user){
      if (user.email) {
        var html = 'Hi ' + user.firstName + ',<br />' + message;
        Application.app.models.Email.send({
          to: user.email,
          from: user.email,
          subject: subject,
          html: html
        }, function(err) {
          if (err) return console.log('> error sending password reset email');
          cb(null,{"success":true})
        });
      }
    })
  }
  Application.on("userVideoCreated",function(user){
    Application.updateAll({
      "userId":user.id  
    },{
      "videoCount":user.publicVideoCount
    },function(err,savedApplication){
      
    })
  })

};

