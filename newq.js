'use strict';

var mongo = require('mongoskin');
var db = mongo.db("mongodb://10.0.1.117:27017/shrofile", {
   native_parser: true
});
var async = require('async');
 

function getDataFromdb() {
   db.collection('user').find({})
   .toArray(function (err, users) {
        if(users){
            console.log('users Length...',users.length);
            async.each(users, function(user, cb){
                let questionObj={
                    "answerCount" : 0,
                    "type" : "Video",
                    "section" : "Aspirations",
                    "submittedAt" : new Date(),
                    "name" : "MY\nALTERNATE CAREER",
                    "description" : "If not a corporate career, what alternate profession would you choose?  ",
                    "text" : "If not a corporate career, what alternate profession would you choose? ",
                    "colorcode" : "#a0b723",
                    "hint" : [
                        "Which profession?",
                        "Your role",
                        "Why this?",
                        "When will you pursue?"
                    ],
                    "image" : "https://s3.ap-south-1.amazonaws.com/shrofile-imageassets/112.jpg",
                    "answerTemplate" : {
                        "type" : "object",
                        "availableSettings" : {
                            "filters" : [
                                "grayscale",
                                "sepia",
                                "invert",
                                "blue screen"
                            ],
                            "settings" : [
                                "Brightness",
                                "Hue",
                                "Saturation",
                                "Contrast"
                            ]
                        },
                        "properties" : {
                            "segments" : {
                                "type" : "array",
                                "items" : {
                                    "type" : "string"
                                },
                                "minItems" : 1,
                                "uniqueItems" : true,
                                "description" : "s3 keys url of video segment"
                            },
                            "videodescription" : {
                                "type" : "string"
                            },
                            "videotitle" : {
                                "type" : "string"
                            },
                            "coverImage" : {
                                "type" : "string",
                                "description" : "cover image of video"
                            },
                            "words" : {
                                "type" : "array",
                                "description" : "5 words about himself"
                            },
                            "url" : {
                                "type" : "string",
                                "description" : "to be sent empty from client"
                            }
                        },
                        "required" : [
                            "segments"
                        ]
                    },
                    "userId" : "",
                    "order" : 112,
                    "multiple" : 0,
                    "displayOrder" : [
                        28
                    ]
                };
                questionObj.userId = user._id? user._id : "";
                db.collection('question').update({"name" : "MY\nALTERNATE CAREER", "userId": questionObj.userId}, questionObj, {upsert:true}, function(err, result) {    
                    if (err) {
                        console.log("error while saving question", err, questionObj);
                        cb(err);
                    }else if (result) {
                        console.log('Added!');
                        cb(null);
                    }
                });
            }, function(err){
                if(err){
                    console.log("error in one user", err)
                }else{
                    console.log("all is well")
                }
           })
        }else{
            console.log("No user in mongo", users, db)
        }
   })
}

getDataFromdb();
