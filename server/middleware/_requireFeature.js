'use strict';
const { getLicenseData } = require('../license');

module.exports = function requireFeature(featureName) {
    return function (req, res, next) {
        const lic = getLicenseData();
        const features = lic?.features;
        if (!features || features[featureName] !== false) return next();
        return res.status(403).json({ error: 'FeatureNotEnabled', feature: featureName });
    };
};
