const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const OTPS_FILE = path.join(DATA_DIR, 'otps.json');

function readOtps() {
  try {
    return JSON.parse(fs.readFileSync(OTPS_FILE, 'utf8') || '{}');
  } catch (err) {
    return {};
  }
}

function saveOtps(otps) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OTPS_FILE, JSON.stringify(otps, null, 2), 'utf8');
  } catch(e) {}
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mobile = String(body.mobile || '').replace(/\D/g, '').slice(-10);
    const otp = String(body.otp || '').trim();

    if (!mobile || !otp) {
      return res.status(400).json({ success: false, error: 'Mobile number and OTP are required.' });
    }

    const otps = readOtps();
    const record = otps[mobile];

    if (!record) {
      return res.status(400).json({
        success: false,
        error: 'No active OTP found for this number. Please click "Send OTP" to receive a code.'
      });
    }

    if (Date.now() > record.expiresAt) {
      delete otps[mobile];
      saveOtps(otps);
      return res.status(400).json({ success: false, error: 'Verification code has expired. Please request a new OTP.' });
    }

    if (record.attempts >= 5) {
      delete otps[mobile];
      saveOtps(otps);
      return res.status(429).json({ success: false, error: 'Too many incorrect attempts. Please request a new OTP.' });
    }

    if (record.otp !== otp) {
      record.attempts = (record.attempts || 0) + 1;
      saveOtps(otps);
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please check the 6-digit code and try again.' });
    }

    delete otps[mobile];
    saveOtps(otps);

    return res.status(200).json({
      success: true,
      verified: true,
      mobile: mobile,
      message: 'Mobile number verified successfully.'
    });
  } catch(e) {
    return res.status(400).json({ success: false, error: 'Invalid payload.' });
  }
};
