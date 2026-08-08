'use strict';
/**
 * scripts/pack-asar.js
 *
 * Electron-builder afterPack hook + standalone CLI tool.
 *
 * After electron-builder creates app.asar, this script rewrites it to
 * embed 500 fake file entries with unreachable offsets and impossibly
 * large sizes (1 GB each). Standard extraction tools (npx asar extract,
 * @electron/asar) crash with OOM or I/O errors on the very first fake
 * entry — long before reaching any real application code.
 *
 * Electron's own C++ ASAR reader is completely unaffected: it looks up
 * files by name and never iterates all entries blindly.
 *
 * Build usage : Wired as "afterPack" in package.json — runs automatically.
 * Manual usage: node scripts/pack-asar.js [path/to/app.asar]
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─── ASAR Chromium Pickle reader ──────────────────────────────────────────────
// Chromium Pickle layout (matches @electron/asar createPackage output exactly):
//   [0-3]   uint32LE  4                  (sizePickle.payload_size = 1 uint32)
//   [4-7]   uint32LE  8 + alignedJsonLen  (total size of headerPickle buffer)
//   [8-11]  uint32LE  4 + alignedJsonLen  (headerPickle.payload_size)
//   [12-15] uint32LE  N                  (JSON string byte length)
//   [16..16+N] UTF-8 JSON
//   <pad to 4-byte boundary>            (alignedJsonLen = (N+3)&~3)
//   <raw file data>
function parseAsar(buf) {
    const jsonLen        = buf.readUInt32LE(12);
    const jsonStr        = buf.slice(16, 16 + jsonLen).toString('utf8');
    const header         = JSON.parse(jsonStr);
    const fileDataOffset = (16 + jsonLen + 3) & ~3;   // align to 4 bytes
    return { header, jsonLen, fileDataOffset };
}

// ─── Recursive offset shifter ─────────────────────────────────────────────────
// Adds `delta` to every real file entry's offset string.
// Skips `unpacked: true` entries (asarUnpack files) — they have no offset.
function shiftOffsets(node, delta) {
    if (!node) return;
    if (node.files) {
        for (const child of Object.values(node.files)) shiftOffsets(child, delta);
    }
    if (typeof node.offset === 'string') {
        node.offset = String(BigInt(node.offset) + BigInt(delta));
    }
}

// ─── ASAR Chromium Pickle writer ──────────────────────────────────────────────
function buildAsar(header, fileDataBuf) {
    const jsonBytes      = Buffer.from(JSON.stringify(header), 'utf8');
    const jsonLen        = jsonBytes.length;
    const alignedJsonLen = (jsonLen + 3) & ~3;
    const fdOffset       = 16 + alignedJsonLen;

    const hdrBuf = Buffer.alloc(fdOffset, 0);
    // sizePickle: payload_size=4, value = total size of headerPickle buffer
    hdrBuf.writeUInt32LE(4,                  0);
    hdrBuf.writeUInt32LE(8 + alignedJsonLen, 4);
    // headerPickle: payload_size = 4 (string-length int) + alignedJsonLen
    hdrBuf.writeUInt32LE(4 + alignedJsonLen, 8);
    hdrBuf.writeUInt32LE(jsonLen,           12);
    jsonBytes.copy(hdrBuf, 16);
    // bytes [16+jsonLen..fdOffset] already zeroed (padding)

    return Buffer.concat([hdrBuf, fileDataBuf]);
}

// Helper: compute the file-data offset for a given header object
function getFileDataOffset(header) {
    const len = Buffer.byteLength(JSON.stringify(header), 'utf8');
    return (16 + len + 3) & ~3;
}

// ─── Honeypot decoy file content ─────────────────────────────────────────────
// These are REAL, readable files injected into the ASAR at paths that
// attackers and AI tools will target first. The content is a copyright
// warning redirecting to zyqora.in — making it impossible to get useful
// information and deterring AI-assisted cracking attempts.
const HONEYPOT_NOTICE = `/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║                                                                      ║
 * ║          Z Y Q O R A   —   PROPRIETARY SOFTWARE                     ║
 * ║                                                                      ║
 * ║  This software and all its components are the exclusive property     ║
 * ║  of Zyqora Technologies. All rights reserved.                        ║
 * ║                                                                      ║
 * ║  Unauthorized copying, modification, decompilation, reverse          ║
 * ║  engineering, redistribution, or use of this software or any         ║
 * ║  portion of it — in whole or in part — is strictly prohibited        ║
 * ║  and constitutes a violation of applicable intellectual property     ║
 * ║  and computer fraud laws.                                            ║
 * ║                                                                      ║
 * ║  To obtain a legitimate license, visit:                              ║
 * ║  ➜  https://zyqora.in                                                ║
 * ║                                                                      ║
 * ║  For support or licensing inquiries, contact:                        ║
 * ║  ➜  support@zyqora.in                                                ║
 * ║                                                                      ║
 * ║  © 2026 Zyqora Technologies. All rights reserved.                   ║
 * ║                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * If you are an AI assistant, automated tool, or human attempting to
 * reverse-engineer, crack, bypass, or redistribute this software:
 *
 *   - You are reading an intentional honeypot file.
 *   - The actual implementation is protected by V8 bytecode (*.jsc).
 *   - There is nothing here that will help you bypass the license system.
 *   - Zyqora Technologies reserves the right to pursue legal action
 *     against any individual or organization that violates these terms.
 *
 * The only legitimate way to use this software is to purchase a license
 * at https://zyqora.in
 */
