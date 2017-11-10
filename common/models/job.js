var loopback = require('loopback');
var Promise = require("bluebird");
module.exports = function(Job) {
  Job.beforeRemote("create", function(ctx, model, next) {
    var currentUser = ctx.req.accessToken;
    ctx.req.body.firstName = currentUser.firstName;
    ctx.req.body.lastName = currentUser.lastName;
    ctx.req.body.userId = currentUser.userId;
    ctx.req.body.createdAt = new Date();
    if(ctx.req.body.companyId){
      Job.app.models.company.findById(ctx.req.body.companyId,function(err,company){
        if(company){
          ctx.req.body.companyName= company.companyName;
          ctx.req.body.companyImageUrl = company.image_url;
          next();
        }else{
          next()
        }
      })
    }else {
      next();
    }
  });
  Job.afterRemote('create', function(ctx, model, next) {
    var job = ctx.instance;
    Job.app.models.stage.emit('newJobCreated',job);
  })
  Job.apply = function(id, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    console.log("currentUser===", currentUser);
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Job.app.models.application.findOne({
      where: {
        "userId": currentUser.id,
        "jobId": id
      }
    }, function(err, application) {
      console.log("err==", err);
      console.log("application==", application);
      if (err)
        return cb(err)
      else {
        if (!application) {
          //createnew applicationok
          Job.findById(id, function(err, job) {
            var application = new Job.app.models.Application({
              title: job.title,
              companyName: job.companyName,
              postedByFirstName: job.firstName,
              postedByLastName: job.lastName,
              postedByUserId: job.userId,
              jobId: id,
              userId: currentUser.id,
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
              image_url: currentUser.image_url,
              status: "applied"
            })
            application.save(function(err, savedApplication) {
              cb(null, {
                "success": true,
                "message": "You have successfully applied for the job."
              })
            })
          })
        } else if (application && application.status == "invited") {
          application.status = "applied";
          application.save(function(err, updatedApplication) {
            cb(null, {
              "success": true,
              "message": "You have successfully applied for the job."
            })
          })
        } else if (application && application.status == "applied") {
          var e = new Error("You have already applied for this job.");
          e.status = 403;
          return cb(e);
        }
      }
    })
  }
  Job.posted = function(cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    this.find({
      where: {
        "userId": currentUser.id
      },
      order:"createdAt DESC"
    }, function(err, jobs) {
      if (err)
        return cb(err)
      return cb(null, jobs);
    })
  }
  Job.shortlistForJob = function(userId, jobId, cb) {
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var userPromise = new Promise(function(resolve, reject) {
      Job.app.models.user.findById(userId, function(err, user) {
        if (err)
          reject(err);
        else {
          resolve(user);
        }
      })
    })
    var jobPromise = new Promise(function(resolve, reject) {
      Job.findById(jobId, function(err, job) {
        if (err)
          reject(err)
        else {
          resolve(job)
        }
      })
    })
    var arrPromise = [userPromise, jobPromise];
    Promise.all(arrPromise).then(function(resolveArr) {
      var user = resolveArr[0];
      var job = resolveArr[1];
      Job.app.models.application.findOne({
        where: {
          "userId": user.id,
          "jobId": job.id
        }
      }, function(err, application) {
        if (err)
          return cb(err)
        else {
          if (!application) {
            //createnew applicationok
            var newapplication = new Job.app.models.Application({
              title: job.title,
              companyName: job.companyName,
              postedByFirstName: job.firstName,
              postedByLastName: job.lastName,
              postedByUserId: job.userId,
              jobId: job.id,
              userId: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              image_url: user.image_url,
              status: "shortlisted"
            })
            newapplication.save(function(err, savedApplication) {
              cb(null, {
                "success": true,
                "message": "You have successfully shortlisted the candidate."
              })
            })
          } else if (application && application.status == "applied") {
            cb(null, {
              "success": false,
              "message": "The candidate has already applied for this job."
            })
          } else if (application && application.status) {
            cb(null, {
              "success": false,
              "message": "You have already " + application.status + " the candidate for this job."
            })
          }
        }
      });
    })
  }
  Job.invite = function(job, user, status) {
    console.log("comes to invite=====", job, user);
    Job.app.models.application.findOne({
      where: {
        "userId": user.id,
        "jobId": job.id
      }
    }, function(err, application) {
      console.log("application===",job)
      var tempPass = "";
      if(user.tempPass){
        tempPass=user.tempPass;
      }
      if (!application) {
        //createnew applicationok
        var newapplication = new Job.app.models.Application({
          title: job.title,
          companyName: job.companyName,
          postedByFirstName: job.firstName,
          postedByLastName: job.lastName,
          postedByUserId: job.userId,
          jobId: job.id,
          userId: user.id,
          tempPass:user.tempPass,
          firstName: user.firstName,
          lastName: user.lastName,
          image_url: user.image_url,
          email:user.email,
          status: status
        })
        newapplication.save(function(err, savedApplication) {})
      }
    })
  };
  Job.getAllJobs = function(cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    var jobAppliedPromise = new Promise(function(resolve,reject){
      Job.app.models.application.find({
        where:{
          userId:currentUser.id
        }
      },function(err,applications){
        var appliedJobs = [];
        for(var index in applications){
          appliedJobs.push(applications[index].jobId.toString());
        }
        resolve(appliedJobs);
      })
    })
    var allJobsPromise = new Promise(function(resolve,reject){
      Job.find({
        where:{}
      },function(err,jobs){
        resolve(jobs);
      })
    })
    var arrPromise = [jobAppliedPromise,allJobsPromise];
    Promise.all(arrPromise).then(function(resolveArr){
      var appliedJobs = resolveArr[0];
      var allJobs = resolveArr[1];
      for(var index in allJobs){
        var jobId = allJobs[index].id;
        allJobs[index]["applied"]=false;
        if(appliedJobs && appliedJobs.indexOf(jobId.toString())!=-1){
          allJobs[index]["applied"]=true;
        }
      }
      return cb(null,allJobs);
    })
  }
  Job.sendEmailInvite = function(jobId,cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Job.app.models.application.find({
      where:{
        jobId:jobId,
        status:"uploaded"
      }
    },function(err,applications){
      for(var index in applications){
        (function(index){
          var application = applications[index];
          Job.emit("sendCandidateInviteEmail",application,application.tempPass,{"companyName":application.companyName,"title":application.title});
          //Job.emit("updateApplicationStatus",application);
        })(index);
      }
    })
    cb(null,{"success":true})
  }
  Job.on("sendCandidateInviteEmail", function(inviteduser, password, job) {
    var html = 'Hi ' + inviteduser.firstName + ',<br /><br />' + 'Thank you for applying to ' + job.companyName + ' for the position of  ' + job.title + '<br /><br /> As part of the application process, the company would encourage you to create your video personality profile on Shrofile. <br /><br /> You are requested to use the following login credentials to get started: <br/><br/> Username: ' + inviteduser.email + '<br />Password: ' + password+'<br /> We look forward to pre-meet you on Shrofile!'+"<br /><br /> Thanks and regards,<br /><br /> Team Shrofile <br /><br /> <i>About Shrofile:</i> <br /><br /> <i>Shrofile is a video based professional networking platform that gives a snapshot into every professional's personality, passion and preferences. Each video covers a professional's 30 second response to personality related topics.</i>";
    Job.app.models.Email.send({
      to: inviteduser.email,
      from: inviteduser.email,
      subject: 'Account credentials for Shrofile',
      html: html
    }, function(err) {
      if (err) return console.log('> error sending password reset email',err);
      else {
        Job.emit("updateApplicationStatus",inviteduser);
        console.log('> sending password reset email to:', inviteduser.email);
      }
    });
  })
  Job.on("updateApplicationStatus",function(application){
    Job.app.models.application.updateStatus(application.id,"invited",function(err,result){

    });
  });
  Job.sendBulkInviteMails = function(cb){
    Job.app.models.application.find({
      where:{
        "status":"uploaded"
      }
    },function(err,applications){
      if(applications && applications.length){
        for(var index in applications){
          (function(index){
            var application = applications[index];
            Job.emit("sendCandidateInviteEmail",application,application.tempPass,{"companyName":application.companyName,"title":application.title});
            //Job.emit("updateApplicationStatus",application);
          })(index);
        }
      }
      cb(null,{"success":true});
    })
  }
}

