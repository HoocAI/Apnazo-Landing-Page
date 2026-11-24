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

function dispatchSms(mobile, otp) {
  console.log(`[SMS GATEWAY] OTP [${otp}] sent to +91-${mobile}`);
  if (process.env.FAST2SMS_API_KEY) {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${process.env.FAST2SMS_API_KEY}&variables_values=${otp}&route=otp&numbers=${mobile}`;
    https.get(url, (res) => {}).on('error', () => {});
  }
  if (process.env.TWOFACTOR_API_KEY) {
    const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/${mobile}/${otp}/OTP1`;
    https.get(url, (res) => {}).on('error', () => {});
  }
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

    const hasExternalKey = Boolean(process.env.FAST2SMS_API_KEY || process.env.TWOFACTOR_API_KEY);

    return res.status(200).json({
      success: true,
      message: `6-digit verification code sent to +91 ${mobile}.`,
      expiresIn: 600,
      devOtp: (!hasExternalKey) ? otp : undefined
    });
  } catch(e) {
    return res.status(400).json({ success: false, error: 'Invalid payload.' });
  }
};
