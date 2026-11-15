const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure JSON file exists
if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf8');
}

// Ensure CSV file exists with header
if (!fs.existsSync(LEADS_CSV)) {
  fs.writeFileSync(LEADS_CSV, 'ID,Date,Time,Contact,Form_Source,User_Agent\n', 'utf8');
}

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readLeads() {
  try {
    const raw = fs.readFileSync(LEADS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Error reading leads.json:', err);
    return [];
  }
}

function saveLead(lead) {
  const leads = readLeads();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');

  // Also append to CSV
  const dateObj = new Date(lead.timestamp);
  const dateStr = dateObj.toLocaleDateString('en-IN');
  const timeStr = dateObj.toLocaleTimeString('en-IN');
  const cleanContact = `"${(lead.contact || '').replace(/"/g, '""')}"`;
  const cleanSource = `"${(lead.source || '').replace(/"/g, '""')}"`;
  const cleanAgent = `"${(lead.userAgent || '').replace(/"/g, '""')}"`;

  const csvLine = `${lead.id},${dateStr},${timeStr},${cleanContact},${cleanSource},${cleanAgent}\n`;
  fs.appendFileSync(LEADS_CSV, csvLine, 'utf8');
}

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // API: Submit contact
  if (pathname === '/api/contact' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const contact = (data.contact || '').trim();

        if (!contact) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Contact info is required.' }));
          return;
        }

        const newLead = {
          id: Date.now(),
          contact: contact,
          source: data.source || 'Website Form',
          timestamp: new Date().toISOString(),
          ip: req.socket.remoteAddress || '',
          userAgent: req.headers['user-agent'] || ''
        };

        saveLead(newLead);
        console.log(`[Apnazo Lead Captured] ${newLead.contact} (Source: ${newLead.source})`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Thank you! Your information has been saved successfully. We will notify you when Apnazo launches in Rourkela!'
        }));
      } catch (e) {
        console.error('Failed to parse body:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON payload.' }));
      }
    });
    return;
  }

  // API: Get leads JSON
  if (pathname === '/api/leads' && req.method === 'GET') {
    const leads = readLeads();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, count: leads.length, leads }));
    return;
  }

  // Download CSV
  if (pathname === '/api/leads/export.csv' && req.method === 'GET') {
    if (fs.existsSync(LEADS_CSV)) {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="apnazo_leads.csv"'
      });
      fs.createReadStream(LEADS_CSV).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No CSV data available yet.');
    }
    return;
  }

  // Admin Dashboard View
  if (pathname === '/admin' && req.method === 'GET') {
    const leads = readLeads();
    const rows = leads.map((l, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(l.contact)}</strong></td>
        <td><span class="badge">${escapeHtml(l.source || 'General')}</span></td>
        <td>${new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Apnazo Admin - Captured Contacts</title>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
      <style>
        body { font-family: 'Inter', sans-serif; background: #f3f7ff; margin: 0; padding: 40px 20px; color: #0b1b45; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 20px; box-shadow: 0 10px 30px rgba(15,67,179,0.08); }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 2px solid #edf2f7; padding-bottom: 16px; }
        h1 { margin: 0; font-size: 24px; color: #0a2a75; }
        .btn { background: #0f43b3; color: #fff; padding: 10px 18px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-flex; align-items: center; gap: 8px; }
        .btn:hover { background: #0a2a75; }
        .btn-view { background: #ff7a00; margin-left: 10px; }
        .btn-view:hover { background: #e86f00; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid #edf2f7; }
        th { background: #f8faff; color: #5a6785; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
        tr:hover { background: #f8faff; }
        .badge { background: #e3ecff; color: #0f43b3; font-weight: 600; font-size: 12px; padding: 4px 10px; border-radius: 99px; }
        .empty { text-align: center; padding: 40px; color: #8a96b3; font-size: 16px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            <h1>Apnazo - Waiting List & Leads</h1>
            <p style="margin: 4px 0 0; color: #5a6785; font-size: 14px;">Total registered: <strong>${leads.length}</strong> contacts</p>
          </div>
          <div>
            <a href="/api/leads/export.csv" class="btn">📥 Export to CSV</a>
            <a href="/" class="btn btn-view">🌐 View Website</a>
          </div>
        </div>
        ${leads.length === 0 ? '<div class="empty">No leads captured yet. Submit a contact on the landing page!</div>' : `
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Contact (Email / Phone)</th>
                <th>Source</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `}
      </div>
    </body>
    </html>`;

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // Serve static files
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1><p><a href="/">Return to Apnazo Home</a></p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Apnazo Super App Server Running!`);
  console.log(`  - Local:    http://localhost:${PORT}`);
  console.log(`  - Admin UI: http://localhost:${PORT}/admin`);
  console.log(`  - Data:     ${LEADS_FILE}`);
  console.log(`========================================\n`);
});

