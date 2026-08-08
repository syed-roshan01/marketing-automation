'use strict';
// License engine wrapper — loads bytecode in packaged Electron, JS source in dev
const fs = require('fs');
const { LICENSE_FILE, MACHINE_ID_FILE } = require('./constants');

const _lic = process.versions.electron
    ? (require('bytenode'), require('../src/licenseEngine.jsc'))
    : require('../src/licenseEngine');

// For existing users: if machine_id file doesn't exist yet but license.json does,
// seed the file from the machineId stored in license.json so the displayed/validated
// ID stays consistent with the HMAC baked into their existing license key.
if (!fs.existsSync(MACHINE_ID_FILE)) {
    try {
        const lic = _lic.getLicenseData(LICENSE_FILE);
        const storedMid = (lic?.machineId || '').trim().toUpperCase();
        if (storedMid && storedMid.length === 16 && /^[0-9A-F]+$/.test(storedMid)) {
            fs.writeFileSync(MACHINE_ID_FILE, storedMid);
        }
    } catch (_) {}
}

const getMachineId           = ()      => _lic.getMachineId(MACHINE_ID_FILE);
const getLicenseData         = ()      => _lic.getLicenseData(LICENSE_FILE);
const saveLicenseData        = (data)  => _lic.saveLicenseData(LICENSE_FILE, data);
const validateOnline         = (k, m)  => _lic.validateOnline(k, m);
const getCachedOnlineResult  = (k, m)  => _lic.getCachedOnlineResult(k, m);
const validateLicenseKeyOnline = (k, m) => _lic.validateLicenseKeyOnline(k, m);
const isLicenseValidOnline   = ()      => _lic.isLicenseValidOnline(LICENSE_FILE);
const resetOnlineCache       = ()      => _lic.resetOnlineCache();

module.exports = {
    getMachineId,
    getLicenseData,
    saveLicenseData,
    validateOnline,
    getCachedOnlineResult,
    validateLicenseKeyOnline,
    isLicenseValidOnline,
    resetOnlineCache,
};
