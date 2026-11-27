// Vercel Serverless Function: GET /api/leads
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || "mongodb+srv://developerhoocai_db_user:LKceBXsQtnzRje1F@dev-db.vqbk2xw.mongodb.net/apnazo_dev?retryWrites=true&w=majority";
let cachedClient = null;

async function getAtlasLeads() {
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      await cachedClient.connect();
    }
    const db = cachedClient.db('apnazo_dev');
    const leads = await db.collection('leads').find({}).sort({ createdAt: -1 }).toArray();
    return leads.map(l => { delete l._id; return l; });
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const atlasLeads = await getAtlasLeads();
  if (atlasLeads && atlasLeads.length > 0) {
    return res.status(200).json({ success: true, count: atlasLeads.length, leads: atlasLeads });
  }

  const targetFile = path.join(process.cwd(), 'data', 'leads.json');
  let leads = [];
  if (fs.existsSync(targetFile)) {
    try { leads = JSON.parse(fs.readFileSync(targetFile, 'utf8') || '[]'); } catch(e){}
  }
  return res.status(200).json({ success: true, count: leads.length, leads });
};
