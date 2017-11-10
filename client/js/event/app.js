  'use strict';
  window.App = (function () {
      var _init, _appLoad = [];
      return {
          ngApp: angular.module("lbsEvent", ['ngRoute'])
          .config(function($routeProvider,$sceProvider){
            $routeProvider
            .when('/', {
              templateUrl: '/eventViews/main.html',
              controller: 'MainCtrl'
            });
            $sceProvider.enabled(false)
          }),
          init: function () {
              if (!_init) {
                  _init = true;
                  while(_appLoad.length != 0) _appLoad.splice(0, 1)[0](App.ngApp);
                      angular.bootstrap('body', ['lbsEvent']);
              }
          },
          onAppLoad: function (_fn) {
              _init && _fn(App.ngApp);
              !_init && _appLoad.push(_fn);
          },
          destroy:function(){
              $('#container').empty();
              _init=false;
          }
      }
  })();
  $().ready(function () {
      App.init();
  });
