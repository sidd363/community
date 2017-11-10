
var path = require('path');
module.exports = function(options) {
  return function logError(err, req, res, next) {
    if(err){
        var errObj = JSON.parse(JSON.stringify(err));
        var statusCode = errObj.statusCode ? errObj.statusCode : 500;
        var contentType =  req.headers['content-type'];
        if( contentType == null || !contentType.includes("application/json")){
            console.log('contentType2',contentType,"statusCode2", statusCode, errObj);
            if(statusCode ==404){
                res.render(__dirname + '/pageNotFound.ejs');
            }else if(statusCode == 400 && errObj.code=="INVALID_TOKEN"){
                res.render( path.resolve(__dirname, "../views/errorAlreadyVerified.ejs"));
            }else {
                res.render(__dirname + '/serverError.ejs');
            }
        } else{
            errObj['message'] = err.message ? err.message : '';
            console.log('contentType4',contentType,"statusCode4", statusCode, err, errObj,err.message, errObj);
            res.status(statusCode).send({error: errObj});
            //next(err)
         }    
       }
                        };
            };
