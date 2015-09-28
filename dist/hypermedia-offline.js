'use strict';

/**
 * @ngdoc module
 * @name halresource
 * @description
 *
 * This module contains classes and services to work with offline-first
 * applications based on hypermedia APIs.
 */
angular.module('hypermedia-offline', ['hypermedia', 'netstatus'])

  /**
   * @ngdoc type
   * @name OfflineContext
   * @description
   *
   * Offline-capable resource context.
   *
   * @see ResourceContext
   */
  .factory('OfflineContext', ['$http', '$log', '$q', '$rootScope', 'ResourceContext', 'Netstatus',
      function ($http, $log, $q, $rootScope, ResourceContext, Netstatus) {

    var db = new Dexie('offlinecache');

    db.version(1).stores({
      resources: "",
      requests: "++,[url+method]"
    });

    db.on('error', function (msg) {
      $log.error('OfflineContext: ' + msg);
      $rootScope.$broadcast('offlinecache:error', msg);
    });
    db.on('blocked', function () {
      $log.warn('OfflineContext: database is blocked');
      $rootScope.$broadcast('offlinecache:blocked');
    });

    db.open();


    var offlineRequests = null;

    db.on("ready", function () {
      return db.requests.count(function (count) {
        $rootScope.$apply(function () {
          offlineRequests = count;
        });
      });
    });


    /**
     * Offline-capable resource context.
     *
     * @constructor
     * @param {ResourceFactory} [resourceFactory]
     */
    function OfflineContext(resourceFactory) {
      ResourceContext.call(this, resourceFactory);
    }

    OfflineContext.prototype = Object.create(ResourceContext.prototype, {
      constructor: {value: OfflineContext},

      /**
       * Perform a HTTP GET request on a resource.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpGet: {value: function (resource) {
        var self = this;
        if (Netstatus.offline) {
          return $q(function (resolve, reject) {
            return db.resources.get(resource.$uri).then(function (item) {
              if (item) {
                resource.$update(item.data, item.links);
                return ResourceContext.prototype.markSynced.call(self, resource, Date.now());
              }
            }).then(function () {
              resolve(resource);
            }).catch(function (error) {
              reject(error);
            });
          });
        } else {
          return ResourceContext.prototype.httpGet.call(this, resource);
        }
      }},

      /**
       * Perform a HTTP PUT request with the resource state.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpPut: {value: function (resource) {
        if (Netstatus.offline) {
          return $q(function (resolve, reject) {
            return db.transaction('rw', db.resources, db.requests, function () {
              db.requests.add(resource.$putRequest());
              db.resources.put({data: resource, links: resource.$links}, resource.$uri);
            }).then(function () {
              $rootScope.$apply(function () { offlineRequests += 1; });
              resolve(resource);
            }).catch(function (error) {
              reject(error);
            });
          });
        } else {
          return ResourceContext.prototype.httpPut.call(this, resource);
        }
      }},

      /**
       * Perform a HTTP DELETE request and mark the resource as unsychronized.
       *
       * @function
       * @param {HalResource} resource
       * @returns a promise that is resolved to the resource
       */
      httpDelete: {value: function (resource) {
        if (Netstatus.offline) {
          return $q(function (resolve, reject) {
            return db.transaction('rw', db.resources, db.requests, function () {
              db.requests.add(resource.$deleteRequest());
              db.resources.delete(resource.$uri);
            }).then(function () {
              $rootScope.$apply(function () { offlineRequests += 1; });
              resolve(resource);
            }).catch(function (error) {
              reject(error);
            });
          });
        } else {
          return ResourceContext.prototype.httpDelete.call(this, resource);
        }
      }},

      /**
       * Perform a HTTP POST request.
       *
       * @function
       * @param {HalResource} resource
       * @param {*} data request body
       * @param {object} [headers] request headers
       * @param {ConfigHttp} [callback] a function that changes the $http request config
       * @returns a promise that is resolved to the resource
       */
      httpPost: {value: function (resource, data, headers, callback) {
        if (Netstatus.offline) {
          return $q(function (resolve, reject) {
            return db.requests.add(resource.$postRequest(data, headers, callback)).then(function () {
              $rootScope.$apply(function () { offlineRequests += 1; });
              resolve(resource);
            }).catch(function (error) {
              reject(error);
            });
          });
        } else {
          return ResourceContext.prototype.httpPost.call(this, resource, data, headers, callback);
        }
      }},

      /**
       * Mark a resource as synchronized with the server and save it for offline use.
       *
       * @function
       * @param {Resource|Resource[]} resources
       * @param {number} syncTime the timestamp of the last synchronization
       * @returns a promise that is resolved to the resource
       */
      markSynced: {value: function (resources, syncTime) {
        resources = angular.isArray(resources) ? resources : [resources];

        return $q(function (resolve, reject) {
          return db.transaction('rw', db.resources, function () {
            resources.forEach(function (resource) {
              if (syncTime) {
                db.resources.put({data: resource, links: resource.$links}, resource.$uri);
              } else {
                db.resources.delete(resource.$uri);
              }
            });
            resolve();
          }).catch(function (error) {
            reject(error);
          });
        }).then(function () {
          return ResourceContext.prototype.markSynced.call(this, resources, syncTime);
        });
      }}
    });

    // Class properties
    Object.defineProperties(OfflineContext, {

      /**
       * The number of current HTTP requests.
       *
       * @property {number}
       */
      busyRequests: {get: function () {
        return ResourceContext.busyRequests;
      }},

      /**
       * The number of stored offline HTTP requests.
       *
       * @property {number}
       */
      offlineRequests: {get: function () {
        return offlineRequests;
      }},

      /**
       * The stored offline POST requests for a resource.
       *
       * @property {object[]}
       */
      getOfflinePosts: {value: function (resource) {
        return $q(function (resolve, reject) {
          return db.requests.where('[url+method]').equals([resource.$uri, 'post']).toArray().then(function (requests) {
            resolve(requests);
          }).catch(function (error) {
            reject(error);
          });
        });
      }},

      /**
       * The function to call for replaying offline requests after coming
       * online again.
       *
       * @property {ReplayOfflineRequests}
       */
      replayRequests: {value: defaultReplayRequests, writable: true}
    });

    function getAndClearOfflineRequests() {
      return $q(function (resolve, reject) {
        return db.transaction('rw', db.requests, function () {
          var requests;
          return db.requests.toArray(function (array) {
            requests = array;
            return db.requests.clear();
          }).then(function () {
            $rootScope.$apply(function () { offlineRequests = 0; });
            resolve(requests);
          }).catch(function (error) {
            reject(error);
          });
        });
      });
    }

    /**
     * A callback function used by the offline context replay offline requests
     * after coming back online.
     *
     * @callback ReplayOfflineRequests
     * @param {object[]} requests an array of $http config objects
     * @returns {Promise} a promise that is resolved after all requests have
     *                    been replayed
     */

    function defaultReplayRequests(requests) {
      var promise = $q.when();
      requests.forEach(function (request) {
        promise = promise.then(function () {
          return $http(request);
        });
      });
      promise = promise.catch(function (response) {
        $log.error(response);
        return $q.reject(response);
      });
      return promise;
    }

    // Automatically replay requests after coming online
    $rootScope.$on('netstatus', function (event, status) {
      if (status !== 'online') return;
      return getAndClearOfflineRequests().then(OfflineContext.replayRequests);
    });

    return OfflineContext;
  }])

  /**
   * @ngdoc controller
   * @name offlinehalcontext.controller:OfflineHalContextController
   * @description
   *
   * Controller that sets the {@link Netstatus} service on the scope.
   */
  .controller('OfflineContextController', function ($scope, OfflineContext) {
    $scope.context = OfflineContext;
  })

;

/**
 * A hypermedia resource.
 *
 * @typedef {object} Resource
 */

/**
 * A HAL resource.
 *
 * @typedef {object} HalResource
 */

/**
 * A callback function used to change a $http config object.
 *
 * @callback ConfigHttp
 * @param {object} config the $http config object
 * @returns {object} the $http config object
 */

/**
 * A callback function used by the context to create resources. Will be called
 * with the 'new' operator, so can be a constructor.
 *
 * @callback ResourceFactory
 * @returns {Resource} the created resource
 * @see ResourceContext
 */
