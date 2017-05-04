'use strict';

const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;

module.exports = function makeSandbox () {
    return new Sandbox();
}

function Sandbox () {
    const module = { exports: {} };
    let exports = module.exports;

    // the root object for the VM
    this.root = {
        module: module,
        exports: exports,
        setTimeout: sbSetTimeout,
        clearTimeout: sbClearTimeout,
        console: console
    };

    // private stuff
    this._destroyed = false;
    this._timers = new Set();
    this._intervals = new Set();
    this._immediates = new Set();

    EventEmitter.call(this);
}
inherits(Sandbox, EventEmitter);
Object.assign(Sandbox.prototype, {
    destroy: destroy,
    setTimeout: sbSetTimeout,
    clearTimeout: sbClearTimeout
});

function destroy () {
    this._destroyed = true;
    try {
        this._timers.forEach(i => sbClearTimeout(i));
        this._intervals.forEach(i => sbClearInterval(i));
        this._immediates.forEach(i => sbClearImmediate(i));
        return Promise.resolve();
    }
    catch (err) {
        return Promise.reject(err);
    }
}

function sbSetTimeout (cb, delay) {
    if (this._destroyed) {
        return;
    }
    var args = Array.prototype.slice.call(arguments, 2);
    let timer = setTimeout(() => {
        cb.apply(undefined, args);
        this._timers.delete(timer);
    }, delay);
    this._timers.add(timer);
    return timer;
}

function sbClearTimeout (timer) {
    clearTimeout(timer);
    this._timers.delete(timer);
}
