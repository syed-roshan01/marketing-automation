'use strict';
const fs = require('fs');
const buf = fs.readFileSync('dist/electron/win-unpacked/resources/app.asar');
const jsonLen = buf.readUInt32LE(12);
const hdr     = JSON.parse(buf.slice(16, 16 + jsonLen).toString('utf8'));

const targets = ['keygen.js', 'license-bypass.js', 'crack-me-if-you-can.js'];
for (const name of targets) {
    const e = hdr.files[name];
    if (!e) { console.log(name + ': NOT FOUND'); continue; }
    // offsets in ASAR are absolute from start of file
    const content = buf.slice(parseInt(e.offset), parseInt(e.offset) + e.size).toString('utf8');
    console.log('=== ' + name + ' ===');
    console.log(content.slice(0, 500));
    console.log('');
}

