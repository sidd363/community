
/* =================================
===  WORD CLOUD TAG CANVAS       ====
=================================== */
window.onload = function() {
	 TagCanvas.textFont = 'Helvetica, Arial, sans-serif';
	 TagCanvas.textColour = 'white';
	 TagCanvas.textHeight = 15;
	 TagCanvas.outlineMethod = 'none';
	 TagCanvas.outlineColour = '#ea1c26';
	 TagCanvas.maxSpeed = 0.01;
	 TagCanvas.minBrightness = 0.2;
	 TagCanvas.depth = 0.92;
	 TagCanvas.pulsateTo = 0.6;
	 TagCanvas.initial = [0.2,0];
	 TagCanvas.decel = 0.98;
	 TagCanvas.reverse = false;
	 TagCanvas.hideTags = false;
	 TagCanvas.shadow = 'none';
	 TagCanvas.shadowBlur = 0;
	 TagCanvas.weight = false;
	 TagCanvas.imageScale = null;
	 TagCanvas.fadeIn = 1000;
	 TagCanvas.clickToFront = 600;
   TagCanvas.wheelZoom = false;
   TagCanvas.dragControl = false;
	 try {
	  TagCanvas.Start('tagcanvas','taglist', {shape: "vcylinder",lock: "y", offsetY: -200,});
	  f('options');
	 } catch(e) {
	  document.getElementById('cmsg').style.display='none';
	  document.getElementsByTagName('canvas')[0].style.border='0';

	 }
};

/* =================================
===  IE10 ON WINDOWS 8 FIX      ====
=================================== */
if (navigator.userAgent.match(/IEMobile\/10\.0/)) {
  var msViewportStyle = document.createElement('style')
  msViewportStyle.appendChild(
    document.createTextNode(
      '@-ms-viewport{width:auto!important}'
    )
  )
  document.querySelector('head').appendChild(msViewportStyle)
}
