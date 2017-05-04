const sha1 = require('sha1');

module.exports = function hash (obj) {
    return sha1(typeof obj === 'string' ? obj : obj.toString());
};
