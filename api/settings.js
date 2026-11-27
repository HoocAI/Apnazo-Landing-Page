// Vercel Serverless Function: /api/settings & /api/admin/settings
const fs = require('fs');
const path = require('path');

const VALID_TOKEN = 'apnazo_secure_session_token_2026_x7k';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'settings.json');
  const bundledFile = path.join(process.cwd(), 'data', 'settings.json');

  function getSettings() {
    if (fs.existsSync(targetFile)) {
      try { return JSON.parse(fs.readFileSync(targetFile, 'utf8') || '{}'); } catch(e){}
    }
    if (fs.existsSync(bundledFile)) {
      try { return JSON.parse(fs.readFileSync(bundledFile, 'utf8') || '{}'); } catch(e){}
    }
    return {
      support: {
        supportPhone: "",
        sellerHelpline: "",
        whatsappNumber: "",
        supportEmail: "support@apnazo.com",
        grievanceEmail: "admin@apnazo.com",
        officeAddress: "Main Road, Rourkela, Sundargarh, Odisha - 769001",
        operatingHours: "9:00 AM – 9:00 PM (Monday to Sunday)"
      },
      forms: {
        sellerOnboardingActive: true,
        waitlistActive: true,
        maxCategoriesAllowed: 10,
        fssaiGraceDays: 15,
        notificationEmail: "admin@apnazo.com"
      }
    };
  }

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, settings: getSettings() });
  }

  if (req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const cookieHeader = req.headers['cookie'] || '';
    const token = authHeader.replace('Bearer ', '').trim();

    if (token !== VALID_TOKEN && !cookieHeader.includes(`apnazo_admin_session=${VALID_TOKEN}`)) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e){ body = {}; }
    }

    const current = getSettings();
    if (body.support) {
      current.support = { ...current.support, ...body.support };
    }
    if (body.forms) {
      current.forms = { ...current.forms, ...body.forms };
    }
    current.updatedAt = new Date().toISOString();

    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(current, null, 2), 'utf8');
      if (!isVercel && fs.existsSync(bundledFile)) {
        fs.writeFileSync(bundledFile, JSON.stringify(current, null, 2), 'utf8');
      }
    } catch(e){}

    return res.status(200).json({ success: true, settings: current });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
