// Vercel Serverless Function: POST /api/seller/profile/save
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const isVercel = process.env.VERCEL === '1';
  const targetDir = isVercel ? '/tmp' : path.join(process.cwd(), 'data');
  const targetFile = path.join(targetDir, 'sellers.json');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let sellers = [];
  if (fs.existsSync(targetFile)) {
    try {
      sellers = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]');
    } catch (e) {
      sellers = [];
    }
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const sellerData = body || {};
  const mobile = (sellerData.mobile || '').trim();
  let existingIndex = -1;

  if (sellerData.id) {
    existingIndex = sellers.findIndex(s => s.id === sellerData.id);
  } else if (mobile) {
    existingIndex = sellers.findIndex(s => s.mobile === mobile);
  }

  const now = new Date().toISOString();
  let savedSeller;

  if (existingIndex >= 0) {
    const existing = sellers[existingIndex];
    sellers[existingIndex] = {
      ...existing,
      ...sellerData,
      id: existing.id,
      updatedAt: now,
      auditLog: existing.auditLog || []
    };
    savedSeller = sellers[existingIndex];
  } else {
    const newId = `SEL-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(sellers.length + 1).padStart(3, '0')}`;
    savedSeller = {
      id: newId,
      ...sellerData,
      status: sellerData.decision === 'AMBER' ? 'Pending Admin Review' : 'Active',
      tier: sellerData.tier || (sellerData.decision === 'AMBER' ? 'UNDER_REVIEW' : 'STARTER'),
      createdAt: now,
      updatedAt: now,
      auditLog: [
        {
          timestamp: now,
          actor: 'System Risk Engine',
          decision: sellerData.decision || 'GREEN',
          reason: sellerData.decision === 'AMBER' ? 'Soft mismatch or manual review flag triggered.' : 'Automated checks passed.'
        }
      ]
    };
    sellers.unshift(savedSeller);
  }

  try {
    fs.writeFileSync(targetFile, JSON.stringify(sellers, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing sellers in Vercel handler:', err);
  }

  console.log(`[Seller Saved Vercel] ${savedSeller.id} - ${savedSeller.basics?.bizName || 'Draft'} (${savedSeller.mobile})`);
  return res.status(200).json({ success: true, seller: savedSeller });
};
