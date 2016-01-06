import fs from 'fs';
import cluster from 'cluster';
import {EventEmitter} from 'events';
import {promisifyAll} from 'bluebird';
import {describe, it, beforeEach, afterEach} from 'mocha';
import {expect} from 'chai';
import sinon from 'sinon';
import sinonStubPromise from 'sinon-stub-promise';

import clusterRespawnApi from '../src/index';

promisifyAll(fs);
sinonStubPromise(sinon);

describe('ClusterRespawnApi', () => {
  const stubs = {};

  beforeEach(() => {
    // always reset cluster to behave as master script
    cluster.isMaster = true;

    // stub methods
    stubs.setupMaster = sinon.stub(cluster, 'setupMaster');
    stubs.fork = sinon.stub(cluster, 'fork');
    stubs.disconnect = sinon.stub(cluster, 'disconnect');
    stubs.writeFileAsync = sinon.stub(fs, 'writeFileAsync').returnsPromise();

    // stub 1 fake worker
    cluster.workers = {};
    cluster.workers['0'] = new EventEmitter();
    cluster.workers['0'].process = {connected: true};
    cluster.workers['0'].kill = sinon.spy();
    cluster.workers['0'].disconnect = sinon.spy();
  });

  describe('#init()', () => {
    it('doesn\'t throw from the master process', () => {
      expect(() => clusterRespawnApi.init()).to.not.throw();
    });

    it('throws from a worker', () => {
      cluster.isMaster = false;
      expect(() => clusterRespawnApi.init()).to.throw();
    });

    it('calls cluster.setupMaster()', () => {
      clusterRespawnApi.init();
      expect(stubs.setupMaster.calledOnce).to.be.true;
    });

    it('write pid files', () => {
      clusterRespawnApi.init({writePidFiles: true});
      expect(stubs.writeFileAsync.calledOnce).to.be.true;
    });
  });

  describe('#boot()', () => {
    it('doesn\'t throw from the master process', () => {
      expect(() => clusterRespawnApi.boot()).to.not.throw();
    });

    it('throws from a worker', () => {
      cluster.isMaster = false;
      expect(() => clusterRespawnApi.boot()).to.throw();
    });

    it('calls cluster.fork()', () => {
      clusterRespawnApi.init({childProcesses: 3}).boot();
      expect(stubs.fork.calledThrice).to.be.true;
    });

    it('emits a boot event', () => {
      const spy = sinon.spy();
      clusterRespawnApi.on('boot', spy);
      clusterRespawnApi.boot();

      setTimeout(() => expect(spy.called).to.be.true, 50);
    });
  });

  describe('#respawn()', () => {
    it('doesn\'t throw from the master process', () => {
      expect(() => clusterRespawnApi.respawn()).to.not.throw();
    });

    it('throws from a worker', () => {
      cluster.isMaster = false;
      expect(() => clusterRespawnApi.respawn()).to.throw();
    });

    it('calls disconnect on active workers', () => {
      clusterRespawnApi.respawn();

      const keys = Object.keys(cluster.workers);
      keys.forEach(key => {
        const worker = cluster.workers[key];
        expect(worker.disconnect.called).to.be.true;
      });
    });

    it('emits a respawn event', () => {
      const spy = sinon.spy();
      clusterRespawnApi.on('respawn', spy);
      clusterRespawnApi.respawn();

      setTimeout(() => expect(spy.called).to.be.true, 50);
    });
  });

  describe('#shutdown()', () => {
    it('doesn\'t throw from the master process', () => {
      expect(() => clusterRespawnApi.shutdown()).to.not.throw();
    });

    it('throws from a worker', () => {
      cluster.isMaster = false;
      expect(() => clusterRespawnApi.shutdown()).to.throw();
    });

    it('calls cluster.disconnect()', () => {
      clusterRespawnApi.shutdown();

      setTimeout(() => expect(stubs.disconnect.called).to.be.true, 50);
    });

    it('emits a shutdown event', () => {
      const spy = sinon.spy();
      clusterRespawnApi.on('shutdown', spy);
      clusterRespawnApi.shutdown();

      setTimeout(() => expect(spy.called).to.be.true, 50);
    });
  });

  afterEach(() => {
    stubs.setupMaster.restore();
    stubs.fork.restore();
    stubs.disconnect.restore();
    stubs.writeFileAsync.restore();
    cluster.workers = {};
  });
});
