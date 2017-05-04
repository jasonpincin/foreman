'use strict';
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const urlParse = require('url').parse;
const amqpProvider = require('./amqp-provider.js');
const UnknownProtocolError = require('../errors').UnknownProtocolError;

module.exports = function createConnectionManager (foreman) {
    return new ForemanConnectionManager(foreman);
}

function ForemanConnectionManager (foreman) {
    const amqp = amqpProvider;

    Object.assign(this, {
        _foreman: foreman,
        _labels: new Map(),
        _connections: new Map(),
        _providers: Object.freeze({
            'amqp:': amqp,
            'amqps:': amqp
        })
    });

    EventEmitter.call(this);
}
inherits(ForemanConnectionManager, EventEmitter);
Object.assign(ForemanConnectionManager.prototype, {
    acquire,
    _getProvider
});

function acquire (uri) {
    if (!this._connections.has(uri)) {
        let protocol = urlParse(uri).protocol;
        let provider = this._getProvider(protocol);
        if (!provider) {
            throw new UnknownProtocolError(protocol);
        }
        this._connections.set(uri, provider(uri));
    }
    return this._connections.get(uri);
}

function _getProvider (protocol) {
    return this._providers[protocol];
}
