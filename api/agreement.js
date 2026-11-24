// Vercel Serverless Function: /api/agreement & /api/admin/agreement
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'agreement.json');
  const bundledFile = path.join(process.cwd(), 'data', 'agreement.json');

  function getAgreement() {
    if (fs.existsSync(targetFile)) {
      try { return JSON.parse(fs.readFileSync(targetFile, 'utf8') || '{}'); } catch(e){}
    }
    if (fs.existsSync(bundledFile)) {
      try { return JSON.parse(fs.readFileSync(bundledFile, 'utf8') || '{}'); } catch(e){}
    }
    return {
      title: "Terms & e-Sign Agreement",
      version: "1.2",
      summaryHeading: "Key Commercial Terms:",
      terms: [
        "Platform Commission: Standard 5% – 10% (0% promotional commission for first 30 days).",
        "Payout Settlement: T+2 days automated direct credit to verified bank account.",
        "Customer Returns: Standard 24-hour return policy for damaged goods.",
        "Zero signup or monthly listing fees."
      ],
      consentCheckboxLabel: "I accept the Apnazo Partner Terms and e-Sign this agreement."
    };
  }

  // GET: Return current agreement
  if (req.method === 'GET') {
    const agreement = getAgreement();
    return res.status(200).json({ success: true, agreement });
  }

  // POST: Update agreement (Requires admin session token)
  if (req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    const VALID_TOKEN = 'apnazo_secure_session_token_2026_x7k';

    if (token !== VALID_TOKEN) {
      return res.status(401).json({ success: false, error: 'Unauthorized: Admin authentication required.' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch(e){ body = {}; }
    }

    const existing = getAgreement();
    const updated = {
      ...existing,
      title: (body.title || existing.title || '').trim(),
      version: (body.version || existing.version || '1.0').trim(),
      summaryHeading: (body.summaryHeading || existing.summaryHeading || 'Key Terms:').trim(),
      terms: Array.isArray(body.terms) ? body.terms : existing.terms,
      fullAgreementText: (body.fullAgreementText || existing.fullAgreementText || '').trim(),
      consentCheckboxLabel: (body.consentCheckboxLabel || existing.consentCheckboxLabel || '').trim(),
      updatedAt: new Date().toISOString()
    };

    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(updated, null, 2), 'utf8');
    } catch(err) {
      console.error('Error writing agreement on Vercel:', err);
    }

    return res.status(200).json({ success: true, agreement: updated });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
