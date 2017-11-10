/* =================================
===  LOGIN JS       ====
=================================== */
var LoginModalController = {
    tabsElementName: ".logmod__tabs li",
    tabElementName: ".logmod__tab",
    inputElementsName: ".logmod__form .input",
    hidePasswordName: ".hide-password",

    inputElements: null,
    tabsElement: null,
    tabElement: null,
    hidePassword: null,

    activeTab: null,
    tabSelection: 0, // 0 - first, 1 - second

    findElements: function () {
        var base = this;

        base.tabsElement = $(base.tabsElementName);
        base.tabElement = $(base.tabElementName);
        base.inputElements = $(base.inputElementsName);
        base.hidePassword = $(base.hidePasswordName);

        return base;
    },

    setState: function (state) {
      var base = this,
            elem = null;

        if (!state) {
            state = 0;
        }

        if (base.tabsElement) {
          elem = $(base.tabsElement[state]);
            elem.addClass("current");
            $("." + elem.attr("data-tabtar")).addClass("show");
        }

        return base;
    },

    getActiveTab: function () {
        var base = this;

        base.tabsElement.each(function (i, el) {
           if ($(el).hasClass("current")) {
               base.activeTab = $(el);
           }
        });

        return base;
    },

    addClickEvents: function () {
      var base = this;

        base.hidePassword.on("click", function (e) {
            var $this = $(this),
                $pwInput = $this.prev("input");

            if ($pwInput.attr("type") == "password") {
                $pwInput.attr("type", "text");
                $this.text("Hide");
            } else {
                $pwInput.attr("type", "password");
                $this.text("Show");
            }
        });

        base.tabsElement.on("click", function (e) {
            var targetTab = $(this).attr("data-tabtar");

            e.preventDefault();
            base.activeTab.removeClass("current");
            base.activeTab = $(this);
            base.activeTab.addClass("current");

            base.tabElement.each(function (i, el) {
                el = $(el);
                el.removeClass("show");
                if (el.hasClass(targetTab)) {
                    el.addClass("show");
                }
            });
        });

        base.inputElements.find("label").on("click", function (e) {
           var $this = $(this),
               $input = $this.next("input");

            $input.focus();
        });

        return base;
    },

    initialize: function () {
        var base = this;

        base.findElements().setState().getActiveTab().addClickEvents();
    }
};

$(document).ready(function() {
    LoginModalController.initialize();
});

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
===  STICKY NAV                 ====
=================================== */






/* NAVIGATION VISIBLE ON SCROLL */







/* =================================
===  FULL SCREEN HEADER         ====
=================================== */
