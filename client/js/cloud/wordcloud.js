var userid = getParameterByName("userid");
var relation = getParameterByName("relation");
  window._ajax.get(location.origin + "/api/personality/" + userid + "/relation/" + relation, null, function(data) {
  console.log("data==", JSON.parse(data))
  var personality = JSON.parse(data);
  var tags = personality.wordcloud;
  var img = new Image();
  var $canvas = $('#canvas');
  var $htmlCanvas = $('#my_canvas');
  var $dim=54;
  var list = [];
  if(tags && tags.length){
  for(var index in tags){
    var tag = tags[index];
    var listObj=[];
    listObj[0]=tag.word;
    listObj[1]=tag.frequency;
    list.push(listObj);
  }
  var newList = [];
  var totalWeight = 0;
  for(var index in list){
    var item = list[index];
    var word = item[0];
    var weight = item[1];
    if(weight>1){
      word=word.toUpperCase()
    }
    if(weight==1){
      weight=weight*3.5;
    }else if(weight==2){
      weight=weight*2;
    }else if(weight==3){
      weight=weight*5/3;
    }else if(weight==4){
      weight=weight*1.5;
    }else if(weight==5){
      weight=weight*7/5;
    }else{
      weight=7+(weight-6)*.33;
    }
    var adjFactor=0;
    if(word.length>=9){
      adjFactor = (word.length-9)*.09;
    }
    weight=weight - adjFactor;
    weight = Math.pow(weight, 1.5) ;
    totalWeight+=weight;
    console.log(weight);
    item[0]=word;
    item[1]=weight;
    newList.push(item);
  }
  var url = "/images/shrofile_mask.jpg";
    img.crossOrigin = "anonymous";
    img.src = url;
    img.onload = function readPixels() {

    window.URL.revokeObjectURL(url);

    maskCanvas = document.createElement('canvas');
    maskCanvas.width = img.width;
    maskCanvas.height = img.height;

    var ctx = maskCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);

    var imageData = ctx.getImageData(
    0, 0, maskCanvas.width, maskCanvas.height);
    var newImageData = ctx.createImageData(imageData);

    for (var i = 0; i < imageData.data.length; i += 4) {
      var tone = imageData.data[i] +
        imageData.data[i + 1] +
        imageData.data[i + 2];
      var alpha = imageData.data[i + 3];

      if (alpha < 128 || tone > 128 * 3) {
        // Area not to draw
        newImageData.data[i] =
          newImageData.data[i + 1] =
          newImageData.data[i + 2] = 255;
        newImageData.data[i + 3] = 0;
      } else {
        // Area to draw
        newImageData.data[i] =
          newImageData.data[i + 1] =
          newImageData.data[i + 2] = 0;
        newImageData.data[i + 3] = 255;
      }
    }

    ctx.putImageData(newImageData, 0, 0);
    if (maskCanvas) {
      var bctx = document.createElement('canvas').getContext('2d');
      bctx.fillStyle =  '#fff';
      bctx.fillRect(0, 0, 1, 1);
      var bgPixel = bctx.getImageData(0, 0, 1, 1).data;
      var maskCanvasScaled =
        document.createElement('canvas');
      maskCanvasScaled.width = $canvas[0].width;
      maskCanvasScaled.height = $canvas[0].height;
      var ctx = maskCanvasScaled.getContext('2d');
      ctx.drawImage(maskCanvas,
        0, 0, maskCanvas.width, maskCanvas.height,
        0, 0, maskCanvasScaled.width, maskCanvasScaled.height);
      var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      var newImageData = ctx.createImageData(imageData);
      for (var i = 0; i < imageData.data.length; i += 4) {
        if (imageData.data[i + 3] > 128) {
          newImageData.data[i] = bgPixel[0];
          newImageData.data[i + 1] = bgPixel[1];
          newImageData.data[i + 2] = bgPixel[2];
          newImageData.data[i + 3] = bgPixel[3];
        } else {
          // This color must not be the same w/ the bgPixel.
          newImageData.data[i] = bgPixel[0];
          newImageData.data[i + 1] = bgPixel[1];
          newImageData.data[i + 2] = bgPixel[2];
          newImageData.data[i + 3] = bgPixel[3] ? (bgPixel[3] - 1) : 0;
        }
      }

      ctx.putImageData(newImageData, 0, 0);

      ctx = $canvas[0].getContext('2d');
      ctx.drawImage(maskCanvasScaled, 0, 0);
      var wordCloud=WordCloud([$canvas[0]], { list: list,
      color: function (word, weight) {
        var colorArr=["#ec1c24","#f56d44","#19a488","#a0b723","#26abd1","#8e7cc3","#ea4e23","#dfc72b"]
        return colorArr[Math.floor(Math.random() * colorArr.length)];
      },
      shape:"diamond",
      fontWeight:"bold",
      gridSize: Math.round(16 * $('#canvas').width() / 1024),
      minRotation:Math.PI / 10,
      maxRotation:Math.PI / 10,
      rotateRatio:1,
      minFontSize:3,
      clearCanvas:false,
      totalWeight:totalWeight
     } );

     document.addEventListener('wordcloudstop', function(e){
       var thumbImg = document.createElement('img');
       thumbImg.crossOrigin= "anonymous";
       if(personality.image_url.indexOf("?")>0){
         thumbImg.src = personality.image_url+"&cacheBust="+Math.random();
       }else{
          thumbImg.src = personality.image_url+"?cacheBust="+Math.random();
       }
       thumbImg.width="108";
       thumbImg.height="108";
       thumbImg.onload = function() {
           ctx.beginPath();
           ctx.arc($canvas[0].width/2, $canvas[0].height/2, 2 * $dim, 0, Math.PI*2, true);
           ctx.closePath();
           ctx.clip();

           ctx.drawImage(thumbImg, $canvas[0].width/2-108, $canvas[0].height/2-108, 4 * $dim, 4 * $dim);

           ctx.beginPath();
           ctx.arc($canvas[0].width/2, $canvas[0].height/2, 2 * $dim, 0, Math.PI*2, true);
           ctx.lineWidth = 10;
           ctx.strokeStyle = '#ec1c24';
           ctx.stroke();
           ctx.clip();
           ctx.closePath();
           ctx.restore();
       };
       }, false);

    }
  };
}else{
  document.getElementById("my_canvas").innerHTML +="<img src='/images/emptycloud.png' style='margin:0 auto;display:block;' />"
  document.getElementById("canvas").style.display="none";
}
  }, true);

function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[\[\]]/g, "\\$&");
  var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
    results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}
