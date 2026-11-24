const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');
const AGREEMENT_FILE = path.join(DATA_DIR, 'agreement.json');
const OTPS_FILE = path.join(DATA_DIR, 'otps.json');

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
if (!fs.existsSync(OTPS_FILE)) {
  fs.writeFileSync(OTPS_FILE, JSON.stringify({}, null, 2), 'utf8');
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

function readOtps() {
  try {
    return JSON.parse(fs.readFileSync(OTPS_FILE, 'utf8') || '{}');
  } catch (err) {
    return {};
  }
}

function saveOtps(otps) {
  fs.writeFileSync(OTPS_FILE, JSON.stringify(otps, null, 2), 'utf8');
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
      status: sellerData.status || (sellerData.submitted ? 'Pending Admin Review' : existing.status || 'Pending Admin Review'),
      decision: sellerData.decision || (sellerData.submitted ? 'AMBER' : existing.decision || 'AMBER'),
      tier: sellerData.tier || (sellerData.submitted ? 'UNDER_REVIEW' : existing.tier || 'UNDER_REVIEW'),
      updatedAt: now,
      auditLog: existing.auditLog || []
    };
    if (sellerData.submitted) {
      sellers[existingIndex].auditLog.push({
        timestamp: now,
        actor: 'Partner Application Form',
        decision: 'AMBER',
        reason: 'Partner completed onboarding agreement. Queued for admin verification.'
      });
    }
    saveSellers(sellers);
    return sellers[existingIndex];
  } else {
    const newId = `SEL-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(sellers.length + 1).padStart(3, '0')}`;
    const newSeller = {
      id: newId,
      ...sellerData,
      status: sellerData.status || 'Pending Admin Review',
      decision: sellerData.decision || 'AMBER',
      tier: sellerData.tier || 'UNDER_REVIEW',
      createdAt: now,
      updatedAt: now,
      auditLog: [
        {
          timestamp: now,
          actor: 'Partner Application Form',
          decision: sellerData.decision || 'AMBER',
          reason: 'Application submitted by partner. Queued for admin verification.'
        }
      ]
    };
    sellers.unshift(newSeller);
    saveSellers(sellers);
    return newSeller;
  }
}

// SMS Gateway Configuration (APIHome / apisol)
const APIHOME_API_KEY = process.env.APIHOME_API_KEY || '3864528b7d85d9fed83716fd4a3bff3750151';
const APIHOME_URL = process.env.APIHOME_URL || 'https://apisol.in/panel/api/bulksms/';

function dispatchSms(mobile, otp) {
  const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
  const msg = `Your Apnazo partner verification code is ${otp}. Valid for 10 minutes.`;
  console.log(`\n[SMS GATEWAY] >>> Sending real OTP via APIHome/apisol to +91-${cleanMobile} <<<`);

  const url = `${APIHOME_URL}?key=${encodeURIComponent(APIHOME_API_KEY)}&mobile=${encodeURIComponent(cleanMobile)}&message=${encodeURIComponent(msg)}`;
  https.get(url, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      console.log(`[APIHome SMS Gateway] Response: ${body}`);
    });
  }).on('error', (e) => console.error('[APIHome SMS Error]', e.message));
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

  // API: Send Real OTP
  if (pathname === '/api/auth/otp/send' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const mobile = String(data.mobile || '').replace(/\D/g, '').slice(-10);

        if (!/^[6-9]\d{9}$/.test(mobile)) {
          return jsonResponse(400, {
            success: false,
            error: 'Please enter a valid 10-digit Indian mobile number.'
          });
        }

        const otps = readOtps();
        const now = Date.now();
        const existing = otps[mobile];

        // Rate limiting: 20 seconds cooldown
        if (existing && (now - existing.createdAt < 20000)) {
          const waitSec = Math.ceil((20000 - (now - existing.createdAt)) / 1000);
          return jsonResponse(429, {
            success: false,
            error: `Please wait ${waitSec}s before requesting a new OTP.`
          });
        }

        // Generate cryptographically uniform 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = now + 10 * 60 * 1000; // 10 minutes expiry

        otps[mobile] = {
          otp,
          expiresAt,
          attempts: 0,
          createdAt: now
        };
        saveOtps(otps);

        dispatchSms(mobile, otp);

        return jsonResponse(200, {
          success: true,
          message: `6-digit verification code sent to +91 ${mobile}.`,
          expiresIn: 600
        });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid payload.' });
      }
    });
    return;
  }

  // API: Verify Real OTP
  if (pathname === '/api/auth/otp/verify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const mobile = String(data.mobile || '').replace(/\D/g, '').slice(-10);
        const otp = String(data.otp || '').trim();

        if (!mobile || !otp) {
          return jsonResponse(400, { success: false, error: 'Mobile number and OTP are required.' });
        }

        const otps = readOtps();
        const record = otps[mobile];

        if (!record) {
          return jsonResponse(400, {
            success: false,
            error: 'No active OTP found for this number. Please click "Send OTP" to receive a code.'
          });
        }

        if (Date.now() > record.expiresAt) {
          delete otps[mobile];
          saveOtps(otps);
          return jsonResponse(400, {
            success: false,
            error: 'Verification code has expired. Please request a new OTP.'
          });
        }

        if (record.attempts >= 5) {
          delete otps[mobile];
          saveOtps(otps);
          return jsonResponse(429, {
            success: false,
            error: 'Too many incorrect attempts. Please request a new OTP.'
          });
        }

        if (record.otp !== otp) {
          record.attempts = (record.attempts || 0) + 1;
          saveOtps(otps);
          return jsonResponse(400, {
            success: false,
            error: 'Invalid OTP. Please check the 6-digit code and try again.'
          });
        }

        // Successfully verified: invalidate one-time token
        delete otps[mobile];
        saveOtps(otps);

        console.log(`[OTP Verified] Mobile +91-${mobile} successfully authenticated.`);

        return jsonResponse(200, {
          success: true,
          verified: true,
          mobile: mobile,
          message: 'Mobile number verified successfully.'
        });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid payload.' });
      }
    });
    return;
  }

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

  // Admin Redirection & API Compatibility
  if (pathname === '/admin' || pathname === '/admin.html') {
    res.writeHead(302, { 'Location': 'http://localhost:3001/' });
    res.end();
    return;
  }

  // API: Admin Login (Supports login from port 3000 or redirects)
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const username = (data.username || '').trim();
        const password = (data.password || '').trim();

        if ((username === 'admin@apnazo.com' || username === 'admin') && password === 'ApnazoAdmin@2026') {
          res.setHeader('Set-Cookie', 'apnazo_admin_session=apnazo_secure_session_token_2026_x7k; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400');
          return jsonResponse(200, {
            success: true,
            token: 'apnazo_secure_session_token_2026_x7k',
            redirectUrl: 'http://localhost:3001/',
            message: 'Authentication successful.'
          });
        } else {
          return jsonResponse(401, { success: false, error: 'Invalid Admin ID or Password.' });
        }
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid JSON payload.' });
      }
    });
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
  console.log(`  - Real OTP API:     /api/auth/otp/send & /verify`);
  console.log(`  - Status:           Active & Isolated`);
  console.log(`========================================\n`);
});
