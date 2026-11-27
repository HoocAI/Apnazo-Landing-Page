// Vercel Serverless Function: /api/seller (Profile + Save)
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'sellers.json');
  const bundledFile = path.join(process.cwd(), 'data', 'sellers.json');

  function readSellers() {
    if (fs.existsSync(targetFile)) {
      try { return JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]'); } catch (e) {}
    }
    if (fs.existsSync(bundledFile)) {
      try { return JSON.parse(fs.readFileSync(bundledFile, 'utf8') || '[]'); } catch (e) {}
    }
    return [];
  }

  function writeSellers(data) {
    try {
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(targetFile, JSON.stringify(data, null, 2), 'utf8');
      if (!isVercel && fs.existsSync(bundledFile)) {
        fs.writeFileSync(bundledFile, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch(e) {}
  }

  if (req.method === 'GET') {
    const sellers = readSellers();
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
  }

  if (req.method === 'POST') {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e){ body = {}; }
      }
      const sellers = readSellers();
      const mobile = String(body.mobile || (body.basics && body.basics.mobile) || '').trim();
      if (!mobile) {
        return res.status(400).json({ success: false, error: 'Mobile number required.' });
      }

      const existingIndex = sellers.findIndex(s => s.mobile === mobile);
      const updatedRecord = {
        id: body.id || (existingIndex >= 0 ? sellers[existingIndex].id : 'APN-' + Date.now()),
        mobile,
        status: body.status || 'PENDING',
        decision: body.decision || 'AMBER',
        ...body,
        updatedAt: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        sellers[existingIndex] = updatedRecord;
      } else {
        sellers.push(updatedRecord);
      }
      writeSellers(sellers);
      return res.status(200).json({ success: true, seller: updatedRecord });
    } catch(err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
