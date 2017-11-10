var randomize = require('randomatic');
module.exports = function(Accesscode) {
  Accesscode.beforeRemote("create", function(ctx, accessCode, next) {
    ctx.req.body.code = randomize('A0', 6);
    ctx.req.body.createdAt = new Date();
    next();
  });
  Accesscode.assignCompany = function(code, companyId, cb) {
    Accesscode.findById(code, function(err, accessCode) {
      accessCode.companyId = companyId;
      accessCode.save(function(err, savedAccessCode) {})
      Accesscode.app.models.company.findById(companyId, function(err, company) {
        company.allowedRecruiters = accessCode.recruiters;
        company.allowedFreeUsers = accessCode.freeusers;
        company.save(function(err, savedCompany) {
          cb(null,{"success":true})
        })
      })
    });
  }
};
