'use strict';
// Phone number normalization
// Strips non-digits; prepends 91 for bare 10-digit Indian mobiles (6-9 prefix)
function normalizePhone(raw) {
    let n = String(raw || '').replace(/[^0-9]/g, '');
    if (n.length === 10 && /^[6-9]/.test(n)) n = '91' + n;
    return n;
}

module.exports = { normalizePhone };
