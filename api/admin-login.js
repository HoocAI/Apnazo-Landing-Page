// Vercel Serverless Function: POST /api/admin/login
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const username = ((body && body.username) || '').trim();
  const password = ((body && body.password) || '').trim();

  const ADMIN_USER = process.env.ADMIN_USER || 'admin@apnazo.com';
  const ADMIN_PASS = process.env.ADMIN_PASS || 'ApnazoAdmin@2026';
  const TOKEN = 'apnazo_secure_session_token_2026_x7k';

  if ((username === ADMIN_USER || username === 'admin') && password === ADMIN_PASS) {
    return res.status(200).json({
      success: true,
      token: TOKEN,
      message: 'Authentication successful.'
    });
  } else {
    return res.status(401).json({
      success: false,
      error: 'Invalid Admin ID or Password.'
    });
  }
};
