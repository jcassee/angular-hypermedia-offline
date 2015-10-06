'use strict';

describe('OfflineContext', function () {
  beforeEach(module('hypermedia-offline'));

  var db, NetstatusStub;

  // Setup

  beforeEach(module(function ($provide) {
    db = new FakeDexie();
    $provide.value('Dexie', FakeDexieInstance);

    NetstatusStub = {offline: false};
    $provide.value('Netstatus', NetstatusStub);
  }));

  var $httpBackend, $q, $rootScope, OfflineContext, ResourceContext, context, resource;

  beforeEach(inject(function (_$httpBackend_, _$q_, _$rootScope_, _OfflineContext_, _ResourceContext_) {
    $httpBackend = _$httpBackend_;
    $q = _$q_;
    $rootScope = _$rootScope_;
    OfflineContext = _OfflineContext_;
    ResourceContext = _ResourceContext_;
    context = new OfflineContext();
    resource = context.get('http://example.com');
  }));


  describe('when online', function () {

    // Setup

    afterEach(function() {
      $httpBackend.verifyNoOutstandingExpectation();
      $httpBackend.verifyNoOutstandingRequest();
    });

    // Tests

    it('performs a HTTP GET request and stores the resource in the cache', function () {
      context.httpGet(resource);
      $httpBackend.expectGET(resource.$uri, {'Accept': 'application/json'})
        .respond('{"name": "John"}', {'Content-Type': 'application/json'});
      expect(OfflineContext.busyRequests).toBe(1);
      $httpBackend.flush();
      expect(OfflineContext.busyRequests).toBe(0);
      expect(resource.name).toBe('John');
      expect(db.resources.put).toHaveBeenCalledWith({data: resource, links: resource.$links}, resource.$uri);
    });

    it('performs a HTTP PUT request', function () {
      context.httpPut(resource);
      $httpBackend.expectPUT(resource.$uri, {},
        {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json'})
        .respond(204);
      expect(OfflineContext.busyRequests).toBe(1);
      $httpBackend.flush();
      expect(OfflineContext.busyRequests).toBe(0);
    });

    it('performs a HTTP DELETE request and removes the resource from the cache', function () {
      context.httpDelete(resource);
      $httpBackend.expectDELETE(resource.$uri).respond(204);
      expect(OfflineContext.busyRequests).toBe(1);
      $httpBackend.flush();
      expect(OfflineContext.busyRequests).toBe(0);
      expect(db.resources.delete).toHaveBeenCalledWith(resource.$uri);
    });

    it('performs a HTTP POST requests', function () {
      context.httpPost(resource, 'Test', {'Accept': '*/*', 'Content-Type': 'text/plain'});
      $httpBackend.expectPOST(resource.$uri, 'Test', {'Accept': '*/*', 'Content-Type': 'text/plain'}).respond(204);
      expect(OfflineContext.busyRequests).toBe(1);
      $httpBackend.flush();
      expect(OfflineContext.busyRequests).toBe(0);
    });

    it('stores the resource when a resource has been synchronized', function () {
      context.markSynced(resource, Date.now());
      expect(db.resources.put).toHaveBeenCalledWith({data: resource, links: resource.$links}, resource.$uri);
    });
  });


  describe('when offline', function () {

    // Setup

    beforeEach(function () {
      NetstatusStub.offline = true;
    });

    // Tests

    it('serves a HTTP GET request from the cache', function () {
      db.resources.get.and.returnValue($q.when({data: {name: 'John'}}));
      context.httpGet(resource);

      $rootScope.$apply();

      expect(resource.name).toBe('John');
    });

    it('stores a HTTP PUT request in the cache', function () {
      context.httpPut(resource);

      $rootScope.$apply();

      expect(db.resources.put).toHaveBeenCalledWith({data: resource, links: resource.$links}, resource.$uri);
      expect(db.requests.add).toHaveBeenCalledWith({method:'put', url: 'http://example.com', data: resource,
          headers: {'Content-Type': 'application/json'}});
      expect(OfflineContext.offlineRequests).toBe(1);
    });

    it('stores a HTTP DELETE request in the cache', function () {
      context.httpDelete(resource);

      $rootScope.$apply();

      expect(db.resources.delete).toHaveBeenCalledWith(resource.$uri);
      expect(db.requests.add).toHaveBeenCalledWith({method:'delete', url: 'http://example.com'});
      expect(OfflineContext.offlineRequests).toBe(1);
    });

    it('stores a HTTP POST request in the cache', function () {
      context.httpPost(resource, {name: 'John'}, {'X-Test': 'yes'});

      $rootScope.$apply();

      expect(db.requests.add).toHaveBeenCalledWith({method:'post', url: 'http://example.com', data: {name: 'John'},
          headers: {'X-Test': 'yes'}});
      expect(OfflineContext.offlineRequests).toBe(1);
    });
  });

  function FakeDexie() {
    this.version = function () {
      return {stores: function () {}};
    };
    this.on = function () {};
    this.open = function () {};
    this.transaction = function () {
      var callback = arguments[arguments.length - 1];
      return $q.when(callback());
    };
    this.resources = jasmine.createSpyObj('resources', ['get', 'put', 'delete']);
    this.requests = jasmine.createSpyObj('requests', ['add']);
    this.requests.add.and.callFake(function () {
      return $q.when();
    });
  }

  function FakeDexieInstance() {
    return db;
  }
});

describe('OfflineContextController', function() {
  beforeEach(module('hypermedia-offline'));

  var $scope, OfflineContext, controller;

  beforeEach(inject(function ($controller, _OfflineContext_) {
    OfflineContext = _OfflineContext_;
    $scope = {};
    controller = $controller('OfflineContextController', {$scope: $scope});
  }));

  it('sets $scope.context', function () {
    expect($scope.context).toBe(OfflineContext);
  });
});

