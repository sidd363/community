//
// On server bootup all the questions from "question-template.json" and
// loaded to memory. So that we can access that templates from where ever we want.
//
// The question-template.json is generated based on questions on the excel sheet.
//
var templateConfig = require('../../config/templateType.json');
module.exports = function(app) {

  // get memory datasource
  var dataSource = app.datasources.db;

  // create a model using the
  // memory data source
  var properties = {
    name: String,
    value: String
  };
  var Config = dataSource.createModel('config', properties);
  var fs = require('fs');
  var path = require('path');
  // read contents in "question-template.json"
  var file = path.join(__dirname, 'question-template.json');
  fs.readFile(file, 'utf8', function(err, contents) {
    if (err) throw err;
    var templates = [];
    var contentArray = JSON.parse(contents);
    for (var i = contentArray.length - 1; i >= 0; i--) {
      var template = contentArray[i];
      var text = '{}';
      var answerTemplate = {};
      answerTemplate = templateConfig[template.type]
      if (template.type == 'Form') {
        answerTemplate = templateConfig[template.type][template.name];
      }
      template.answerTemplate = answerTemplate;
      templates.push(template);
    }

    Config.create([{
      name: 'QUESTION_TEMPLATE',
      value: JSON.stringify(templates)
    }], count);
  });

  function count() {
    Config.find({
      where: {
        name: 'QUESTION_TEMPLATE'
      },
      limit: 1
    }, function(err, config) {});
  }
  console.log('Question templates loaded successfully from question-template.json.');
};
