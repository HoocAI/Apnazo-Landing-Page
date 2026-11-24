const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');

// Admin Credentials
const ADMIN_USER = process.env.ADMIN_USER || 'admin@apnazo.com';
const ADMIN_PASS = process.env.ADMIN_PASS || 'ApnazoAdmin@2026';
const ADMIN_SESSION_TOKEN = 'apnazo_secure_session_token_2026_x7k';

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

// Ensure sellers file exists
if (!fs.existsSync(SELLERS_FILE)) {
  fs.writeFileSync(SELLERS_FILE, JSON.stringify([], null, 2), 'utf8');
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
    const raw = fs.readFileSync(SELLERS_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Error reading sellers.json:', err);
    return [];
  }
}

function saveSellers(sellers) {
  fs.writeFileSync(SELLERS_FILE, JSON.stringify(sellers, null, 2), 'utf8');
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

// Authentication Helper
function isAuthenticated(req) {
  const cookieHeader = req.headers['cookie'] || '';
  const authHeader = req.headers['authorization'] || '';

  if (cookieHeader.includes(`apnazo_admin_session=${ADMIN_SESSION_TOKEN}`)) {
    return true;
  }
  if (authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === ADMIN_SESSION_TOKEN) {
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
        console.log(`[Apnazo Lead] ${newLead.contact} (${newLead.source})`);
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

  // API: Get leads JSON (Protected for admin)
  if (pathname === '/api/leads' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      return jsonResponse(401, { success: false, error: 'Unauthorized' });
    }
    const leads = readLeads();
    return jsonResponse(200, { success: true, count: leads.length, leads });
  }

  // API: Download leads CSV (Protected)
  if (pathname === '/api/leads/export.csv' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized: Admin login required.');
      return;
    }
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

  // API: Save or autosave seller profile (Public to sellers)
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

  // API: Admin Login
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const username = (data.username || '').trim();
        const password = (data.password || '').trim();

        if ((username === ADMIN_USER || username === 'admin') && password === ADMIN_PASS) {
          res.setHeader('Set-Cookie', `apnazo_admin_session=${ADMIN_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);
          return jsonResponse(200, {
            success: true,
            token: ADMIN_SESSION_TOKEN,
            message: 'Authentication successful.'
          });
        } else {
          return jsonResponse(401, {
            success: false,
            error: 'Invalid Admin ID or Password.'
          });
        }
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid JSON payload.' });
      }
    });
    return;
  }

  // API: Admin Logout
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', `apnazo_admin_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    return jsonResponse(200, { success: true, message: 'Logged out successfully.' });
  }

  // API: List all sellers for Admin (Protected)
  if (pathname === '/api/admin/sellers' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      return jsonResponse(401, { success: false, error: 'Unauthorized' });
    }
    const sellers = readSellers();
    return jsonResponse(200, { success: true, count: sellers.length, sellers });
  }

  // API: Admin Decision on a seller application (Protected)
  if (pathname === '/api/admin/seller/decision' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
      return jsonResponse(401, { success: false, error: 'Unauthorized' });
    }
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const { id, decision, tier, reason, actor } = data;
        if (!id || !decision) {
          return jsonResponse(400, { success: false, error: 'id and decision are required.' });
        }

        const sellers = readSellers();
        const sellerIndex = sellers.findIndex(s => s.id === id);
        if (sellerIndex === -1) {
          return jsonResponse(404, { success: false, error: 'Seller not found.' });
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

        saveSellers(sellers);
        console.log(`[Admin Decision] Seller ${id} set to ${decision}`);
        return jsonResponse(200, { success: true, seller });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid decision payload.' });
      }
    });
    return;
  }

  // API: Export sellers as CSV (Protected)
  if (pathname === '/api/admin/sellers/export.csv' && req.method === 'GET') {
    if (!isAuthenticated(req)) {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end('Unauthorized: Admin login required.');
      return;
    }
    const sellers = readSellers();
    const csvHeader = 'Seller_ID,Business_Name,Owner_Name,Mobile,Verticals,Category,Tier,Decision,Status,PAN_Name,Bank_Beneficiary,Bank_Match_Score,Created_Date\n';
    const csvRows = sellers.map(s => {
      const b = s.basics || {};
      const clean = (val) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [
        clean(s.id),
        clean(b.bizName),
        clean(b.ownerName),
        clean(s.mobile),
        clean((s.verticals || []).join('; ')),
        clean(b.category),
        clean(s.tier),
        clean(s.decision),
        clean(s.status),
        clean(s.pan?.registeredName),
        clean(s.bank?.beneficiaryName),
        clean(s.bank?.nameMatchScore ?? ''),
        clean(s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '')
      ].join(',');
    }).join('\n');

    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="apnazo_sellers.csv"'
    });
    res.end(csvHeader + csvRows);
    return;
  }

  // Admin Dashboard View (/admin) - Protected by Login Gate
  if (pathname === '/admin' && req.method === 'GET') {
    const authenticated = isAuthenticated(req);

    // If NOT authenticated, render clean minimalist Login Screen
    if (!authenticated) {
      const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login · Apnazo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <style>
    :root {
      --primary: #0f43b3;
      --text: #111827;
      --text-muted: #6b7280;
      --bg: #f9fafb;
      --surface: #ffffff;
      --border: #e5e7eb;
      --font: 'Inter', -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    .login-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 36px 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    }
    .brand-title {
      font-size: 22px;
      font-weight: 700;
      color: var(--primary);
      margin: 0 0 4px;
    }
    .brand-title b { color: #ff7a00; }
    .subtitle {
      font-size: 13.5px;
      color: var(--text-muted);
      margin: 0 0 24px;
    }
    .field {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 6px;
    }
    input {
      width: 100%;
      padding: 11px 13px;
      font-size: 14.5px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #ffffff;
      color: var(--text);
      outline: none;
      font-family: inherit;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(15, 67, 179, 0.1);
    }
    .btn {
      width: 100%;
      padding: 12px;
      background: var(--primary);
      color: #fff;
      font-size: 14.5px;
      font-weight: 600;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 10px;
    }
    .btn:hover { background: #0a2f80; }
    .error-msg {
      display: none;
      background: #fef2f2;
      color: #991b1b;
      border: 1px solid #fecaca;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 13px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="brand-title">Apna<b>zo</b> <span style="font-size:14px;color:var(--text-muted);font-weight:500;">· Admin Portal</span></div>
    <p class="subtitle">Enter your admin credentials to access operations.</p>

    <div class="error-msg" id="errorMsg">Invalid Admin ID or Password.</div>

    <form id="loginForm">
      <div class="field">
        <label>Admin ID / Email</label>
        <input type="text" id="adminUser" placeholder="admin@apnazo.com" value="admin@apnazo.com" required>
      </div>

      <div class="field">
        <label>Password</label>
        <input type="password" id="adminPass" placeholder="Enter password" value="ApnazoAdmin@2026" required>
      </div>

      <button type="submit" class="btn" id="loginBtn">Sign In to Command Center</button>
    </form>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      var u = document.getElementById('adminUser').value.trim();
      var p = document.getElementById('adminPass').value.trim();
      var err = document.getElementById('errorMsg');
      var btn = document.getElementById('loginBtn');

      err.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p })
      }).then(r => r.json()).then(res => {
        btn.disabled = false;
        btn.textContent = 'Sign In to Command Center';
        if (res.success) {
          localStorage.setItem('apnazo_admin_session', res.token);
          window.location.reload();
        } else {
          err.textContent = res.error || 'Invalid credentials.';
          err.style.display = 'block';
        }
      }).catch(e => {
        btn.disabled = false;
        btn.textContent = 'Sign In to Command Center';
        err.textContent = 'Network error. Please try again.';
        err.style.display = 'block';
      });
    });
  </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(loginHtml);
      return;
    }

    // Authenticated View: Render Complete Minimalist Admin Command Center
    const leads = readLeads();
    const sellers = readSellers();
    const amberQueue = sellers.filter(s => s.decision === 'AMBER' || s.tier === 'UNDER_REVIEW');
    const greenActive = sellers.filter(s => s.decision === 'GREEN' || s.status === 'Active');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Command Center · Apnazo</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <style>
    :root {
      --primary: #0f43b3;
      --text: #111827;
      --text-muted: #6b7280;
      --bg: #f9fafb;
      --surface: #ffffff;
      --border: #e5e7eb;
      --success: #059669;
      --success-bg: #ecfdf5;
      --warning: #b45309;
      --warning-bg: #fffbeb;
      --danger: #dc2626;
      --danger-bg: #fef2f2;
      --font: 'Inter', -apple-system, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .brand {
      font-size: 18px;
      font-weight: 700;
      color: var(--primary);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand b { color: #ff7a00; }
    .brand-tag {
      font-size: 11.5px;
      color: var(--text-muted);
      border-left: 1px solid var(--border);
      padding-left: 8px;
    }
    .btn {
      padding: 7px 12px;
      font-size: 13px;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .btn:hover { background: #f3f4f6; }
    .btn-primary { background: var(--primary); color: #fff; border-color: var(--primary); }
    .btn-primary:hover { background: #0a2f80; }
    .btn-danger { background: var(--danger-bg); color: var(--danger); border-color: #fecaca; }

    .container { max-width: 1200px; margin: 24px auto; padding: 0 20px; }

    /* Minimal Stats Grid */
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px; }
    .kpi-card { background: var(--surface); padding: 18px; border-radius: 10px; border: 1px solid var(--border); }
    .kpi-title { font-size: 12.5px; color: var(--text-muted); font-weight: 500; }
    .kpi-val { font-size: 26px; font-weight: 700; color: var(--text); margin-top: 4px; }

    /* Minimal Tabs */
    .tab-bar { display: flex; gap: 8px; border-bottom: 1px solid var(--border); margin-bottom: 18px; }
    .tab-btn { padding: 10px 14px; border: 0; background: transparent; font-size: 13.5px; font-weight: 500; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -1px; display: flex; align-items: center; gap: 6px; }
    .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }
    .tab-count { font-size: 11px; padding: 2px 6px; border-radius: 99px; background: #f3f4f6; color: var(--text); }
    .tab-count.alert { background: var(--warning-bg); color: var(--warning); }

    /* Table Container */
    .table-card { background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden; }
    .table-header { padding: 14px 18px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .search-input { padding: 7px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; width: 240px; }
    .filter-select { padding: 7px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; }

    table { width: 100%; border-collapse: collapse; text-align: left; }
    th, td { padding: 12px 18px; border-bottom: 1px solid var(--border); font-size: 13px; vertical-align: middle; }
    th { background: #f9fafb; color: var(--text-muted); font-weight: 600; font-size: 11.5px; text-transform: uppercase; }
    tr:hover { background: #fbfcfe; }

    .badge { display: inline-flex; padding: 2px 7px; border-radius: 4px; font-size: 11.5px; font-weight: 600; }
    .badge-green { background: var(--success-bg); color: var(--success); }
    .badge-amber { background: var(--warning-bg); color: var(--warning); }
    .badge-red { background: var(--danger-bg); color: var(--danger); }
    .badge-gray { background: #f3f4f6; color: var(--text-muted); }

    /* Amber review card */
    .amber-card { background: var(--surface); border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .amber-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #fef3c7; }
    .compare-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; background: #fffdfa; padding: 12px; border-radius: 6px; border: 1px solid #fef3c7; margin-bottom: 10px; font-size: 12.5px; }

    /* Drawer */
    .drawer-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 1000; display: none; justify-content: flex-end; }
    .drawer-overlay.open { display: flex; }
    .drawer-content { background: var(--surface); width: 100%; max-width: 520px; height: 100%; overflow-y: auto; padding: 24px; }
    .detail-section { background: #f9fafb; border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; font-size: 13px; }
    .detail-section h4 { margin: 0 0 8px; font-size: 12px; color: var(--primary); text-transform: uppercase; }
    .detail-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dashed var(--border); }
    .detail-row:last-child { border-bottom: 0; }
  </style>
</head>
<body>

  <header class="topbar">
    <div style="display:flex; align-items:center; gap: 8px;">
      <a href="/admin" class="brand">Apna<b>zo</b></a>
      <span class="brand-tag">Operations Command Center</span>
    </div>
    <div style="display:flex; align-items:center; gap: 10px;">
      <span style="font-size:12.5px; color:var(--text-muted);">${ADMIN_USER}</span>
      <button class="btn btn-danger" onclick="logoutAdmin()">Sign Out</button>
    </div>
  </header>

  <div class="container">
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">Total Sellers</div>
        <div class="kpi-val">${sellers.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Amber Review Queue</div>
        <div class="kpi-val" style="color:var(--warning);">${amberQueue.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Starter Live Active</div>
        <div class="kpi-val" style="color:var(--success);">${greenActive.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Early Access Leads</div>
        <div class="kpi-val" style="color:var(--primary);">${leads.length}</div>
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('amber')">
        Amber Review Queue
        <span class="tab-count alert">${amberQueue.length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('sellers')">
        All Sellers Directory
        <span class="tab-count">${sellers.length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('leads')">
        Waitlist Leads
        <span class="tab-count">${leads.length}</span>
      </button>
    </div>

    <!-- TAB 1: Amber Queue -->
    <div id="tab-amber" class="tab-content">
      <div class="table-card" style="padding: 16px;">
        ${amberQueue.length === 0 ? '<div style="text-align:center; padding: 32px; color: var(--text-muted);">✓ No pending applications in the Amber queue.</div>' :
        amberQueue.map(s => `
          <div class="amber-card" id="card-${s.id}">
            <div class="amber-head">
              <div>
                <strong>${escapeHtml(s.basics?.bizName || 'Draft Store')}</strong>
                <span class="badge badge-amber" style="margin-left:6px;">AMBER</span>
                <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">ID: ${s.id} · ${s.mobile} · ${escapeHtml(s.basics?.address || 'Rourkela')}</div>
              </div>
              <div style="display:flex; gap: 6px;">
                <button class="btn btn-primary" onclick="decideSeller('${s.id}', 'GREEN', 'STARTER', 'Admin manual verification passed.')">Approve</button>
                <button class="btn" onclick="decideSeller('${s.id}', 'AMBER', 'UNDER_REVIEW', 'Request re-upload.')">Request Fix</button>
                <button class="btn btn-danger" onclick="decideSeller('${s.id}', 'RED', 'SUSPENDED', 'Rejected.')">Reject</button>
              </div>
            </div>
            <div class="compare-grid">
              <div><strong>PAN Legal Name:</strong><br>${escapeHtml(s.pan?.registeredName || 'N/A')}</div>
              <div><strong>Bank Beneficiary:</strong><br>${escapeHtml(s.bank?.beneficiaryName || 'N/A')} (${s.bank?.nameMatchScore ?? 0}% match)</div>
              <div><strong>GSTIN:</strong><br>${s.gst?.hasGst ? escapeHtml(s.gst?.gstin || '') : 'Exempt'}</div>
              <div><strong>Licence / DL:</strong><br>${escapeHtml(s.licence?.type || 'Standard')}: ${escapeHtml(s.licence?.number || 'Pending')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- TAB 2: All Sellers Directory -->
    <div id="tab-sellers" class="tab-content" style="display:none;">
      <div class="table-card">
        <div class="table-header">
          <div style="display:flex; gap: 8px;">
            <input type="text" id="sellerSearch" class="search-input" placeholder="Search sellers..." oninput="filterSellersTable()">
            <select id="verticalFilter" class="filter-select" onchange="filterSellersTable()">
              <option value="ALL">All Verticals</option>
              <option value="Ecommerce">Ecommerce</option>
              <option value="Taxi">Taxi</option>
              <option value="Services">Services</option>
            </select>
          </div>
          <a href="/api/admin/sellers/export.csv" class="btn">📥 Export CSV</a>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Store &amp; Owner</th>
                <th>Vertical &amp; Category</th>
                <th>Identity &amp; Bank</th>
                <th>Tier</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${sellers.map(s => `
                <tr class="seller-row" data-search="${escapeHtml((s.basics?.bizName + ' ' + s.basics?.ownerName + ' ' + s.mobile + ' ' + s.id).toLowerCase())}">
                  <td><strong>${s.id}</strong></td>
                  <td><b>${escapeHtml(s.basics?.bizName || 'Draft')}</b><br><small style="color:var(--text-muted);">${escapeHtml(s.basics?.ownerName || '')} · ${s.mobile}</small></td>
                  <td>${escapeHtml(s.verticals?.join(', ') || 'Ecommerce')}<br><small style="color:var(--text-muted);">${escapeHtml(s.basics?.category || 'General')}</small></td>
                  <td>PAN: ${escapeHtml(s.pan?.panNumber || 'N/A')}<br><small style="color:var(--text-muted);">Match: ${s.bank?.nameMatchScore ?? 0}%</small></td>
                  <td><span class="badge ${s.tier === 'VERIFIED' ? 'badge-green' : 'badge-gray'}">${s.tier || 'STARTER'}</span></td>
                  <td><span class="badge ${s.decision === 'GREEN' ? 'badge-green' : 'badge-amber'}">${s.status || 'Active'}</span></td>
                  <td><button class="btn" onclick="viewSellerDetails('${s.id}')">View</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: Waitlist Leads -->
    <div id="tab-leads" class="tab-content" style="display:none;">
      <div class="table-card">
        <div class="table-header">
          <strong>Captured Customer Contacts (${leads.length})</strong>
          <a href="/api/leads/export.csv" class="btn">📥 Export Leads CSV</a>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${leads.map((l, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${escapeHtml(l.contact)}</strong></td>
                  <td>${escapeHtml(l.source || 'Website')}</td>
                  <td style="color:var(--text-muted);">${new Date(l.timestamp).toLocaleDateString('en-IN')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Detail Drawer -->
  <div id="drawerOverlay" class="drawer-overlay" onclick="closeDrawer(event)">
    <div class="drawer-content" onclick="event.stopPropagation()">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 id="dStoreName" style="margin:0;">Seller Profile</h3>
        <button class="btn" onclick="closeDrawer()">✕</button>
      </div>
      <div class="detail-section">
        <h4>Basics</h4>
        <div class="detail-row"><span>ID</span><span id="dId">-</span></div>
        <div class="detail-row"><span>Mobile</span><span id="dMobile">-</span></div>
        <div class="detail-row"><span>Owner</span><span id="dOwner">-</span></div>
        <div class="detail-row"><span>Category</span><span id="dCategory">-</span></div>
        <div class="detail-row"><span>Address</span><span id="dAddress">-</span></div>
      </div>
      <div class="detail-section">
        <h4>Verification</h4>
        <div class="detail-row"><span>PAN</span><span id="dPan">-</span></div>
        <div class="detail-row"><span>PAN Name</span><span id="dPanName">-</span></div>
        <div class="detail-row"><span>Bank Beneficiary</span><span id="dBankBeneficiary">-</span></div>
        <div class="detail-row"><span>Match Score</span><span id="dBankScore">-</span></div>
      </div>
      <div style="display:flex; gap: 8px; margin-top: 16px;">
        <button class="btn btn-primary" style="flex:1;" onclick="drawerAction('GREEN', 'STARTER')">Approve Starter</button>
        <button class="btn btn-danger" style="flex:1;" onclick="drawerAction('RED', 'SUSPENDED')">Reject</button>
      </div>
    </div>
  </div>

  <script>
    var currentSellerId = null;
    var allSellers = ${JSON.stringify(sellers)};

    function switchTab(name) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
      if (event && event.currentTarget) event.currentTarget.classList.add('active');
      var el = document.getElementById('tab-' + name);
      if (el) el.style.display = 'block';
    }

    function filterSellersTable() {
      var q = document.getElementById('sellerSearch').value.toLowerCase();
      var rows = document.querySelectorAll('.seller-row');
      rows.forEach(function(row){
        var searchStr = row.getAttribute('data-search') || '';
        row.style.display = (!q || searchStr.includes(q)) ? '' : 'none';
      });
    }

    function decideSeller(id, decision, tier, reason) {
      fetch('/api/admin/seller/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, decision: decision, tier: tier, reason: reason })
      }).then(r => r.json()).then(res => {
        if (res.success) {
          alert('Seller updated to ' + decision);
          window.location.reload();
        } else {
          alert('Error: ' + res.error);
        }
      });
    }

    function viewSellerDetails(id) {
      var s = allSellers.find(item => item.id === id);
      if (!s) return;
      currentSellerId = id;
      var b = s.basics || {};
      document.getElementById('dStoreName').textContent = b.bizName || 'Draft Store';
      document.getElementById('dId').textContent = s.id;
      document.getElementById('dMobile').textContent = s.mobile || '-';
      document.getElementById('dOwner').textContent = b.ownerName || '-';
      document.getElementById('dCategory').textContent = b.category || '-';
      document.getElementById('dAddress').textContent = b.address || '-';
      document.getElementById('dPan').textContent = s.pan?.panNumber || 'N/A';
      document.getElementById('dPanName').textContent = s.pan?.registeredName || 'N/A';
      document.getElementById('dBankBeneficiary').textContent = s.bank?.beneficiaryName || 'N/A';
      document.getElementById('dBankScore').textContent = (s.bank?.nameMatchScore ?? 0) + '%';
      document.getElementById('drawerOverlay').classList.add('open');
    }

    function drawerAction(decision, tier) {
      if (!currentSellerId) return;
      decideSeller(currentSellerId, decision, tier, 'Admin decision');
    }

    function closeDrawer() {
      document.getElementById('drawerOverlay').classList.remove('open');
    }

    function logoutAdmin() {
      fetch('/api/admin/logout', { method: 'POST' }).then(() => {
        localStorage.removeItem('apnazo_admin_session');
        window.location.reload();
      });
    }
  </script>
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
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Apnazo Super App Server Running!`);
  console.log(`  - Local:     http://localhost:${PORT}`);
  console.log(`  - Admin UI:  http://localhost:${PORT}/admin (Protected)`);
  console.log(`  - Onboarding:http://localhost:${PORT}/seller.html`);
  console.log(`========================================\n`);
});
