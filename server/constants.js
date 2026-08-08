'use strict';
const path = require('path');
const fs   = require('fs');

const DATA_ROOT       = process.env.ZYQORA_DATA || path.join(__dirname, '..', 'data');
const IMAGES_DIR      = path.join(DATA_ROOT, 'images');
const MEDIA_DIR       = path.join(DATA_ROOT, 'media');
const LICENSE_FILE    = path.join(DATA_ROOT, 'license.json');
const MACHINE_ID_FILE = path.join(DATA_ROOT, 'machine_id');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR))  fs.mkdirSync(MEDIA_DIR,  { recursive: true });

module.exports = { DATA_ROOT, IMAGES_DIR, MEDIA_DIR, LICENSE_FILE, MACHINE_ID_FILE };
