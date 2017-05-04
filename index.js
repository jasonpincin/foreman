'use strict';
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const vm = require('vm');
const createHash = require('./lib/hash');
const connectionManager = require('./lib/connection-manager');
const createScript = require('./lib/script');
const createScriptInterface = require('./lib/script-interface');
const UnknownLabelError = require('./errors').UnknownLabelError;

/* terminology
 * connection - connection to another system such as rabbit
 * script - code supplied to foreman to give it capabilities
 * label - scripts target labels for input/output
 */

module.exports = function createForeman (options) {
    return new Foreman(options);
};

function Foreman (options) {
    options = options || {};

    Object.assign(this, {
        // private state
        _connections: connectionManager(),
        _scripts: new Map(),
        _labels: new Map()
    });

    EventEmitter.call(this);
}
inherits(Foreman, EventEmitter);
Object.assign(Foreman.prototype, {
    // config api
    start,
    stop,
    configure,
    setConfigServer,
    // label api
    label,
    allLabels,
    defineLabel,
    undefineLabel,
    // script api
    script,
    allScripts,
    registerScript,
    unregisterScript,
    enableAllScripts,
    disableAllScripts
});

function start () {

}

function stop () {

}

function setConfigServer () {

}

function label (hash) {
    let label = this._labels.get(hash);
    if (!label) {
        let err = new InvalidLabelError('Invalid label hash: ' + hash);
        throw err;
    }
}

function allLabels () {
    return Array.from(this._labels.values());
}

function defineLabel (p, uri, options) {
    let hash = createHash(p);
    let pattern = new RegExp(p);
    let label = {
        hash: hash,
        pattern: pattern,
        uri: uri,
        options: options
    };

    if (this._labels.has(hash)) {
        this.emit('label-replace', {
            current: this._labels.get(hash),
            replacement: label
        })
    }
    this._labels.set(hash, label);

    return this;
}

function undefineLabel (hashOrNameOrLabel) {
    if (!hashOrNameOrLabel) {
        return this;
    }
    if (hashOrNameOrLabel.hash) {
        this._labels.delete(hashOrNameOrLabel.hash);
        return this;
    }
    if (this._labels.has(hashOrNameOrLabel)) {
        this._labels.delete(hashOrNameOrLabel);
        return this;
    }
    let hash = createHash(hashOrNameOrLabel);
    this._labels.delete(hash);
    return this;
}

function undefineAllLabels () {
    this._labels.clear();
}

function script (hash) {
    let script = this._scripts.get(hash);
    if (!script) {
        let err = new InvalidScriptError('Invalid script hash: ' + hash);
        throw err;
    }
}

function allScripts () {
    return Array.from(this._scripts.values());
}

function registerScript (code) {
    const iface = createScriptInterface(this);
    const script = createScript(iface, code);
    if (!this._scripts.has(script.hash)) {
        this._scripts.set(script.hash, script);
    }
    return this._scripts.get(script.hash);
}

function unregisterScript (hashOrScript) {
    const self = this;
    return new Promise (unregisterPromise);

    function unregisterPromise (resolve, reject) {
        let script = typeof hashOrScript === 'object'
            ? hashOrScript
            : self.getScript(hashOrScript);
        return script.stop().then(del);

        function del () {
            self._scripts.delete(script.hash);
        }
    }
}

function unregisterAllScripts () {
    for (let hash of this._scripts.keys()) {
        this.unregister(hash);
    }
}

function enableAllScripts () {
    let started = this.allScripts().map(start);
    return Promise.all(started);

    function start (script) {
        return script.run();
    }
}

function disableAllScripts () {
    let stopped = this.allScripts().map(stop);
    return Promise.all(stopped);

    function stop (script) {
        return script.exit();
    }
}

function configure (conf) {
    let cfg = Object.assign({
        labels: [],
        scripts: []
    }, conf);

    // labels
    let existingLabels = this.allLabels().map(getHash);
    let cfgLabelsByHash = cfg.labels.reduce(labelByHash, {});
    let cfgLabels = Object.keys(cfgLabelsByHash);

    // scripts
    let existingScripts = this.allScripts().map(getHash);
    let cfgScriptsByHash = cfg.scripts.reduce(codeByHash, {});
    let cfgScripts = Object.keys(cfgScriptsByHash);

    // 1. handle removed scripts
    for (let existingScript of existingScripts) {
        if (cfgScripts.indexOf(existingScript) === -1) {
            this.unregisterScript(existingScript);
        }
    }

    // 2. handle removed labels
    for (let existingLabel of existingLabels) {
        if (cfgLabels.indexOf(existingLabel) === -1) {
            this.undefineLabel(existingLabel);
        }
    }

    // 3. handle new labels
    for (let cfgLabel of cfgLabels) {
        if (existingLabels.indexOf(cfgLabel) === -1) {
            let label = cfgLabelsByHash[cfgLabel];
            this.defineLabel(label.pattern, label.uri, label.options)
        }
    }

    // 4. handle new scripts
    for (let cfgScript of cfgScripts) {
        if (existingScripts.indexOf(cfgScript) === -1) {
            this.registerScript(cfgScriptsByHash[cfgScript]);
        }
    }
}

function getHash (obj) {
    return obj.hash;
}

function codeByHash (obj, code) {
    obj[createHash(code)] = code;
    return obj;
}

function labelByHash (obj, label) {
    obj[createHash(label.pattern)] = label;
    return obj;
}
