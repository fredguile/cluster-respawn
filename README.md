# cluster-respawn
My own cluster manager for node.js applications.

Despite there are already some cluster management modules on npmjs.com, I found it was a good exercice to write my own lib where I could put some handy features like: 

- my typical Makefile: it may look old school, but I get shorter commands to type and I can easily set up default environment variables for my preferred platforms (OSX and Windows). You can use make on Windows after installing the [right tools](http://scoop.sh/).

- workers reloading: I use this quite often during development. Just type "make reload" (it sends a signal to the master process to respawn all workers). You can easily set up a shortcut for that in your IDE, and you can programmatically bind the module API to any watcher for reloading on file change.

- master process events: to hook anything when the cluster is reloading or shutting down.

- workers messages: using the native feature of Node's processes.

## Installation and Usage

#### First steps

Type "make" to get an overview of the available commands. If you're checking the project, run "make build".

Or just run "make example" to try out the example snippet located in "src/example". You should get some debug statements describing the cluster activity. Try hitting CTRL-C or typing "make reload".

#### Usage

```js
import clusterRespawnApi from 'cluster-respawn';
```

Gives you a "per-process" singleton.

```js
clusterRespawnApi::init(options)
```

First off, you must call this from your master script, passing the [default Node's cluster options](https://nodejs.org/api/cluster.html#cluster_cluster_settings), and some additional ones:

- childProcesses: the amount of workers you want to (re-)spawn
- root: the root folder where Node is running (defaults to process.cwd())
- writePidFiles: true if you want to have PID files generated in the root folder (enable this to use "make reload")
- enableReload: true if you want to reload all workers when a SIGUSR2 is received by the master process (enable this to use "make reload")
- masterShutdownTimeout: the timeout in ms after which the master process is killed
- workerShutdownTimeout: the timeout in ms after which a shutting down worker is killed
- onMessage: a callback handling workers message, [see Node documentation](https://nodejs.org/api/cluster.html#cluster_event_message)

```js
clusterRespawnApi::boot()
```

Call this at last to boot your cluster. You can chain it to init().

```js
clusterRespawnApi::respawn(count)
```

Call this to respawn all workers. You can specify the amout of workers you want to respawn.

```js
clusterRespawnApi::shutdown()
```

Call this to shutdown the cluster.


#### Tests

Run "make test".

