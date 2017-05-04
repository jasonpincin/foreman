const define = require('define-error')

module.exports = {
    UnknownProtocolError: define('UnknownProtocolError', function (proto) {
        this.message = 'Unknown protocol: ' + proto;
        this.protocol = proto;
    })
};
