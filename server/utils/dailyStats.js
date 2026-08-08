'use strict';
const fs   = require('fs');
const path = require('path');
const { DATA_ROOT } = require('../constants');

const DAILY_STATS_FILE = path.join(DATA_ROOT, 'daily-stats.json');
const _state = { date: '', count: 0 };

// Load persisted value on startup
(function load() {
    try {
        if (fs.existsSync(DAILY_STATS_FILE)) {
            const saved = JSON.parse(fs.readFileSync(DAILY_STATS_FILE, 'utf8'));
            const today = new Date().toISOString().slice(0, 10);
            if (saved.date === today) {
                _state.date  = saved.date;
                _state.count = saved.count || 0;
            }
        }
    } catch { /* ignore corrupt file */ }
})();

function _save() {
    try { fs.writeFileSync(DAILY_STATS_FILE, JSON.stringify(_state)); } catch { /* ignore */ }
}

function getTodayCount() {
    const today = new Date().toISOString().slice(0, 10);
    if (_state.date !== today) { _state.date = today; _state.count = 0; _save(); }
    return _state.count;
}

function incrementDailyCount() {
    getTodayCount();
    _state.count++;
    _save();
}

function getState() { return _state; }

module.exports = { getTodayCount, incrementDailyCount, getState };
