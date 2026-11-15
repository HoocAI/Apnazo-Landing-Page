// Vercel Serverless Function: GET /api/leads
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'leads.json');

  let leads = [];
  if (fs.existsSync(targetFile)) {
    try {
      leads = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]');
    } catch (e) {
      leads = [];
    }
  }

  return res.status(200).json({
    success: true,
    count: leads.length,
    leads: leads
  });
};
