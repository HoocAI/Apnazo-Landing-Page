const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');
const AGREEMENT_FILE = path.join(DATA_DIR, 'agreement.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(LEADS_CSV)) {
  fs.writeFileSync(LEADS_CSV, 'ID,Date,Time,Contact,Form_Source,User_Agent\n', 'utf8');
}
if (!fs.existsSync(SELLERS_FILE)) {
  fs.writeFileSync(SELLERS_FILE, JSON.stringify([], null, 2), 'utf8');
}
if (!fs.existsSync(AGREEMENT_FILE)) {
  const defaultAgreement = {
    title: "Terms & e-Sign Agreement",
    version: "1.2",
    updatedAt: new Date().toISOString(),
    summaryHeading: "Key Commercial Terms:",
    terms: [
      "Platform Commission: Standard 5% – 10% (0% promotional commission for first 30 days).",
      "Payout Settlement: T+2 days automated direct credit to verified bank account.",
      "Customer Returns: Standard 24-hour return & replacement policy for groceries and damaged goods.",
      "Zero hidden fees: No signup fees, no device rentals, and no monthly maintenance charges."
    ],
    fullAgreementText: "APNAZO SUPER APP MERCHANT & PARTNER AGREEMENT\n\n1. SCOPE AND ELIGIBILITY\nThis Partner Agreement governs the onboarding and commercial operations of merchants, drivers, and service professionals on the Apnazo Super App operating in Rourkela, Odisha. By completing OTP e-sign, the Partner agrees to fulfill customer orders with high quality and honest pricing.\n\n2. COMMISSIONS & PAYOUTS\n- Commission rates are capped as specified in your category schedule (5% to 10%).\n- All net earnings after platform commission and applicable statutory deductions (TDS/TCS) are credited on a T+2 business day rolling schedule directly to the verified bank account.\n\n3. CANCELLATION & DISPUTE RESOLUTION\nOrders cancelled by the seller without valid inventory justification may be subject to review. Disputes are handled via Apnazo Partner Helpdesk within 24 hours.\n\n4. COMPLIANCE & SAFETY\nPartners in food/grocery must maintain valid FSSAI licences. Drivers must maintain valid commercial licences and insurance as per Motor Vehicles Act.",
    consentCheckboxLabel: "I accept the Apnazo Partner Terms and e-Sign this agreement."
  };
  fs.writeFileSync(AGREEMENT_FILE, JSON.stringify(defaultAgreement, null, 2), 'utf8');
}

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
  '.ico': 'image/x-icon'
};

function readLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8') || '[]');
  } catch (err) {
    return [];
  }
}

function saveLead(lead) {
  const leads = readLeads();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');

  const dateObj = new Date(lead.timestamp);
  const dateStr = dateObj.toLocaleDateString('en-IN');
  const timeStr = dateObj.toLocaleTimeString('en-IN');
  const cleanContact = `"${(lead.contact || '').replace(/"/g, '""')}"`;
  const cleanSource = `"${(lead.source || '').replace(/"/g, '""')}"`;
  const cleanAgent = `"${(lead.userAgent || '').replace(/"/g, '""')}"`;

  const csvLine = `${lead.id},${dateStr},${timeStr},${cleanContact},${cleanSource},${cleanAgent}\n`;
  fs.appendFileSync(LEADS_CSV, csvLine, 'utf8');
}

function readSellers() {
  try {
    return JSON.parse(fs.readFileSync(SELLERS_FILE, 'utf8') || '[]');
  } catch (err) {
    return [];
  }
}

function saveSellers(sellers) {
  fs.writeFileSync(SELLERS_FILE, JSON.stringify(sellers, null, 2), 'utf8');
}

function readAgreement() {
  try {
    return JSON.parse(fs.readFileSync(AGREEMENT_FILE, 'utf8') || '{}');
  } catch (err) {
    return {};
  }
}

function upsertSeller(sellerData) {
  const sellers = readSellers();
  const mobile = (sellerData.mobile || '').trim();
  let existingIndex = -1;

  if (sellerData.id) {
    existingIndex = sellers.findIndex(s => s.id === sellerData.id);
  } else if (mobile) {
    existingIndex = sellers.findIndex(s => s.mobile === mobile);
  }

  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    const existing = sellers[existingIndex];
    sellers[existingIndex] = {
      ...existing,
      ...sellerData,
      id: existing.id,
      updatedAt: now,
      auditLog: existing.auditLog || []
    };
    saveSellers(sellers);
    return sellers[existingIndex];
  } else {
    const newId = `SEL-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(sellers.length + 1).padStart(3, '0')}`;
    const newSeller = {
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
    sellers.unshift(newSeller);
    saveSellers(sellers);
    return newSeller;
  }
}

const server = http.createServer((req, res) => {
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

  const jsonResponse = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };

  // API: Submit contact lead from landing page
  if (pathname === '/api/contact' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const contact = (data.contact || '').trim();
        if (!contact) {
          return jsonResponse(400, { success: false, error: 'Contact info is required.' });
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
        return jsonResponse(200, {
          success: true,
          message: 'Thank you! Your information has been saved successfully.'
        });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid JSON payload.' });
      }
    });
    return;
  }

  // API: Save or autosave seller profile (Public to onboarding sellers)
  if (pathname === '/api/seller/profile/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const savedSeller = upsertSeller(data);
        return jsonResponse(200, { success: true, seller: savedSeller });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid seller payload.' });
      }
    });
    return;
  }

  // API: Get seller profile by mobile (for draft resume)
  if (pathname === '/api/seller/profile' && req.method === 'GET') {
    const mobile = parsedUrl.searchParams.get('mobile');
    if (!mobile) {
      return jsonResponse(400, { success: false, error: 'Mobile number query param required.' });
    }
    const sellers = readSellers();
    const seller = sellers.find(s => s.mobile === mobile.trim());
    if (seller) {
      return jsonResponse(200, { success: true, seller });
    } else {
      return jsonResponse(404, { success: false, error: 'Seller profile not found.' });
    }
  }

  // API: Get Current Agreement (Read-only for Step 10 in onboarding)
  if (pathname === '/api/agreement' && req.method === 'GET') {
    const agreement = readAgreement();
    return jsonResponse(200, { success: true, agreement });
  }

  // Admin isolation notice if accessed on website port
  if (pathname === '/admin' || pathname === '/admin.html') {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Not Found · Apnazo</title></head>
<body style="font-family:sans-serif; text-align:center; padding:60px 20px; color:#374151;">
  <h2>404 - Page Not Found</h2>
  <p>The administrative portal is isolated on a dedicated secure internal port (e.g. port 3001) and is not accessible on the public website.</p>
  <p><a href="/" style="color:#0f43b3;">Return to Apnazo Home</a></p>
</body>
</html>`);
    return;
  }

  // Serve static files (index.html, seller.html, assets)
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Apnazo Public Website & Seller Portal`);
  console.log(`  - Local Website:    http://localhost:${PORT}`);
  console.log(`  - Partner Signup:   http://localhost:${PORT}/seller.html`);
  console.log(`  - Status:           Active & Isolated`);
  console.log(`========================================\n`);
});
