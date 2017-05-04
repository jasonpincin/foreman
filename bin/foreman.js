'use strict';

const foreman = require('..');

const server = foreman();

server.configure({
    labels: [
        {pattern: 'test', uri: 'amqp://localhost', options: { exchange: 'some_exchange', queue: 'test', routingKey: 'test' }},
        {pattern: 'output', uri: 'amqp://localhost', options: { exchange: 'some_exchange', queue: 'output', routingKey: 'output' }}
    ],
    scripts: [
        `module.exports = function (foreman) { console.log("hello world") }`,
        `module.exports = function (foreman) { foreman.pump('test').through(function (data, cb) { console.log(data); this.push(data.toUpperCase()); cb(); }).to('output') }`,
        `module.exports = function (foreman) { foreman.pump('output').through(function (data, cb) { console.log(data); cb(); }).start() }`
    ]
});
server.enableAllScripts();
