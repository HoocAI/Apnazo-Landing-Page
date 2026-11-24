const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const LEADS_CSV = path.join(DATA_DIR, 'leads.csv');
const SELLERS_FILE = path.join(DATA_DIR, 'sellers.json');

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
    // Merge updates
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
    // Create new seller profile
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
          reason: sellerData.decision === 'AMBER' ? 'Soft mismatch or manual review flag triggered during onboarding.' : 'Automated checks passed.'
        }
      ]
    };
    sellers.unshift(newSeller);
    saveSellers(sellers);
    return newSeller;
  }
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

  // Helper for JSON response
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
          message: 'Thank you! Your information has been saved successfully. We will notify you when Apnazo launches in Rourkela!'
        });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid JSON payload.' });
      }
    });
    return;
  }

  // API: Get leads JSON
  if (pathname === '/api/leads' && req.method === 'GET') {
    const leads = readLeads();
    return jsonResponse(200, { success: true, count: leads.length, leads });
  }

  // API: Download leads CSV
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

  // API: Save or autosave seller profile
  if (pathname === '/api/seller/profile/save' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const savedSeller = upsertSeller(data);
        console.log(`[Seller Saved] ${savedSeller.id} - ${savedSeller.basics?.bizName || 'Draft'} (${savedSeller.mobile})`);
        return jsonResponse(200, { success: true, seller: savedSeller });
      } catch (e) {
        console.error('Error saving seller profile:', e);
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

  // API: List all sellers for Admin
  if (pathname === '/api/admin/sellers' && req.method === 'GET') {
    const sellers = readSellers();
    return jsonResponse(200, { success: true, count: sellers.length, sellers });
  }

  // API: Admin Decision on a seller application
  if (pathname === '/api/admin/seller/decision' && req.method === 'POST') {
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
        seller.decision = decision; // GREEN, AMBER, RED
        if (tier) seller.tier = tier; // STARTER, VERIFIED, TRUSTED, SUSPENDED
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
        console.log(`[Admin Decision] Seller ${id} set to ${decision} (${seller.status})`);
        return jsonResponse(200, { success: true, seller });
      } catch (e) {
        return jsonResponse(400, { success: false, error: 'Invalid decision payload.' });
      }
    });
    return;
  }

  // API: Export sellers as CSV
  if (pathname === '/api/admin/sellers/export.csv' && req.method === 'GET') {
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

  // Admin Dashboard View (/admin)
  if (pathname === '/admin' && req.method === 'GET') {
    const leads = readLeads();
    const sellers = readSellers();
    const amberQueue = sellers.filter(s => s.decision === 'AMBER' || s.tier === 'UNDER_REVIEW');
    const greenActive = sellers.filter(s => s.decision === 'GREEN' || s.status === 'Active');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apnazo Admin Command Center - Super App Operations</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700;800&display=swap">
  <style>
    :root {
      --blue: #0f43b3;
      --deep: #0a2a75;
      --orange: #ff7a00;
      --ink: #0b1b45;
      --muted: #5a6785;
      --bg: #f4f7fc;
      --card: #ffffff;
      --border: #e2e8f0;
      --green: #10b981;
      --green-light: #ecfdf5;
      --amber: #f59e0b;
      --amber-light: #fffbeb;
      --red: #ef4444;
      --red-light: #fef2f2;
      --display: 'Sora', sans-serif;
      --body: 'Inter', sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--body);
      background: var(--bg);
      color: var(--ink);
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      background: #fff;
      border-bottom: 1px solid var(--border);
      padding: 14px 28px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .brand {
      font-family: var(--display);
      font-weight: 800;
      font-size: 20px;
      color: var(--blue);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand b { color: var(--orange); }
    .brand-tag {
      background: #e3ecff;
      color: var(--blue);
      font-size: 11px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .btn {
      background: var(--blue);
      color: #fff;
      padding: 8px 16px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      font-size: 13px;
      border: 0;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .btn:hover { background: var(--deep); }
    .btn-secondary {
      background: #fff;
      color: var(--ink);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: #f8fafc; }
    .btn-orange { background: var(--orange); }
    .btn-orange:hover { background: #e86f00; }
    .btn-success { background: var(--green); }
    .btn-success:hover { background: #059669; }
    .btn-danger { background: var(--red); }
    .btn-danger:hover { background: #dc2626; }
    .btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 6px; }

    .container {
      max-width: 1280px;
      margin: 24px auto;
      padding: 0 24px;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: #fff;
      padding: 20px;
      border-radius: 14px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(15, 67, 179, 0.03);
    }
    .kpi-title { font-size: 13px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
    .kpi-val { font-family: var(--display); font-size: 30px; font-weight: 800; color: var(--ink); margin-top: 6px; }
    .kpi-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .kpi-alert { border-left: 4px solid var(--amber); }

    /* Tabs */
    .tab-bar {
      display: flex;
      gap: 8px;
      border-bottom: 2px solid var(--border);
      margin-bottom: 20px;
    }
    .tab-btn {
      padding: 12px 18px;
      border: 0;
      background: transparent;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.15s ease;
    }
    .tab-btn.active {
      color: var(--blue);
      border-bottom-color: var(--blue);
    }
    .tab-count {
      background: #e2e8f0;
      color: var(--ink);
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 99px;
      font-weight: 700;
    }
    .tab-btn.active .tab-count {
      background: #e3ecff;
      color: var(--blue);
    }
    .tab-count.alert {
      background: var(--amber-light);
      color: #b45309;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Table Container */
    .table-card {
      background: #fff;
      border-radius: 14px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 16px rgba(15, 67, 179, 0.04);
      overflow: hidden;
    }
    .table-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }
    .search-input {
      padding: 8px 14px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13.5px;
      width: 280px;
      background: #f8fafc;
    }
    .filter-select {
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 13px;
      background: #fff;
      color: var(--ink);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th, td {
      padding: 14px 20px;
      border-bottom: 1px solid var(--border);
      font-size: 13.5px;
      vertical-align: middle;
    }
    th {
      background: #f8fafc;
      color: var(--muted);
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    tr:hover { background: #fbfdff; }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 99px;
      font-size: 11.5px;
      font-weight: 700;
    }
    .badge-green { background: var(--green-light); color: var(--green); }
    .badge-amber { background: var(--amber-light); color: #b45309; }
    .badge-red { background: var(--red-light); color: var(--red); }
    .badge-blue { background: #e3ecff; color: var(--blue); }
    .badge-gray { background: #f1f5f9; color: var(--muted); }

    /* Amber Side-by-Side Review Card */
    .amber-card {
      background: #fff;
      border: 1px solid #fde68a;
      border-radius: 12px;
      padding: 18px;
      margin-bottom: 16px;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.06);
    }
    .amber-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #fef3c7;
    }
    .compare-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      background: #fffdfa;
      padding: 14px;
      border-radius: 10px;
      border: 1px solid #fef3c7;
      margin-bottom: 14px;
    }
    .compare-col label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .compare-col .val {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--ink);
    }

    /* Modal / Drawer */
    .drawer-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(11, 27, 69, 0.4);
      z-index: 1000;
      display: none;
      justify-content: flex-end;
    }
    .drawer-overlay.open { display: flex; }
    .drawer-content {
      background: #fff;
      width: 100%;
      max-width: 580px;
      height: 100%;
      overflow-y: auto;
      padding: 28px;
      box-shadow: -10px 0 30px rgba(0,0,0,0.15);
      animation: slideIn 0.25s ease;
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .detail-section {
      background: #f8fafc;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 18px;
      margin-bottom: 14px;
    }
    .detail-section h4 {
      margin: 0 0 10px;
      font-size: 13px;
      color: var(--blue);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      border-bottom: 1px dashed var(--border);
    }
    .detail-row:last-child { border-bottom: 0; }
    .detail-row span:first-child { color: var(--muted); }
    .detail-row span:last-child { font-weight: 600; }
  </style>
</head>
<body>

  <!-- Topbar -->
  <header class="topbar">
    <div style="display:flex; align-items:center; gap: 14px;">
      <a href="/admin" class="brand">
        Apna<b>zo</b>
        <span class="brand-tag">Super App Admin</span>
      </a>
    </div>
    <div class="topbar-actions">
      <a href="/seller.html" target="_blank" class="btn btn-secondary">
        🏪 Seller Onboarding Portal
      </a>
      <a href="/" target="_blank" class="btn btn-orange">
        🌐 Customer Landing Page
      </a>
    </div>
  </header>

  <div class="container">
    <!-- KPI Overview -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">Registered Partners</div>
        <div class="kpi-val">${sellers.length}</div>
        <div class="kpi-sub">Total onboarded merchants & drivers</div>
      </div>
      <div class="kpi-card kpi-alert">
        <div class="kpi-title">Amber Review Queue</div>
        <div class="kpi-val" style="color:#b45309;">${amberQueue.length}</div>
        <div class="kpi-sub">Action required within 24hr SLA</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Starter Live Sellers</div>
        <div class="kpi-val" style="color:var(--green);">${greenActive.length}</div>
        <div class="kpi-sub">Active & listing products/rides</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Waitlist Leads</div>
        <div class="kpi-val" style="color:var(--blue);">${leads.length}</div>
        <div class="kpi-sub">Early access customer signups</div>
      </div>
    </div>

    <!-- Tabs Navigation -->
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('amber')">
        ⚠️ Amber Review Queue
        <span class="tab-count alert">${amberQueue.length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('sellers')">
        🏪 All Sellers Directory
        <span class="tab-count">${sellers.length}</span>
      </button>
      <button class="tab-btn" onclick="switchTab('leads')">
        👥 Customer Waitlist Leads
        <span class="tab-count">${leads.length}</span>
      </button>
    </div>

    <!-- TAB 1: Amber Review Queue -->
    <div id="tab-amber" class="tab-content">
      <div class="table-card" style="padding: 20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
          <div>
            <h3 style="margin:0; font-size:18px;">Risk Engine Amber Queue (SLA: 24 Hours)</h3>
            <p style="margin:4px 0 0; font-size:13px; color:var(--muted);">Applications flagged for soft name-mismatch or manual document verification.</p>
          </div>
        </div>

        <div id="amberList">
          ${amberQueue.length === 0 ? '<div style="text-align:center; padding: 40px; color: var(--muted);">✓ No pending applications in the Amber queue! All sellers are verified or auto-approved.</div>' :
          amberQueue.map(s => `
            <div class="amber-card" id="card-${s.id}">
              <div class="amber-head">
                <div>
                  <div style="display:flex; align-items:center; gap: 8px;">
                    <strong style="font-size:16px;">${escapeHtml(s.basics?.bizName || 'Draft Store')}</strong>
                    <span class="badge badge-amber">AMBER REVIEW</span>
                    <span class="badge badge-gray">${escapeHtml(s.verticals?.join(', ') || 'Ecommerce')}</span>
                  </div>
                  <div style="font-size:13px; color:var(--muted); margin-top:4px;">
                    ID: <strong>${s.id}</strong> · Mobile: <strong>${s.mobile}</strong> · Location: ${escapeHtml(s.basics?.address || 'Rourkela')}
                  </div>
                </div>
                <div style="display:flex; gap: 8px;">
                  <button class="btn btn-sm btn-success" onclick="decideSeller('${s.id}', 'GREEN', 'STARTER', 'Admin manual verification passed.')">
                    ✓ Approve to Starter
                  </button>
                  <button class="btn btn-sm btn-secondary" onclick="decideSeller('${s.id}', 'AMBER', 'UNDER_REVIEW', 'Request re-upload of cancelled cheque or bank statement.')">
                    🔄 Request Fix
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="decideSeller('${s.id}', 'RED', 'SUSPENDED', 'Verification failed: Information mismatch.')">
                    ✕ Reject
                  </button>
                </div>
              </div>

              <!-- Side-by-side comparison -->
              <div class="compare-grid">
                <div class="compare-col">
                  <label>PAN Reference Name</label>
                  <div class="val">${escapeHtml(s.pan?.registeredName || 'NOT VERIFIED')}</div>
                  <small style="color:var(--muted);">PAN: ${escapeHtml(s.pan?.panNumber || 'N/A')}</small>
                </div>
                <div class="compare-col">
                  <label>Bank Account Beneficiary</label>
                  <div class="val">${escapeHtml(s.bank?.beneficiaryName || 'N/A')}</div>
                  <small style="color:var(--muted);">IFSC: ${escapeHtml(s.bank?.ifsc || 'N/A')} · Score: <strong>${s.bank?.nameMatchScore ?? 0}%</strong></small>
                </div>
                <div class="compare-col">
                  <label>GST / Tax Name</label>
                  <div class="val">${s.gst?.hasGst ? escapeHtml(s.gst?.tradeName || 'GST Active') : 'Exempt / Non-GST'}</div>
                  <small style="color:var(--muted);">${s.gst?.hasGst ? escapeHtml(s.gst?.gstin || '') : escapeHtml(s.gst?.nonGstReason || 'Declared')}</small>
                </div>
                <div class="compare-col">
                  <label>Category Licence / DL</label>
                  <div class="val">${escapeHtml(s.licence?.type || 'Standard')}: ${escapeHtml(s.licence?.number || 'Pending')}</div>
                  <small style="color:var(--muted);">Status: ${s.licence?.verified ? 'Auto-verified' : 'Manual review'}</small>
                </div>
              </div>

              <div style="background:#fffbeb; padding:10px 14px; border-radius:8px; font-size:12.5px; color:#92400e;">
                <strong>Flag Reason:</strong> ${escapeHtml(s.auditLog && s.auditLog.length ? s.auditLog[s.auditLog.length - 1].reason : 'Pending compliance check')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <!-- TAB 2: All Sellers Directory -->
    <div id="tab-sellers" class="tab-content" style="display:none;">
      <div class="table-card">
        <div class="table-header">
          <div style="display:flex; gap: 12px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="sellerSearch" class="search-input" placeholder="Search by Store, Owner, Phone..." oninput="filterSellersTable()">
            <select id="verticalFilter" class="filter-select" onchange="filterSellersTable()">
              <option value="ALL">All Verticals</option>
              <option value="Ecommerce">Ecommerce & Retail</option>
              <option value="Taxi">Taxi & Rides</option>
              <option value="Services">Home Services</option>
            </select>
            <select id="tierFilter" class="filter-select" onchange="filterSellersTable()">
              <option value="ALL">All Tiers</option>
              <option value="STARTER">Starter</option>
              <option value="VERIFIED">Verified</option>
              <option value="TRUSTED">Trusted</option>
              <option value="UNDER_REVIEW">Under Review</option>
            </select>
          </div>
          <div>
            <a href="/api/admin/sellers/export.csv" class="btn btn-secondary">
              📥 Export Sellers CSV
            </a>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table id="sellersTable">
            <thead>
              <tr>
                <th>Seller ID</th>
                <th>Business & Owner</th>
                <th>Vertical & Category</th>
                <th>Identity & Bank</th>
                <th>Access Tier</th>
                <th>Risk Decision</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${sellers.map(s => {
                const decBadge = s.decision === 'GREEN' ? 'badge-green' : (s.decision === 'AMBER' ? 'badge-amber' : 'badge-red');
                const tierBadge = s.tier === 'TRUSTED' ? 'badge-blue' : (s.tier === 'VERIFIED' ? 'badge-green' : (s.tier === 'STARTER' ? 'badge-blue' : 'badge-amber'));
                return `
                  <tr class="seller-row" data-search="${escapeHtml((s.basics?.bizName + ' ' + s.basics?.ownerName + ' ' + s.mobile + ' ' + s.id).toLowerCase())}" data-vertical="${escapeHtml(s.verticals?.join(',') || '')}" data-tier="${s.tier || ''}">
                    <td><strong>${s.id}</strong></td>
                    <td>
                      <div style="font-weight:700;">${escapeHtml(s.basics?.bizName || 'Unnamed')}</div>
                      <div style="font-size:12px; color:var(--muted);">${escapeHtml(s.basics?.ownerName || 'N/A')} · ${s.mobile}</div>
                    </td>
                    <td>
                      <div>${escapeHtml(s.verticals?.join(', ') || 'Ecommerce')}</div>
                      <div style="font-size:12px; color:var(--muted);">${escapeHtml(s.basics?.category || 'General')}</div>
                    </td>
                    <td>
                      <div>PAN: <strong>${escapeHtml(s.pan?.panNumber || 'N/A')}</strong></div>
                      <div style="font-size:12px; color:var(--muted);">Bank Match: <strong>${s.bank?.nameMatchScore ?? 0}%</strong></div>
                    </td>
                    <td><span class="badge ${tierBadge}">${s.tier || 'STARTER'}</span></td>
                    <td><span class="badge ${decBadge}">${s.decision || 'GREEN'}</span></td>
                    <td style="color:var(--muted); font-size:12px;">${s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-IN') : '-'}</td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="viewSellerDetails('${s.id}')">View Details</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: Customer Waitlist Leads -->
    <div id="tab-leads" class="tab-content" style="display:none;">
      <div class="table-card">
        <div class="table-header">
          <div>
            <h3 style="margin:0; font-size:17px;">Captured Customer Contacts</h3>
            <p style="margin:4px 0 0; font-size:13px; color:var(--muted);">${leads.length} early access leads registered from the landing page</p>
          </div>
          <div>
            <a href="/api/leads/export.csv" class="btn btn-secondary">📥 Export Leads CSV</a>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Contact Info</th>
                <th>Source Section</th>
                <th>Captured At</th>
              </tr>
            </thead>
            <tbody>
              ${leads.map((l, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${escapeHtml(l.contact)}</strong></td>
                  <td><span class="badge badge-blue">${escapeHtml(l.source || 'Website Form')}</span></td>
                  <td style="color:var(--muted); font-size:12px;">${new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <!-- Seller Details Drawer -->
  <div id="drawerOverlay" class="drawer-overlay" onclick="closeDrawer(event)">
    <div class="drawer-content" onclick="event.stopPropagation()">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; border-bottom:1px solid var(--border); padding-bottom:14px;">
        <div>
          <h2 id="dStoreName" style="margin:0; font-size:20px; color:var(--deep);">Seller Profile</h2>
          <div id="dId" style="font-size:13px; color:var(--muted);">ID</div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="closeDrawer()">✕ Close</button>
      </div>

      <div class="detail-section">
        <h4>S1-S4: Account & Verticals</h4>
        <div class="detail-row"><span>Mobile Number</span><span id="dMobile">-</span></div>
        <div class="detail-row"><span>Preferred Language</span><span id="dLang">-</span></div>
        <div class="detail-row"><span>Referral Code Used</span><span id="dRefCode">-</span></div>
        <div class="detail-row"><span>Verticals Selected</span><span id="dVerticals">-</span></div>
      </div>

      <div class="detail-section">
        <h4>S5: Business Basics</h4>
        <div class="detail-row"><span>Owner Full Name</span><span id="dOwner">-</span></div>
        <div class="detail-row"><span>Business Category</span><span id="dCategory">-</span></div>
        <div class="detail-row"><span>Pickup / Store Address</span><span id="dAddress" style="text-align:right; max-width:260px;">-</span></div>
      </div>

      <div class="detail-section">
        <h4>S6-S8: Verification Details</h4>
        <div class="detail-row"><span>PAN Number</span><span id="dPan">-</span></div>
        <div class="detail-row"><span>PAN Registered Legal Name</span><span id="dPanName">-</span></div>
        <div class="detail-row"><span>GST Status</span><span id="dGst">-</span></div>
        <div class="detail-row"><span>Bank Beneficiary</span><span id="dBankBeneficiary">-</span></div>
        <div class="detail-row"><span>Bank IFSC / Account</span><span id="dBankIfsc">-</span></div>
        <div class="detail-row"><span>Name Match Score</span><span id="dBankScore" class="badge badge-green">-</span></div>
        <div class="detail-row"><span>Category Licence (FSSAI/DL)</span><span id="dLicence">-</span></div>
      </div>

      <div class="detail-section">
        <h4>S9-S13: Risk Decision & Limits</h4>
        <div class="detail-row"><span>Current Access Tier</span><span id="dTier" class="badge badge-blue">-</span></div>
        <div class="detail-row"><span>Risk Engine Outcome</span><span id="dDecision" class="badge badge-green">-</span></div>
        <div class="detail-row"><span>Store Status</span><span id="dStatus">-</span></div>
      </div>

      <div style="margin-top:20px; display:flex; gap:10px;">
        <button id="dApproveBtn" class="btn btn-success" style="flex:1;" onclick="drawerAction('GREEN', 'STARTER')">✓ Approve to Starter</button>
        <button id="dRejectBtn" class="btn btn-danger" style="flex:1;" onclick="drawerAction('RED', 'SUSPENDED')">✕ Reject Application</button>
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
      var v = document.getElementById('verticalFilter').value;
      var t = document.getElementById('tierFilter').value;
      var rows = document.querySelectorAll('.seller-row');

      rows.forEach(function(row){
        var searchStr = row.getAttribute('data-search') || '';
        var vert = row.getAttribute('data-vertical') || '';
        var tier = row.getAttribute('data-tier') || '';

        var matchesQ = !q || searchStr.includes(q);
        var matchesV = v === 'ALL' || vert.includes(v);
        var matchesT = t === 'ALL' || tier === t;

        row.style.display = (matchesQ && matchesV && matchesT) ? '' : 'none';
      });
    }

    function decideSeller(id, decision, tier, reason) {
      fetch('/api/admin/seller/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id, decision: decision, tier: tier, reason: reason })
      }).then(r => r.json()).then(res => {
        if (res.success) {
          alert('Seller ' + id + ' updated to ' + decision + ' (' + tier + ')');
          window.location.reload();
        } else {
          alert('Error: ' + res.error);
        }
      }).catch(err => alert('Network error: ' + err.message));
    }

    function viewSellerDetails(id) {
      var s = allSellers.find(item => item.id === id);
      if (!s) return;
      currentSellerId = id;
      var b = s.basics || {};

      document.getElementById('dStoreName').textContent = b.bizName || 'Draft Store';
      document.getElementById('dId').textContent = 'Seller ID: ' + s.id;
      document.getElementById('dMobile').textContent = s.mobile || '-';
      document.getElementById('dLang').textContent = (s.lang || 'en').toUpperCase();
      document.getElementById('dRefCode').textContent = s.refCode || 'None';
      document.getElementById('dVerticals').textContent = (s.verticals || []).join(', ') || 'Ecommerce';

      document.getElementById('dOwner').textContent = b.ownerName || '-';
      document.getElementById('dCategory').textContent = b.category || '-';
      document.getElementById('dAddress').textContent = b.address || '-';

      document.getElementById('dPan').textContent = s.pan?.panNumber || 'N/A';
      document.getElementById('dPanName').textContent = s.pan?.registeredName || 'N/A';
      document.getElementById('dGst').textContent = s.gst?.hasGst ? ('GSTIN: ' + s.gst.gstin) : ('Exempt (' + (s.gst?.nonGstReason || 'Declared') + ')');
      document.getElementById('dBankBeneficiary').textContent = s.bank?.beneficiaryName || 'N/A';
      document.getElementById('dBankIfsc').textContent = (s.bank?.ifsc || '') + ' · ' + (s.bank?.accountNumber ? '***' + s.bank.accountNumber.slice(-4) : '');
      document.getElementById('dBankScore').textContent = (s.bank?.nameMatchScore ?? 0) + '% Match';
      document.getElementById('dLicence').textContent = (s.licence?.type || 'Licence') + ': ' + (s.licence?.number || 'Pending');

      document.getElementById('dTier').textContent = s.tier || 'STARTER';
      document.getElementById('dDecision').textContent = s.decision || 'GREEN';
      document.getElementById('dStatus').textContent = s.status || 'Active';

      document.getElementById('drawerOverlay').classList.add('open');
    }

    function drawerAction(decision, tier) {
      if (!currentSellerId) return;
      decideSeller(currentSellerId, decision, tier, 'Updated via seller details drawer');
    }

    function closeDrawer(e) {
      document.getElementById('drawerOverlay').classList.remove('open');
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
  console.log(`  - Admin UI:  http://localhost:${PORT}/admin`);
  console.log(`  - Onboarding:http://localhost:${PORT}/seller.html`);
  console.log(`  - Leads:     ${LEADS_FILE}`);
  console.log(`  - Sellers:   ${SELLERS_FILE}`);
  console.log(`========================================\n`);
});
