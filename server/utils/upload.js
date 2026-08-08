'use strict';
const multer = require('multer');
const path   = require('path');
const { IMAGES_DIR, MEDIA_DIR } = require('../constants');

// Template / carousel card images
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
        filename: (req, file, cb) => {
            const ext    = path.extname(file.originalname).toLowerCase();
            const suffix = req.params.cardIndex !== undefined ? `_card${req.params.cardIndex}` : '';
            cb(null, `${req.params.id}${suffix}${ext}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files allowed'));
    },
    limits: { fileSize: 16 * 1024 * 1024 },
});

// Template media (video / audio / document)
const tplMediaUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `tplmedia_${req.params.id}${ext}`);
        },
    }),
    limits: { fileSize: 64 * 1024 * 1024 },
});

// Single-send attachment
const mediaUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, MEDIA_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `single_${Date.now()}${ext}`);
        },
    }),
    limits: { fileSize: 64 * 1024 * 1024 },
});

// CSV contact import (memory storage)
const csvUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Backup restore (memory storage)
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Chatbot node attachment
const cbAttachUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, IMAGES_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            cb(null, `cb_${Date.now()}${ext}`);
        },
    }),
    limits: { fileSize: 64 * 1024 * 1024 },
});

module.exports = { upload, tplMediaUpload, mediaUpload, csvUpload, restoreUpload, cbAttachUpload };
