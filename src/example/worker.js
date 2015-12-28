import debugLib from 'debug';

const debug = debugLib('cluster-respawn:example:worker');

debug(`Worker process running with PID ${process.pid}`);

process.send('Hello cluster!');
