/**
 * cluster-respawn
 *
 * Inspired by https://github.com/isaacs/cluster-master
 *
 * What we need:
 * - ES6 comprehensive code
 * - PID files generation
 * - respawn our workers
 *
 * What we don't necessarily need:
 * - REPL
 * - resizing the cluster
 */

 /*eslint no-process-exit: 0*/

import cluster from 'cluster';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {EventEmitter} from 'events';
import Promise, {promisifyAll} from 'bluebird';
import {defaults, mapValues, times} from 'lodash';
import invariant from 'invariant';
import debugLib from 'debug';

promisifyAll(fs);

const defaultOptions = {
  root: process.cwd(),
  childProcesses: 1,
  masterShutdownTimeout: 2500,
  workerShutdownTimeout: 2500
};

const debug = (message, data) => {
  const namespace = 'cluster-respawn:api';

  debugLib(namespace)(message);
  if(data) {
    debugLib(namespace)(data);
  }
};

export default class ClusterRespawnApi extends EventEmitter {
  init(options) {
    invariant(cluster.isMaster, 'must be run from a master script');

    this.options = defaults({}, options, defaultOptions);

    setupMaster(this, this.options, this.shutdown, this.respawn);
    setupWorkers(this, this.options, this.boot);

    if(this.options.writePidFiles) {
      writePidFile(this.options.root, 'master', process.pid)
        .then(filename => debug(`wrote ${filename}`))
        .catch(err => console.log(err));
    }

    return this;
  }

  boot(count, options) {
    options || (options = this.options);
    count || (count = options.childProcesses);

    invariant(cluster.isMaster, 'must be run from a master script');
    invariant(count && count > 0 || options && options.childProcesses, 'undefined number of workers to respawn');

    debug(`Booting ${count} child process(es)`, {workers: workersSummary()});
    this.emit('boot');
    times(count, cluster.fork, cluster);
  }

  respawn(count, options) {
    options || (options = this.options);
    count || (count = options.childProcesses);

    invariant(cluster.isMaster, 'must be run from a master script');
    invariant(count && count > 0 || options && options.childProcesses, 'undefined number of workers to respawn');

    const keys = Object.keys(cluster.workers), workersCount = keys.length;

    debug(`Respawning ${count} child process(es)`, {workers: workersSummary()});
    keys.forEach((key, id) => {
      const w = cluster.workers[key];

      if(!w || !w.process.connected) return;

      if(id === workersCount - 1) { // our last worker
        w.on('disconnect', () => {
          debug('All workers disconnected. Forking new ones...');
          this.emit('respawn');
          times(count, cluster.fork, cluster);
        });
      }

      const timer = setTimeout(() => {
        if(w && w.process) {
          debug(`Timeout: killing worker ${w.id}`);
          w.process.kill('SIGKILL');
        }
      }, options.workerShutdownTimeout);
      timer.unref();

      debug(`Disconnecting pid ${w.process.pid}`, {workers: workersSummary()});
      w.disconnect();
    });
  }

  shutdown(options) {
    invariant(cluster.isMaster, 'Must be run from a master script');

    options || (options = this.options);

    const timer = setTimeout(() => {
      debug('Timeout: exiting main process');
      process.exit(0);
    }, options.masterShutdownTimeout);
    timer.unref();

    const shutdownTasks = [];

    if(options.writePidFiles) {
      shutdownTasks.push(removePidFiles(options.root, /master\.pid/));
    }

    Promise
      .all(shutdownTasks)
      .then(() => {
        debug('Shutting down cluster', {workers: workersSummary()});
        cluster.disconnect(() => {
          debug('All workers exited. Emitting shutdown', {workers: workersSummary()});
          this.emit('shutdown');
        });
      })
      .catch(err => console.log(err));
  }
}

function setupMaster(clusterRespawn, options, shutdown, respawn) {
  cluster.setupMaster(options);

  cluster.on('listening', (worker, address) => {
    debug(`Worker ${worker.id} listening on port ${address.port}`, {workers: workersSummary()});
  });

  if(os.platform() === 'win32') {
    process.on('SIGHUP', shutdown.bind(clusterRespawn, options));
    process.on('SIGBREAK', shutdown.bind(clusterRespawn, options));
  }
  else {  // *nix platforms
    process.on('SIGTERM', shutdown.bind(clusterRespawn, options));

    if(options.enableReload) {
      process.on('SIGUSR2', respawn.bind(clusterRespawn, null, options));
    }
  }

  // all platforms
  process.on('SIGINT', shutdown.bind(clusterRespawn, options));
}

function setupWorkers(clusterRespawn, options, boot) {
  invariant(options.root, 'options missing root property');
  invariant(options.childProcesses, 'options missing childProcesses property');
  invariant(options.workerShutdownTimeout, 'options missing workerShutdownTimeout property');

  cluster.on('fork', worker => {
    if(options.writePidFiles) {
      writePidFile(options.root, `worker-${worker.id}`, worker.process.pid)
        .then(filename => debug(`wrote ${filename}`))
        .catch(err => console.log(err));
    }

    if(options.onMessage) {
      worker.on('message', options.onMessage);
    }

    worker.on('disconnect', () => {
      debug(`Worker ${worker.process.pid} was disconnected`, {workers: workersSummary()});

      if(options.writePidFiles) {
        removePidFiles(options.root, new RegExp(`worker-${worker.id}\.pid`));
      }

      const timer = setTimeout(() => {
        const w = cluster.workers[worker.id];
        if(w && w.process) {
          debug(`Timeout: killing worker ${w.id} because still alive`);
          w.process.kill('SIGKILL');
        }
      }, options.workerShutdownTimeout);

      timer.unref();
    });

    worker.on('exit', (code, signal) => {
      if(signal) {
        debug(`Worker ${worker.process.pid} was killed by signal "${signal}"`, {workers: workersSummary()});
      }
      else if(code) {
        debug(`Worker ${worker.process.pid} exited with code ${code}`, {workers: workersSummary()});
      }
      else {
        debug(`Worker ${worker.process.pid} exited`, {workers: workersSummary()});
      }

      if(!worker.suicide) {
        debug(`Worker ${worker.id} exited abnormally`, {workers: workersSummary()});

        setTimeout(() => {
          const workersCount = Object.keys(cluster.workers).length;
          const missingWorkers = options.childProcesses - workersCount;

          debug(`Recovering ${missingWorkers} worker(s)...`, {workers: workersSummary()});
          boot.call(clusterRespawn, missingWorkers, options);
        }, options.workerShutdownTimeout);
      }
    });
  });
}

function workersSummary() { return mapValues(cluster.workers, worker => worker.process.pid); };

function writePidFile(dir, name, pid) {
  const filename = `${name}.pid`;
  const file = path.resolve(dir, filename);
  return fs
    .writeFileAsync(file, pid, 'ascii')
    .then(() => filename);
}

function removePidFiles(dir, pattern = /.+\.pid/) {
  return fs
    .readdirAsync(dir)
    .filter(filename => filename.match(pattern))
    .mapSeries(filename => {
      debug(`removing ${filename}`);
      return fs
        .unlinkAsync(path.resolve(dir, filename))
        .then(() => filename);
    });
}
