//
// User device informations stored in this model.
//
module.exports = function(Device) {
  Device.adddevice = function(devicetoken,devicearn){
    var deviceObj = {
      "devicetoken":devicetoken,
      "devicearn":devicearn
    };
    this.findOrCreate({
      where:{
        "devicetoken":devicetoken
      }
    },deviceObj,function(err,data){

    })
  }
  Device.updatedevice = function(devicearn,newdevicearn,newtoken){
    this.findOne({
      where:{
        "devicearn":devicearn
      }
    },function(err,device){
      if(device){
        device.devicetoken=newtoken;
        device.devicearn= newdevicearn;
        device.save(function(err,saveddevice){
        })
      }
    })
  }
};
