'use strict';
// Socket.io singleton — init once in server/index.js, use anywhere
let _io = null;

module.exports = {
    init(io) { _io = io; },
    get()     { return _io; },
    emit(...args) { if (_io) _io.emit(...args); },
};
