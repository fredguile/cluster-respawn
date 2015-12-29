import path from 'path';
import clusterRespawnApi from '../index';
import debugLib from 'debug';
import 'source-map-support/register';

const debug = debugLib('cluster-respawn:example:master');

clusterRespawnApi
  .init({
    exec: path.resolve(__dirname, './worker.js'),
    childProcesses: 2,
    writePidFiles: true,
    enableReload: true,
    onMessage: function(msg) {
      debug(`Got IPC message from PID ${this.process.pid}: ${msg}`);
    }
  })
  .on('boot', () => debug('Cluster is starting'))
  .on('shutdown', () => debug('Cluster is stopping'))
  .on('respawn', () => debug('Cluster is respawning'))
  .boot();
