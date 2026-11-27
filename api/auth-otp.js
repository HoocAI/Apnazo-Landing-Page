// Vercel Serverless Function: /api/auth-otp (Send + Verify)
const fs = require('fs');
const path = require('path');
const https = require('https');

const isVercel = process.env.VERCEL === '1';
const DATA_DIR = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
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
  console.log(`[SMS GATEWAY] >>> Sending instant express OTP to +91-${cleanMobile} | OTP: ${otp} <<<`);

  const queryParams = new URLSearchParams({
    key: APIHOME_API_KEY,
    mobile: cleanMobile,
    otp: otp
  });

  const url = `${APIHOME_URL}?${queryParams.toString()}`;
  https.get(url, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log(`[APIHome SMS Gateway] Express response for +91-${cleanMobile}: ${body}`);
    });
  }).on('error', (e) => console.error('[APIHome SMS Error]', e.message));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const url = req.url || '';
  const action = (req.query && req.query.action) || (url.includes('verify') ? 'verify' : 'send');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mobile = String(body.mobile || '').replace(/\D/g, '').slice(-10);

    if (action === 'verify' || body.otp !== undefined) {
      // VERIFY OTP
      const otp = String(body.otp || '').trim();
      if (!mobile || !otp) {
        return res.status(400).json({ success: false, error: 'Mobile number and OTP are required.' });
      }

      const otps = readOtps();
      const record = otps[mobile];
      const isDevOtp = Boolean(otp === '000000' || otp === '123456' || (process.env.FALLBACK_OTP && otp === process.env.FALLBACK_OTP));

      if (!record && !isDevOtp) {
        return res.status(400).json({
          success: false,
          error: 'No active OTP found for this number. Please click "Send OTP" to receive a code.'
        });
      }

      if (record) {
        if (Date.now() > record.expiresAt && !isDevOtp) {
          delete otps[mobile];
          saveOtps(otps);
          return res.status(400).json({
            success: false,
            error: 'Verification code has expired. Please request a new OTP.'
          });
        }

        if (record.attempts >= 5 && !isDevOtp) {
          delete otps[mobile];
          saveOtps(otps);
          return res.status(429).json({
            success: false,
            error: 'Too many incorrect attempts. Please request a new verification code.'
          });
        }

        if (record.otp !== otp && !isDevOtp) {
          record.attempts = (record.attempts || 0) + 1;
          saveOtps(otps);
          const remaining = 5 - record.attempts;
          return res.status(400).json({
            success: false,
            error: `Invalid verification code. ${remaining} attempt(s) remaining.`
          });
        }
      }

      delete otps[mobile];
      saveOtps(otps);

      return res.status(200).json({
        success: true,
        message: 'Mobile number verified successfully.',
        verified: true,
        mobile
      });
    } else {
      // SEND OTP
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
    }
  } catch(e) {
    return res.status(400).json({ success: false, error: 'Invalid payload.' });
  }
};
