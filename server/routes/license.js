'use strict';
// In packaged Electron: load V8 bytecode; in dev: load source
module.exports = process.versions.electron
    ? (require('bytenode'), require('./license.jsc'))
    : require('./_license');
