'use strict';
const router = require('express').Router();
const { getMachineId, getLicenseData, saveLicenseData, validateOnline, resetOnlineCache } = require('../license');

router.get('/status', async (req, res) => {
    const machineId = getMachineId();
    const lic = getLicenseData();
    if (!lic || !lic.key) return res.json({ valid: false, machineId });
    // Use stored machineId (set at activation) so NIC enumeration order changes never break validation.
    const validationMid = (lic.machineId || '').trim().toUpperCase() || machineId;
    const online = await validateOnline(lic.key, validationMid);
    if (!online || !online.valid) {
        return res.json({ valid: false, machineId, error: (online && online.error) || 'License revoked or invalid' });
    }
    // Cache fresh fields locally so requireFeature / devices middleware can read them without a network call.
    saveLicenseData({
        ...lic,
        features:    online.features    ?? lic.features    ?? null,
        deviceLimit: online.deviceLimit ?? lic.deviceLimit ?? null,
    });
    return res.json({
        valid: true,
        machineId,
        expiry:      online.expiry      || null,
        secondsLeft: online.secondsLeft || null,
        daysLeft:    online.daysLeft    || null,
        deviceLimit: online.deviceLimit || null,
        isLifetime:  online.isLifetime  || false,
        plan:        online.plan || lic.plan || 'Licensed',
        features:    online.features    || null,
    });
});

router.post('/activate', async (req, res) => {
    const { key } = req.body;
    if (!key) return res.status(400).json({ error: 'License key is required' });
    const machineId = getMachineId();
    const online = await validateOnline(key, machineId);
    if (!online || !online.valid) {
        return res.status(400).json({ error: (online && online.error) || 'License rejected by server.' });
    }
    const activatedAt = Math.floor(Date.now() / 1000);
    const plan = online.plan || 'Licensed';
    resetOnlineCache();
    saveLicenseData({ key: key.trim().toUpperCase(), activatedAt, machineId, plan, features: online.features || null, deviceLimit: online.deviceLimit ?? null });
    return res.json({
        success:     true,
        deviceLimit: online.deviceLimit || null,
        expiry:      online.expiry      || null,
        isLifetime:  online.isLifetime  || false,
        plan,
        features:    online.features    || null,
    });
});

module.exports = router;
