'use strict';
const { isLicenseValidOnline } = require('../license');

async function requireLicense(req, res, next) {
    const valid = await isLicenseValidOnline();
    if (valid) return next();
    return res.status(403).json({ error: 'LicenseRequired' });
}

module.exports = requireLicense;
