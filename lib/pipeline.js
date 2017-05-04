'use strict'
const EventEmitter = require('events').EventEmitter;
const inherits = require('util').inherits;
const through2 = require('through2');

module.exports = function createPipeline (foreman, sandbox) {
    return new Pipeline(foreman, sandbox);
};

function Pipeline (foreman) {
    const pipeline = this;
    const throughs = [];
    let fromLabel;
    let toLabel;
    let streams;

    Object.assign(pipeline, {
        from,
        to,
        through,
        throughFilter,
        throughMap,
        start,
        stop
    });

    EventEmitter.call(pipeline);

    function from (label) {
        if (fromLabel) {
            throw new AlreadyDefinedError('Source label already set');
        }
        fromLabel = label;
        return pipeline;
    }

    function to (label) {
        if (toLabel) {
            throw new AlreadyDefinedError('Destination label already set');
        }
        toLabel = label;
        setImmediate(start);
        return pipeline;
    }

    function through (func) {
        throughs.push(createThrough);

        function createThrough () {
            var t = through2.obj(chunkHandler(func));
            return t;
        }

        return pipeline;
    }

    function throughFilter (func) {
        throughs.push(createThroughFilter);

        function createThroughFilter () {
            return through2Filter.obj(chunkHandler(func));
        }
        return pipeline;
    }

    function throughMap (func) {
        throughs.push(createThroughMap);

        function createThroughMap () {
            return through2Map.obj(chunkHandler(func));
        }
        return pipeline;
    }

    function isStarted () {
        return !!streams;
    }

    function start () {
        if (isStarted()) {
            return;
        }
        streams = [ foreman.createReadStream(fromLabel) ]
            .concat(throughs.map(step => step()))
        if (toLabel) {
            streams = streams.concat([ foreman.createWriteStream(toLabel) ])
        }

        for (let i = 0; i < streams.length - 1; i++) {
            let current = streams[i];
            let next = streams[i + 1];
            current.pipe(next);
            current.on('error', console.error.bind(console));
        }
        pipeline.emit('start');
        return pipeline;
    }

    function stop () {
        if (!isStarted()) {
            return;
        }

        for (let i = 0; i < streams.length; i++) {
            let current = streams[i];
            let next = streams[i + 1];
            if (next) {
                current.unpipe(next);
            }
            current.destroy();
        }

        streams = undefined;
        pipeline.emit('stop');
        return pipeline;
    }
}
inherits(Pipeline, EventEmitter);

function chunkHandler (func) {
    return function _chunkHandler (chunk, enc, cb) {
        func.call(this, chunk, cb);
    }
}
