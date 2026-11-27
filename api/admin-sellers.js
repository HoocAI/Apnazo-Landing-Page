// Vercel Serverless Function: GET /api/admin/sellers
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://developerhoocai_db_user:LKceBXsQtnzRje1F@dev-db.vqbk2xw.mongodb.net/apnazo_dev?retryWrites=true&w=majority";
let cachedClient = null;

async function getAtlasSellers() {
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await cachedClient.connect();
    }
    const db = cachedClient.db('apnazo_dev');
    const sellers = await db.collection('sellers').find({}).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    return sellers.map(s => { delete s._id; return s; });
  } catch (e) {
    console.warn('[MongoDB Atlas Error]', e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // Try fetching real data from MongoDB Atlas
  const atlasSellers = await getAtlasSellers();
  if (atlasSellers && atlasSellers.length > 0) {
    return res.status(200).json({ success: true, count: atlasSellers.length, sellers: atlasSellers });
  }

  // Local file fallback
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
