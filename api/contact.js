// Vercel Serverless Function: POST /api/contact
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }

    const contact = (body && body.contact ? String(body.contact) : '').trim();
    const source = (body && body.source ? String(body.source) : 'Hero Waiting List').trim();

    if (!contact) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email or phone number.' });
    }

    const lead = {
      id: Date.now(),
      contact: contact,
      source: source,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || '',
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    };

    // Log for Vercel runtime logs (always visible in Vercel Dashboard -> Logs)
    console.log(`[Apnazo Lead Captured] Contact: ${lead.contact} | Source: ${lead.source} | Time: ${lead.timestamp}`);

    // If a webhook (Google Sheets / Telegram / Slack / Zapier) is set in Vercel Environment Variables:
    const WEBHOOK_URL = process.env.LEADS_WEBHOOK_URL;
    if (WEBHOOK_URL) {
      try {
        await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(lead)
        });
      } catch (hookErr) {
        console.error('Webhook forwarding error:', hookErr);
      }
    }

    // Also attempt saving to /tmp (Vercel writable directory) or local data folder if running locally
    try {
      const isVercel = process.env.VERCEL === '1';
      const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      const targetFile = path.join(targetDir, 'leads.json');
      let leads = [];
      if (fs.existsSync(targetFile)) {
        try {
          leads = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]');
        } catch (e) {
          leads = [];
        }
      }
      leads.push(lead);
      fs.writeFileSync(targetFile, JSON.stringify(leads, null, 2), 'utf8');
    } catch (fsErr) {
      console.warn('Filesystem write notice:', fsErr.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Thank you! Your information has been saved successfully. We will notify you when Apnazo launches in Rourkela!'
    });
  } catch (err) {
    console.error('Error handling contact submission:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
