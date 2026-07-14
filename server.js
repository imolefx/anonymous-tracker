const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const requestIp = require('request-ip');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(requestIp.mw());

// Database
const db = new sqlite3.Database('./anonymous_tracker.db', (err) => {
    if (!err) {
        db.run(`CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY, 
            target_url TEXT, 
            tracking_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS visitors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            link_id TEXT, 
            timestamp TEXT, 
            ip TEXT, 
            country TEXT,
            city TEXT,
            region TEXT,
            isp TEXT,
            user_agent TEXT,
            referer TEXT
        )`);
        console.log('✅ Database ready');
    }
});

// ============================================
// HOME PAGE
// ============================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Anonymous Link Tracker</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f1a; color: #eef2f8; margin: 0; padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
                .container { max-width: 500px; width: 100%; background: rgba(16,22,40,0.8); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.06); text-align: center; }
                h2 { font-size: 24px; margin-bottom: 8px; }
                p.sub { color: #8892b0; font-size: 14px; margin-bottom: 24px; }
                input[type="url"] { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid #2a2f45; background: #141a2b; color: white; font-size: 15px; }
                input[type="url"]:focus { outline: none; border-color: #4f8cff; }
                button { width: 100%; padding: 14px; margin-top: 14px; border-radius: 12px; border: none; background: #4f8cff; color: white; font-size: 16px; font-weight: 600; cursor: pointer; }
                button:hover { background: #3a70d9; }
                .features { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin-top: 20px; }
                .features span { background: rgba(79,140,255,0.12); color: #7aa3ff; padding: 4px 12px; border-radius: 20px; font-size: 11px; }
                .youtube-link { color: #ff4444; text-decoration: none; font-weight: bold; }
                .youtube-link:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🕵️ Anonymous Link Tracker</h2>
                <p class="sub">Track who clicks your links with location data</p>
                <form action="/generate" method="POST">
                    <input type="url" name="url" placeholder="https://example.com" required>
                    <button type="submit">Create Tracking Link</button>
                </form>
                <div class="features">
                    <span>📍 Location</span>
                    <span>🌐 ISP</span>
                    <span>📱 Device</span>
                    <span>👁️ Every View</span>
                </div>
                <p style="margin-top: 20px; font-size: 12px; color: #8892b0;">
                    📺 <a href="https://www.youtube.com/@Imole_Fx" target="_blank" class="youtube-link">@Imole_Fx on YouTube</a>
                </p>
            </div>
        </body>
        </html>
    `);
});

// ============================================
// GENERATE LINK
// ============================================
app.post('/generate', (req, res) => {
    const targetUrl = req.body.url;
    
    try { new URL(targetUrl); } catch {
        return res.send(`<h3>❌ Invalid URL</h3><a href="/">← Go Back</a>`);
    }
    
    const linkId = crypto.randomBytes(4).toString('hex');
    const trackingId = crypto.randomBytes(6).toString('hex');
    const host = req.get('host');
    const protocol = req.protocol;

    db.run(`INSERT INTO links (id, target_url, tracking_id) VALUES (?, ?, ?)`, [linkId, targetUrl, trackingId], (err) => {
        if (err) {
            console.error(err);
            return res.send(`<h3>❌ Error creating link</h3><a href="/">← Go Back</a>`);
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Link Generated</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f1a; color: #eef2f8; margin: 0; padding: 20px; display: flex; justify-content: center; }
                    .container { max-width: 600px; background: rgba(16,22,40,0.8); backdrop-filter: blur(12px); padding: 40px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.06); }
                    .box { background: #141a2b; padding: 16px; border-radius: 12px; margin: 12px 0; border-left: 4px solid #4f8cff; }
                    .box.green { border-left-color: #34d399; }
                    input { width: 100%; padding: 10px; border-radius: 8px; border: none; background: #0b0f1a; color: white; font-size: 14px; }
                    .btn { padding: 6px 16px; background: #2a2f45; border: none; border-radius: 8px; color: white; cursor: pointer; margin-top: 8px; }
                    a { color: #4f8cff; text-decoration: none; }
                    .note { color: #8892b0; font-size: 13px; margin-top: 16px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h3>✅ Link Generated</h3>
                    <p><strong>🔗 Send this link:</strong></p>
                    <div class="box">
                        <input type="text" id="trackLink" value="${protocol}://${host}/v/${linkId}" readonly>
                        <br>
                        <button class="btn" onclick="copy('trackLink')">📋 Copy Link</button>
                    </div>
                    <p><strong>🔒 Your results link (keep private):</strong></p>
                    <div class="box green">
                        <input type="text" id="resultsLink" value="${protocol}://${host}/results/${trackingId}" readonly>
                        <br>
                        <button class="btn" onclick="copy('resultsLink')">📋 Copy Link</button>
                    </div>
                    <p class="note">⚠️ Save the results link now! You won't see it again.</p>
                    <a href="/">← Create Another Link</a>
                </div>
                <script>
                    function copy(id) {
                        const el = document.getElementById(id);
                        el.select();
                        document.execCommand('copy');
                        alert('Link copied!');
                    }
                </script>
            </body>
            </html>
        `);
    });
});

// ============================================
// TRACKING ENDPOINT - SIMPLE & FAST
// ============================================
app.get('/v/:id', (req, res) => {
    const linkId = req.params.id;
    let clientIp = req.clientIp || req.headers['x-forwarded-for'] || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const referer = req.headers['referer'] || 'Direct';
    const timestamp = new Date().toISOString();

    // Fix for localhost
    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') {
        clientIp = '8.8.8.8';
    }

    // Get the target URL
    db.get(`SELECT target_url FROM links WHERE id = ?`, [linkId], (err, row) => {
        if (err || !row) {
            return res.status(404).send(`<h3>❌ Link not found</h3><a href="/">← Home</a>`);
        }

        // Save visitor data (don't wait for it to complete)
        const saveVisitor = () => {
            // Get location data
            axios.get(`http://ip-api.com/json/${clientIp}?fields=status,country,city,regionName,isp`, {
                timeout: 2000
            })
            .then(geoResponse => {
                if (geoResponse.data && geoResponse.data.status === 'success') {
                    const country = geoResponse.data.country || 'Unknown';
                    const city = geoResponse.data.city || 'Unknown';
                    const region = geoResponse.data.regionName || 'Unknown';
                    const isp = geoResponse.data.isp || 'Unknown';
                    
                    db.run(`INSERT INTO visitors (link_id, timestamp, ip, country, city, region, isp, user_agent, referer) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [linkId, timestamp, clientIp, country, city, region, isp, userAgent, referer],
                        (err) => { if (err) console.error('DB error:', err); }
                    );
                }
            })
            .catch(() => {
                // Save without location data
                db.run(`INSERT INTO visitors (link_id, timestamp, ip, user_agent, referer) 
                        VALUES (?, ?, ?, ?, ?)`,
                    [linkId, timestamp, clientIp, userAgent, referer],
                    (err) => { if (err) console.error('DB error:', err); }
                );
            });
        };

        // Start saving in background
        saveVisitor();

        // IMMEDIATELY REDIRECT - THIS IS THE KEY FIX
        return res.redirect(row.target_url);
    });
});

// ============================================
// RESULTS PAGE
// ============================================
app.get('/results/:trackingId', (req, res) => {
    const trackingId = req.params.trackingId;

    db.get(`SELECT id, target_url, created_at FROM links WHERE tracking_id = ?`, [trackingId], (err, link) => {
        if (err || !link) {
            return res.status(404).send(`<h3>❌ Not found</h3><a href="/">← Home</a>`);
        }

        db.all(`SELECT timestamp, ip, country, city, region, isp, user_agent, referer 
                FROM visitors WHERE link_id = ? ORDER BY timestamp DESC`, [link.id], (err, visitors) => {
            
            if (err) visitors = [];

            const uniqueIPs = new Set(visitors.map(v => v.ip));
            const uniqueVisitors = uniqueIPs.size;

            let rows = visitors.map(v => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                    <td style="padding:10px;font-size:12px;">${new Date(v.timestamp).toLocaleString()}</td>
                    <td style="padding:10px;color:#4f8cff;font-size:13px;">${v.ip}</td>
                    <td style="padding:10px;font-size:12px;">${v.city || '—'}, ${v.region || ''}<br><span style="color:#8892b0;font-size:10px;">${v.country || '—'}</span></td>
                    <td style="padding:10px;font-size:12px;color:#8892b0;">${v.isp || '—'}</td>
                    <td style="padding:10px;font-size:11px;color:#8892b0;max-width:200px;word-break:break-all;">${v.user_agent || 'Unknown'}</td>
                    <td style="padding:10px;font-size:11px;color:#666;max-width:150px;word-break:break-all;">${v.referer || 'Direct'}</td>
                </tr>`).join('');

            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>📊 Analytics</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        * { box-sizing: border-box; }
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f1a; color: #eef2f8; margin: 0; padding: 20px; }
                        .container { max-width: 1200px; margin: 0 auto; background: rgba(16,22,40,0.8); backdrop-filter: blur(12px); padding: 30px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.06); }
                        h2 { margin-top: 0; }
                        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); gap: 12px; margin: 20px 0; }
                        .stat { background: rgba(255,255,255,0.04); padding: 14px; border-radius: 14px; text-align: center; }
                        .stat .num { font-size: 28px; font-weight: 700; color: #4f8cff; }
                        .stat .num.green { color: #34d399; }
                        .stat .lbl { font-size: 11px; color: #8892b0; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
                        table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
                        th { text-align: left; padding: 10px; background: rgba(255,255,255,0.06); font-weight: 600; color: #8892b0; font-size: 10px; text-transform: uppercase; }
                        td { padding: 10px; }
                        .empty { text-align: center; padding: 40px; color: #8892b0; }
                        a { color: #4f8cff; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                        .back { display: inline-block; margin-top: 20px; }
                        .youtube-link { color: #ff4444; text-decoration: none; }
                        .youtube-link:hover { text-decoration: underline; }
                        @media (max-width: 768px) {
                            .container { padding: 16px; }
                            table { font-size: 10px; }
                            td, th { padding: 6px; }
                            .stats { grid-template-columns: repeat(2,1fr); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>📊 Traffic Analytics</h2>
                        <p><strong>Destination:</strong> <a href="${link.target_url}" target="_blank">${link.target_url}</a></p>
                        <p style="color:#8892b0;font-size:13px;">Created: ${new Date(link.created_at).toLocaleString()}</p>
                        
                        <div class="stats">
                            <div class="stat"><div class="num">${visitors.length}</div><div class="lbl">Total Clicks</div></div>
                            <div class="stat"><div class="num green">${uniqueVisitors}</div><div class="lbl">Unique Visitors</div></div>
                        </div>
                        
                        <h3>Visitor Log</h3>
                        <div style="overflow-x:auto;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>IP</th>
                                        <th>Location</th>
                                        <th>ISP</th>
                                        <th>Device</th>
                                        <th>Referer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rows || '<tr><td colspan="6" class="empty">No visits yet.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                        <a href="/" class="back">← Create New Link</a>
                        <p style="margin-top: 20px; font-size: 12px; color: #8892b0;">
                            📺 <a href="https://www.youtube.com/@Imole_Fx" target="_blank" class="youtube-link">@Imole_Fx on YouTube</a>
                        </p>
                    </div>
                </body>
                </html>
            `);
        });
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`🕵️ Anonymous tracker running on port ${PORT}`));
