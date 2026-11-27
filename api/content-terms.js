// Vercel Serverless Function: /api/content/terms & /api/admin/content/terms
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
    return {};
  }

  const current = getSettings();
  const terms = current.terms || {
    title: "Apnazo Merchant & Partner Terms of Service",
    version: "Version 1.2 · Effective Date: November 27, 2026",
    contentHtml: "<p>Commercial terms, commissions, and order delivery terms...</p>"
  };

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, terms });
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

    current.terms = {
      title: (body.title || terms.title || 'Apnazo Terms of Service').trim(),
      version: (body.version || terms.version || '').trim(),
      contentHtml: body.contentHtml || terms.contentHtml || '',
      updatedAt: new Date().toISOString()
    };

    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(current, null, 2), 'utf8');
      if (!isVercel && fs.existsSync(bundledFile)) {
        fs.writeFileSync(bundledFile, JSON.stringify(current, null, 2), 'utf8');
      }
    } catch(e){}

    return res.status(200).json({ success: true, terms: current.terms });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
