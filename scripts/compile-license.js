'use strict';
/**
 * Compiles all security-critical modules to V8 bytecode (.jsc).
 *
 * MUST be run with Electron's Node.js so the bytecode matches the V8
 * version bundled in the packaged app:
 *
 *   npx electron scripts/compile-license.js
 *
 * Run this once before every `npm run build:exe`.
 * The .jsc files ship inside the ASAR; the _*.js sources are excluded.
 */
const bytenode = require('bytenode');
const path     = require('path');
const ROOT     = path.join(__dirname, '..');

function compile(src, out) {
    bytenode.compileFile({ filename: src, output: out });
    console.log('[compile-license] ✓ bytecode written to', out);
}

// ── Core license engine ────────────────────────────────────────────────────
compile(
    path.join(ROOT, 'src',    'licenseEngine.js'),
    path.join(ROOT, 'src',    'licenseEngine.jsc')
);

// ── requireLicense middleware ──────────────────────────────────────────────
compile(
    path.join(ROOT, 'server', 'middleware', '_requireLicense.js'),
    path.join(ROOT, 'server', 'middleware', 'requireLicense.jsc')
);

// ── requireFeature middleware ──────────────────────────────────────────────
compile(
    path.join(ROOT, 'server', 'middleware', '_requireFeature.js'),
    path.join(ROOT, 'server', 'middleware', 'requireFeature.jsc')
);

// ── License route handler ──────────────────────────────────────────────────
compile(
    path.join(ROOT, 'server', 'routes', '_license.js'),
    path.join(ROOT, 'server', 'routes', 'license.jsc')
);

// ── Campaign send engine ───────────────────────────────────────────────────
compile(
    path.join(ROOT, 'server', 'services', '_campaignService.js'),
    path.join(ROOT, 'server', 'services', 'campaignService.jsc')
);

process.exit(0);