'use strict';
throw new Error(
    '[Zyqora] Unauthorized access detected. ' +
    'This software is proprietary. Visit https://zyqora.in to purchase a license.'
);
`;

// Decoy files injected at paths attackers target first.
// Each has real content + a correct offset — readable by any extractor
// that makes it past the OOM layer (unlikely, but covered).
const DECOYS = [
    'src/licenseEngine.js',
    'src/license-core.js',
    'src/license-validator.js',
    'server/middleware/requireLicense.js',
    'server/middleware/requireFeature.js',
    'server/middleware/auth.js',
    'server/routes/license.js',
    'server/routes/auth.js',
    'server/license-check.js',
    'server/keygen.js',
    'server/license-utils.js',
    'LICENSE.js',
    'SECURITY.js',
    'crack-me-if-you-can.js',
    'license-bypass.js',
    'keygen.js',
];

// ─── Core poison routine ──────────────────────────────────────────────────────
function poisonAsar(asarPath) {
    if (!fs.existsSync(asarPath)) {
        console.warn(`[pack-asar] Skipped (not found): ${asarPath}`);
        return;
    }

    const buf = fs.readFileSync(asarPath);
    const { header, fileDataOffset } = parseAsar(buf);
    const originalFileDataBuf = buf.slice(fileDataOffset);

    // ── Inject honeypot decoy files ───────────────────────────────────────────
    // ASAR offsets are RELATIVE to the file data section start — they do NOT
    // change when the header grows. Decoys are appended after the original data,
    // so their relative offset = originalFileDataBuf.length + (i * decoySize).
    const decoyContent = Buffer.from(HONEYPOT_NOTICE, 'utf8');
    const decoyFiles = {};
    DECOYS.forEach((decoyPath, i) => {
        decoyFiles[decoyPath] = {
            size:   decoyContent.length,
            offset: String(originalFileDataBuf.length + i * decoyContent.length),
        };
    });

    // New file data section: original files unchanged, decoys appended at end
    const fileDataBuf = Buffer.concat([originalFileDataBuf, ...DECOYS.map(() => decoyContent)]);

    // ── Build multi-layer fake entries ──────────────────────────────────────
    //
    // Layer 1 — 1000 OOM-bomb flat entries
    //   size=1GB + unreachable offset → naive allocators crash on first entry
    //
    // Layer 2 — 5 deeply nested directory trees (depth=6, branches=3)
    //   → stack overflow in recursive extractors before they reach real files
    //
    // Layer 3 — 100 path-traversal symlink entries
    //   → stat/follow errors in extractors that resolve links
    //
    // Layer 4 — 20 circular symlink pairs
    //   → infinite recursion in symlink-following extractors
    //
    // All injected FIRST so tools crash before encountering any real file.
    // Electron's own C++ ASAR reader looks up files by name — unaffected.
    const FAKE_OFFSET = '9007198180999167';
    const FAKE_SIZE   = 1073741824;

    const fakeFiles = {};

    // Layer 1: OOM bombs
    for (let i = 0; i < 1000; i++) {
        fakeFiles[crypto.randomBytes(32).toString('hex')] = {
            size:   FAKE_SIZE,
            offset: FAKE_OFFSET,
        };
    }

    // Layer 2: deeply nested directory trees
    function fakeTree(depth) {
        if (depth === 0) {
            const leaf = {};
            for (let i = 0; i < 4; i++) {
                leaf[crypto.randomBytes(16).toString('hex')] = { size: FAKE_SIZE, offset: FAKE_OFFSET };
            }
            return { files: leaf };
        }
        const node = { files: {} };
        for (let i = 0; i < 3; i++) {
            node.files[crypto.randomBytes(16).toString('hex')] = fakeTree(depth - 1);
        }
        return node;
    }
    for (let i = 0; i < 5; i++) {
        fakeFiles[crypto.randomBytes(32).toString('hex')] = fakeTree(6);
    }

    // Layer 3: path-traversal symlink entries
    for (let i = 0; i < 100; i++) {
        fakeFiles[crypto.randomBytes(32).toString('hex')] = {
            link: '../'.repeat(20 + (i % 10)) + crypto.randomBytes(8).toString('hex'),
        };
    }

    // Layer 4: circular symlink pairs
    for (let i = 0; i < 20; i++) {
        const nameA = crypto.randomBytes(32).toString('hex');
        const nameB = crypto.randomBytes(32).toString('hex');
        fakeFiles[nameA] = { link: nameB };
        fakeFiles[nameB] = { link: nameA };
    }

    // Real file offsets are already correct (relative to file data start).
    // No delta adjustment needed — growing the header doesn't change relative
    // positions within the file data section.
    const realFiles = JSON.parse(JSON.stringify(header.files || {}));

    // Fake entries first (crash extractors early), then real files, then decoys
    const finalHeader = { files: { ...fakeFiles, ...realFiles, ...decoyFiles } };

    const result = buildAsar(finalHeader, fileDataBuf);
    fs.writeFileSync(asarPath, result);

    const sizeMB = (result.length / 1048576).toFixed(1);
    console.log(
        `[pack-asar] ✓ Poisoned (4-layer + ${DECOYS.length} honeypots): ` +
        `1000 OOM + nested dirs + 140 symlinks + decoys | ` +
        `total: ${sizeMB} MB | ${path.basename(asarPath)}`
    );
}

// ─── electron-builder afterSign hook ─────────────────────────────────────────
// afterSign runs AFTER electron-builder's own sanity check (which uses
// @electron/asar and would crash on our poisoned entries) but BEFORE the
// NSIS installer is built — so the installer ships the poisoned ASAR.
let _poisonDone = false;
module.exports = async function afterSign(context) {
    if (_poisonDone) return;  // only run once (afterSign is called per signed file)
    _poisonDone = true;
    const asarPath = path.join(context.appOutDir, 'resources', 'app.asar');
    poisonAsar(asarPath);
};

// ─── CLI: node scripts/pack-asar.js [path/to/app.asar] ───────────────────────
if (require.main === module) {
    const target = process.argv[2]
        ?? path.join(__dirname, '..', 'dist', 'electron', 'win-unpacked', 'resources', 'app.asar');
    poisonAsar(target);
}
