var loopback = require('loopback');
module.exports = function(Company) {
  Company.beforeRemote("create",function(ctx,model,next){
    ctx.req.body.createdAt = new Date();
    next();
  });
  Company.on("newBusinessUser",function(businessUserInstance){
    Company.findById(businessUserInstance.companyId,function(err,company){
      if(businessUserInstance.role=="freeBusinessUser"){
        company.freeusers++;
      }else if (businessUserInstance.role=="businessAdmin" || businessUserInstance.role=="recruiter") {
        company.recruiters++;
      }
      company.save(function(err,savedCompany){

      })
    })
  });
  Company.getAdminDashBoard = function(cb){
    var ctx = loopback.getCurrentContext();
    var currentUser = ctx && ctx.get('currentUser');
    if (!currentUser) {
      var error = new Error("Unauthorised Request");
      error.status = 401;
      return cb(error);
    }
    Company.app.models.businessUser.findById(currentUser.id,function(err,user){
      if(err)
        return cb(err)
      else {
        Company.app.models.businessUser.find({
          where:{
            companyId:user.companyId
          }
        },function(err,users){
          if(err)
            return cb(err)
          else {
            return cb(null,users);
          }
        })
      }
    })
  }
};
