'use strict';
App.onAppLoad(function (ngApp) {
  ngApp.controller('MainCtrl', [ '$scope', 'reviewsService',
    function ($scope, reviewsService) {
      //var dashBoardPromise=reviewsService.getData(location.origin + "/api/answers/dashboard");
      var dashBoardPromise=reviewsService.getData(location.origin + "/api/answers/dashboard");
      var activityDashBoardPromise = reviewsService.getData(location.origin + "/api/activities/dashboard");
      var notificationPromise = reviewsService.getData(location.origin + "/api/notifications/dashboard");
      dashBoardPromise.then(function(data){
        $scope.totalVideos=data.totalVideos;
        $scope.totalLikes=data.totalLikes;
        $scope.totalComments=data.totalComments;
        $scope.mostVideos=data.mostVideos;
        $scope.mostLiked=data.mostLiked;
        $scope.mostCommented=data.mostCommented;
      });
      activityDashBoardPromise.then(function(data){
        $scope.title = data.resourceInfo.title+": "+data.actorInfo.firstName;
        $scope.videoUrl = data.resourceInfo.shareUrl;
        $scope.coverImage = data.resourceInfo.coverImage;
        $scope.firstName = data.actorInfo.firstName;
        $scope.image_url = data.actorInfo.image_url;
        $scope.commentCount= data.resourceInfo.commentCount;
        $scope.likeCount=data.resourceInfo.likeCount;
        $scope.comment= data.comment||{};
        if($scope.comment && $scope.comment.comment.type=="videoComment"){
          $scope.comment.comment.message = $scope.comment.firstName+" left a video.";
        }else if($scope.comment && $scope.comment.comment.type=="Cloud"){
          $scope.comment.comment.message = $scope.comment.firstName+" described "+data.actorInfo.firstName+" in 5 words.";
        }
        $scope.$watch('videoUrl', function() {
          $("video").attr("src",$scope.videoUrl)
        });
        $(".videowrap").height($(".videowrap").width())
      })
      notificationPromise.then(function(data){
        $scope.notifications=data;
        setTimeout(function () {
          $.simpleTicker($("#ticker-roll"),{'effectType':'roll'});
        }, 1000);
      })
  }]);
});
