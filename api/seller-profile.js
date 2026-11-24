// Vercel Serverless Function: GET /api/seller/profile
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'sellers.json');

  let sellers = [];
  if (fs.existsSync(targetFile)) {
    try { sellers = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]'); } catch (e) { sellers = []; }
  }

  const mobile = (req.query && req.query.mobile ? String(req.query.mobile) : '').trim();
  if (!mobile) {
    return res.status(400).json({ success: false, error: 'mobile parameter required.' });
  }

  const seller = sellers.find(s => s.mobile === mobile);
  if (seller) {
    return res.status(200).json({ success: true, seller });
  } else {
    return res.status(404).json({ success: false, error: 'Seller not found.' });
  }
};
