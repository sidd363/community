

'use strict';

var mongo = require('mongoskin');
var db = mongo.db("mongodb://10.0.1.117:27017/shrofile", {
   native_parser: true
});
var async = require('async');
 

function getDataFromdb() {
    let users=[["r.simran@campusuvce.in"], ["f.neha@campusuvce.in"], ["k.keerthi@campusuvce.in"], ["r.nagalakshmi@campusuvce.in"], ["r.manisha@campusuvce.in"], ["a.tushar@campusuvce.in"], ["s.shradha@campusuvce.in"], ["l.guru@campusuvce.in"], ["r.roshni@campusuvce.in"], ["b.vishal@campusuvce.in"], ["b.sangappa@campusuvce.in"], ["p.vandana@campusuvce.in"], ["s.laxmi@campusuvce.in"], ["s.sushanth@campusuvce.in"], ["r.ganesh@campusuvce.in"], ["m.mohammed@campusuvce.in"], ["s.shriram@campusuvce.in"], ["nishanth.r017@gmail.com"], ["monisha_raj@srmuniv.edu.in"], ["shivani_sunilchandra@srmuniv.edu.in"], ["haritharajkumar96@gmail.com"], ["shreya_tripathi@srmuniv.edu.in"], ["nikhil_satish@srmuniv.edu.in"], ["shweta_subodhkumar@srmuniv.edu.in"], ["mayankgt01@gmail.com"], ["sumanshalini1913@gmail.com"], ["ajaychirania.ac@gmail.com"], ["sahasomdatta1996@gmail.com"], ["snehamuralee21@gmail.com"], ["Kritikrishnan101@gmail.com"], ["shalinitwinkle17@gmail.com"], ["kshitijkumar_agarwal@srmuniv.edu.in"], ["sakshi_poddar@srmuniv.edu.in"], ["aggarwalmilan1996@gmail.com"], ["amish_anant@srmuniv.edu.in"], ["nisharathi_premratan@srmuniv.edu.in"], ["Aditi127109@gmail.com"], ["pritish_rawal@srmuniv.edu.in"], ["elaserph17@gmail.com"], ["saahilshubham_summykishore@srmuniv.edu.in"], ["Asthasoni_nareshkumar@srmuniv.edu.in"], ["mahajan.aashna@gmail.com"], ["Sai_dharanidhar@srmuniv.edu.in"], ["saumyata_praveenpranay@srmuniv.edu.in"], ["shikharsingh_shivendra@srmuniv.edu.in"], ["vanshikadewangan25@gmail.com"], ["jharna71096@gmail.com"], ["shreyashamshery_navneet@srmuniv.edu.in"], ["aparna_upadhyay@srmuniv.edu.in"], ["parthiban_arajendran@srmuniv.edu.in"], ["vikashlashmi@gmail.com"], ["srijanchhabra@gmail.com"], ["reshmasri_paddayya@srmuniv.edu.in"], ["arpita1996agarwal@gmail.com"], ["singhnilesh2397@gmail.com"], ["rungta.rachita@gmail.com"], ["pankhuriverma_rakesh@srmuniv.edu.in"], ["riyayaduka21@gmail.com"], ["hussainbadri786@gmail.com"], ["sanskritikhetpal03@gmail.com"], ["aishwaryajayaram09@gmail.com"], ["sarthakgoyaaal@gmail.com"], ["raunaksinha635@gmail.com"], ["chiraniaashwin@gmail.com"], ["nivedithamahabalshetti@gmail.com"], ["varunpks.cs14@rvce.edu.in"], ["chawlanitanya@gmail.com"], ["udithshankar@gmail.com"], ["m.omkarteja@gmail.com"], ["bhattershreyansh@gmail.com"], ["ganeshirekai@gmail.com"], ["prathibhashree9@gmail.com"], ["ramyadhananjayashetty@gmail.com"], ["shubham12421@gmail.com"], ["bhuvanaghegde@gmail.com"], ["jayanth.kumaraswamy05@gmail.com"], ["nshree360@gmail.com"], ["kavya.nagendra42@gmail.com"], ["vemuri.divya013@gmail.com"], ["sushmachippagiri1897@gmail.com"]];

    console.log(`useremail, doesExist, videoCount, publicVideoCount`);

    async.each(users, function(user, cb){
        db.collection('user').findOne({"email" : user[0].toString()}, function(err, result) {    
            if (err) {
                console.log("error while retrieving user", err);
                cb(err);
            }else if (result) {
                let useremail = result.email? result.email:"";
                let videoCount = result.videoCount? result.videoCount:0;
                let publicVideoCount = result.publicVideoCount? result.publicVideoCount:0 ;
                console.log(`${useremail}, yes, ${videoCount}, ${publicVideoCount}`);
                cb(null);
            } else{
                console.log(`${user[0].toString()}, no, NA, NA`);
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
 
}

getDataFromdb();
