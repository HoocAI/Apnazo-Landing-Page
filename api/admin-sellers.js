// Vercel Serverless Function: GET /api/admin/sellers
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'sellers.json');
  const bundledFile = path.join(process.cwd(), 'data', 'sellers.json');

  let sellers = [];
  if (fs.existsSync(targetFile)) {
    try { sellers = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]'); } catch (e) { sellers = []; }
  } else if (fs.existsSync(bundledFile)) {
    try { sellers = JSON.parse(fs.readFileSync(bundledFile, 'utf8') || '[]'); } catch (e) { sellers = []; }
  }

  return res.status(200).json({ success: true, count: sellers.length, sellers });
};
