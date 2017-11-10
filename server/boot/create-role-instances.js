module.exports = function (app) {
  var Role = app.models.Role;
  var roles = [
    {
      name: 'user',
      description: 'community user'
    },
    {
      name: 'admin',
      description: 'Can Access Everything'
    },
    {
      name: "moderator",
      description:"can mmoderate user data"
    },
    {
      name: "businessAdmin",
      description:"admin of the business"
    },
    {
      name: "recruiter",
      description:"recruiter user"
    },
    {
      name: "freeBusinessUser",
      description:"free business user"
    }
  ];
  for (var index in roles) {
    var role = roles[index];
    Role.findOrCreate({where: {name: role.name}}, role, function (err, createdRole) {
    });
  }
};
