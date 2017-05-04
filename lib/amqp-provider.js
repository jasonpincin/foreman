'use strict';
const through2 = require('through2');
const amqp = require('amqp');
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;

const queueOptions = {
    durable: true,
    autoDelete: false
};

const subscribeOptions = {
    ack: true,
    prefetchCount: 250
};

const exchangeOptions = {
    durable: true,
    autoDelete: false
};

const publishOptions = {
    deliveryMode: 2,
    mandatory: true
};

module.exports = function createAmqpConnection (uri, options) {
    return new AmqpConnection(uri, options);
};

function AmqpConnection (uri, options) {
    Object.assign(this, {
        uri: uri,
        _connection: null,
        _status: 'disconnected',
        _connectingPromise: null,
        _disconnectingPromise: null,
        _subscriptions: new Map(),
        _exchanges: new Map(),
        _declarations: new Map()
    });

    EventEmitter.call(this);
}
inherits(AmqpConnection, EventEmitter);
Object.assign(AmqpConnection.prototype, {
    createReadStream,
    createWriteStream,
    connect,
    disconnect,

    // private
    _subscribe,
    _declare,
    _getExchange
});

function createReadStream (options, substitute) {
    // TODO: handle empty routing key better
    const opts = {
        queueName: substitute(options.queue || ''),
        routingKey: substitute(options.routingKey || options.queueName),
        exchangeName: substitute(options.exchange || 'anivia')
    };

    return this._subscribe(opts).createStream();
}

function createWriteStream (options, substitute) {
    const opts = {
        routingKey: substitute(options.routingKey || options.queueName),
        exchangeName: substitute(options.exchange || 'anivia')
    };

    // TODO: need less confusing names than subscribe/declare
    return this._declare(opts).createStream();
}

function connect () {
    var self = this;

    switch (self._status) {
        case 'disconnected':
            self._connectingPromise = new Promise(connectPromise);
            self._status = 'connecting';
            return self._connectingPromise;
        case 'connecting':
            return self._connectingPromise;
        case 'connected':
            return Promise.resolve(self);
        case 'disconnecting':
            var err = new Error('amqp disconnecting');
            return Promise.reject(err);
    }

    function connectPromise (resolve, reject) {
        if (self._status === 'connected') {
            resolve(self);
        }

        self._connection = amqp.createConnection(self.uri);
        self._connection.once('ready', onReady);
        self._connection.once('error', onError);

        function onReady () {
            self._connection.removeListener('error', onError);
            self.emit('ready');
            resolve(self);
        }

        function onError (err) {
            self._connection.removeListener('ready', onReady);
            self.emit('error', err);
            reject(err);
        }
    }
}

function disconnect () {
    var self = this;
    return new Promise(disconnectPromise);

    function disconnectPromise (resolve, reject) {
        if (self._status === 'disconnected') {
            resolve(self);
        }

        self._connection.disconnect();
        self._connection.once('close', onClose);
        self._connection.once('error', onError);

        function onClose () {
            self._connection.removeListener('error', onError);
            self.emit('close');
            resolve(self);
        }

        function onError (err) {
            self._connection.removeListener('close', onClose);
            self.emit('error', err);
            reject(err);
        }
    }
}

function _declare (options) {
    // TODO: rewritw this so that we don't need multiple exchange
    // objects per routingKey. That was horrible.

    const self = this;
    const routingKey = options.routingKey;
    const exchangeName = options.exchangeName;
    const id = `${exchangeName}::${routingKey}`;

    return this._declarations.has(id)
        ? this._declarations.get(id)
        : declare();

    function declare () {
        const streams = new Set();
        const declaration = {
            streams,
            createStream,
            removeStream
        };
        self._declarations.set(id, declaration);
        self.connect().then(onConnect);

        let exchange = null;
        const msgBuffer = [];
        return declaration;

        function onConnect () {
            self._getExchange(exchangeName).then(resumeStreams);
        }

        function createStream () {
            const stream = through2.obj(onData);
            streams.add(stream);
            return stream;
        }

        function removeStream (s) {
            streams.delete(s);
        }

        function onData (data, enc, cb) {
            let msg;
            try {
                msg = JSON.stringify(data);
            }
            catch (err) {
                self.emit('message-stringify-error', {
                    err: err,
                    routingKey: routingKey,
                    exchange: exchangeName,
                    data: data
                });
                console.error(err.stack);
                return cb();
            }

            if (exchange) {
                publish(msg);
            }
            else {
                msgBuffer.push(msg);
            }
            cb();
        }

        function resumeStreams (exch) {
            exchange = exch;

            let msg;
            while (msg = msgBuffer.shift()) {
                publish(msg);
            }
        }

        function publish (msg) {
            exchange.publish(routingKey, msg, publishOptions);
        }
    }
}

function _getExchange (name) {
    const self = this;

    try {
        const self = this;

        if (!this._exchanges.has(name)) {
            this._exchanges.set(name, new Promise(exchangePromise));
        }
        return this._exchanges.get(name);
    }
    catch (err) {
        console.log(err.stack);
    }

    function exchangePromise (resolve, reject) {
        const connection = self._connection;
        const exchange = connection.exchange(name, exchangeOptions, onOpen);

        function onOpen () {
            self._exchanges.set(name, exchange);
            resolve(exchange);
        }
    }
}

function _subscribe (options) {
    const opts = Object.assign({
        queueName: '',
        exchangeName: 'anivia'
    }, options);

    const self = this;
    const queueName = opts.queueName;
    const routingKey = opts.routingKey || opts.queueName;
    const exchangeName = opts.exchangeName;
    const id = `${exchangeName}::${routingKey}::${queueName}`;

    return this._subscriptions.has(id)
        ? this._subscriptions.get(id)
        : subscribe();

    function subscribe () {
        let ctag;
        let queue;

        const streams = new Set();
        const subscription = {
            queue: queueName,
            streams,
            createStream,
            removeStream,
            unsubscribe
        };
        self._subscriptions.set(id, subscription);
        self.connect().then(onConnect);

        return subscription;

        function onConnect () {
            queue = self._connection.queue(queueName, queueOptions);
            queue.subscribe(subscribeOptions, onData).addCallback(onSubscribe);
            queue.bind(exchangeName, routingKey);
        }

        function createStream () {
            const stream = through2.obj();
            stream.on('close', function () {
                // stop consuming
                queue.unsubscribe(ctag);
            });
            streams.add(stream);
            return stream;
        }

        function removeStream (s) {
            streams.delete(s);
        }

        function unsubscribe () {
            for (let stream of streams) {
                stream.destroy();
                streams.remove(stream);
            }
            queue.unsubscribe(ctag);
            self._subscriptions.delete(id);
        }

        function onSubscribe (ok) {
            ctag = ok.consumerTag;
        }

        function onData (payload, headers, deliveryInfo, msg) {
            let parsedData;
            try {
                parsedData = JSON.parse(payload.data.toString());
            }
            catch (err) {
                console.error(err.stack)
                try {
                    self.emit('message-parse-error', {
                        err: err,
                        queue: queueName,
                        exchange: exchangeName,
                        data: payload.data.toString()
                    });
                }
                catch (err) {
                    console.error(err.stack)
                }
                msg.reject(false);
                return;
            }

            for (let stream of streams) {
                stream.write(parsedData);
            }
            msg.acknowledge();
        }
    }
}
