const fs = require('fs');
const path = require('path');
const https = require('https');

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

const APIHOME_API_KEY = process.env.APIHOME_API_KEY || '3864528b7d85d9fed83716fd4a3bff3750151';
const APIHOME_URL = process.env.APIHOME_URL || 'https://apisol.in/panel/api/bulksms/';

function dispatchSms(mobile, otp) {
  const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
  const msg = `Your Apnazo partner verification code is ${otp}. Valid for 10 minutes.`;
  console.log(`[SMS GATEWAY] Sending real OTP via APIHome/apisol to +91-${cleanMobile}`);
  const url = `${APIHOME_URL}?key=${encodeURIComponent(APIHOME_API_KEY)}&mobile=${encodeURIComponent(cleanMobile)}&message=${encodeURIComponent(msg)}`;
  https.get(url, () => {}).on('error', () => {});
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

    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid 10-digit Indian mobile number.' });
    }

    const otps = readOtps();
    const now = Date.now();
    const existing = otps[mobile];

    if (existing && (now - existing.createdAt < 20000)) {
      const waitSec = Math.ceil((20000 - (now - existing.createdAt)) / 1000);
      return res.status(429).json({ success: false, error: `Please wait ${waitSec}s before requesting a new OTP.` });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = now + 10 * 60 * 1000;

    otps[mobile] = { otp, expiresAt, attempts: 0, createdAt: now };
    saveOtps(otps);
    dispatchSms(mobile, otp);

    return res.status(200).json({
      success: true,
      message: `6-digit verification code sent to +91 ${mobile}.`,
      expiresIn: 600
    });
  } catch(e) {
    return res.status(400).json({ success: false, error: 'Invalid payload.' });
  }
};
