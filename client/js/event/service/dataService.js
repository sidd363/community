App.onAppLoad(function (ngApp) {
    ngApp.factory('reviewsService', ['$http', '$q', function ($http, $q) {
        function getData(url) {
            return createHttpRequest('get', url).then(handleSuccess, handleError);
        }

        function getJsonpData(url) {
            if(url.indexOf('?')>1)
                url=url + "&callback=JSON_CALLBACK";
            else
                url=url + "?callback=JSON_CALLBACK";
            return createHttpRequest('jsonp', url).then(handleSuccess, handleError);
        }

        function sendData(url, data) {
            return createHttpRequest('post', url, data).then(handleSuccess, handleError);
        }

        function updateData(url, data) {
            return createHttpRequest('put', url, data).then(handleSuccess, handleError);
        }

        function deleteData(url) {
            return createHttpRequest('delete', url).then(handleSuccess, handleError);
        }

        function createHttpRequest(method, url, data) {
            return $http({
                method: method,
                url: url,
                data: data,
                timeout: 10000
            });
        }

        function handleError(response) {
            return handleSuccess(response);
        }

        function handleSuccess(response) {
            return response.data;
        }

        return({
            getData: getData,
            sendData: sendData,
            updateData: updateData,
            deleteData: deleteData,
            getJsonpData: getJsonpData
        });
    }]);
});
