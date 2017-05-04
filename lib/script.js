'use strict';
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const vm = require('vm');
const sha1 = require('sha1');
const hash = require('./hash');
const createSandbox = require('./sandbox');
const pipeline = require('./pipeline');

module.exports = function createScript (foreman, code) {
    return new Script(foreman, code);
}

function Script (foreman, code) {
    const script = this;
    let running = false;
    let sandbox;

    Object.assign(this, {
        hash: hash(code),
        run,
        exit,
        stop: exit,
        isRunning,
        // private
        _getSandbox,
        _pipelines: new Set()
    });

    EventEmitter.call(this);

    function run () {
        if (running) {
            return Promise.resolve();
        }
        running = true;
        script.emit('run');
        sandbox = createSandbox();
        try {
            const runner = vm.runInNewContext(code, sandbox.root, {
                timeout: 1000 // 1 second timeout for setup
            });
            runner({
                pump,
                exit
            });
            return Promise.resolve();
        }
        catch (err) {
            running = false;
            sandbox.destroy();
            return Promise.reject(err);
        }
    }

    function exit () {
        if (!running) {
            return Promise.resolve();
        }
        script._pipelines.forEach(stopPipeline);
        return sandbox.destroy().then(emitExit);

        function stopPipeline (pipe) {
            pipe.stop();
        }

        function emitExit () {
            script.emit('exit');
        }
    }

    function isRunning () {
        return running;
    }

    function _getSandbox () {
        return running ? sandbox : undefined;
    }

    // not exposed via script api, exposed to actual script only
    function pump (label) {
        let pipe = pipeline(foreman).from(label);
        script._pipelines.add(pipe);
        pipe.once('stop', removePipe);
        return pipe;

        function removePipe () {
            script._pipelines.delete(pipe);
        }
    }
}
inherits(Script, EventEmitter);
