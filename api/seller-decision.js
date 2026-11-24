// Vercel Serverless Function: POST /api/admin/seller/decision
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

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

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { id, decision, tier, reason, actor } = body || {};
  if (!id || !decision) {
    return res.status(400).json({ success: false, error: 'id and decision are required.' });
  }

  const sellerIndex = sellers.findIndex(s => s.id === id);
  if (sellerIndex === -1) {
    return res.status(404).json({ success: false, error: 'Seller not found.' });
  }

  const now = new Date().toISOString();
  const seller = sellers[sellerIndex];
  seller.decision = decision;
  if (tier) seller.tier = tier;
  if (decision === 'GREEN') seller.status = 'Active';
  else if (decision === 'AMBER') seller.status = 'Needs Action';
  else if (decision === 'RED') seller.status = 'Rejected';

  seller.updatedAt = now;
  seller.auditLog = seller.auditLog || [];
  seller.auditLog.push({
    timestamp: now,
    actor: actor || 'Admin Reviewer',
    decision,
    reason: reason || 'Decision updated via Admin Command Center.'
  });

  try {
    fs.writeFileSync(targetFile, JSON.stringify(sellers, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving updated seller in Vercel handler:', err);
  }

  return res.status(200).json({ success: true, seller });
};
