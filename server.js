const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const requestIp = require('request-ip');
const axios = require('axios');
const useragent = require('useragent');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(requestIp.mw());

// Initialize Database - UPDATED with ALL new columns
const db = new sqlite3.Database('./anonymous_tracker.db', (err) => {
    if (!err) {
        // Create links table
        db.run(`CREATE TABLE IF NOT EXISTS links (
            id TEXT PRIMARY KEY, 
            target_url TEXT, 
            tracking_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            click_count INTEGER DEFAULT 0
        )`);
        
        // Create visitors table with ALL columns
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
            referer TEXT,
            traffic_source TEXT,
            device_type TEXT,
            os TEXT,
            browser TEXT,
            is_bot INTEGER DEFAULT 0,
            bot_name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(link_id) REFERENCES links(id)
        )`);
        
        // Add missing columns if they don't exist (for existing databases)
        const addColumnIfMissing = (column, type) => {
            db.run(`ALTER TABLE visitors ADD COLUMN ${column} ${type}`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.log(`Column ${column} already exists or added`);
                }
            });
        };
        
        // Try to add any missing columns
        setTimeout(() => {
            addColumnIfMissing('traffic_source', 'TEXT');
            addColumnIfMissing('device_type', 'TEXT');
            addColumnIfMissing('os', 'TEXT');
            addColumnIfMissing('browser', 'TEXT');
            addColumnIfMissing('is_bot', 'INTEGER DEFAULT 0');
            addColumnIfMissing('bot_name', 'TEXT');
        }, 1000);
    }
});

// Bot Detection - IMPROVED
function detectBot(userAgent) {
    const bots = {
        'Googlebot': ['Googlebot', 'Google-InspectionTool'],
        'Bingbot': ['bingbot', 'BingPreview'],
        'Yahoo': ['Yahoo! Slurp', 'YahooSeeker'],
        'DuckDuckGo': ['DuckDuckBot'],
        'Facebook': ['facebookexternalhit', 'Facebot'],
        'Twitter': ['Twitterbot'],
        'LinkedIn': ['LinkedInBot'],
        'Instagram': ['Instagram'],
        'Pinterest': ['Pinterestbot'],
        'Slack': ['Slackbot'],
        'Discord': ['Discordbot'],
        'Telegram': ['TelegramBot'],
        'Apple': ['Applebot'],
        'Baidu': ['Baiduspider'],
        'Yandex': ['YandexBot'],
        'Ahrefs': ['AhrefsBot'],
        'Semrush': ['SemrushBot'],
        'Headless': ['Headless', 'PhantomJS', 'Selenium', 'Puppeteer'],
        'Curl': ['curl'],
        'Wget': ['Wget'],
        'Python': ['Python-urllib', 'Python Requests']
    };

    if (!userAgent) return { isBot: false, botName: null };

    for (const [botName, patterns] of Object.entries(bots)) {
        for (const pattern of patterns) {
            if (userAgent.toLowerCase().includes(pattern.toLowerCase())) {
                return { isBot: true, botName: botName };
            }
        }
    }

    if (userAgent.includes('bot') || userAgent.includes('crawler') || 
        userAgent.includes('spider') || userAgent.includes('scraper')) {
        return { isBot: true, botName: 'Generic Bot' };
    }

    return { isBot: false, botName: null };
}

// Traffic Source Detection - IMPROVED
function detectTrafficSource(referer) {
    if (!referer || referer === 'Direct') return 'Direct';

    const sources = {
        'Google': ['google.com', 'google.', 'google.co'],
        'Bing': ['bing.com', 'bing.'],
        'Yahoo': ['yahoo.com', 'yahoo.'],
        'DuckDuckGo': ['duckduckgo.com'],
        'Facebook': ['facebook.com', 'fb.com', 'fb.me'],
        'Instagram': ['instagram.com', 'instagr.am'],
        'Twitter': ['twitter.com', 't.co', 'x.com'],
        'LinkedIn': ['linkedin.com', 'lnkd.in'],
        'YouTube': ['youtube.com', 'youtu.be'],
        'Pinterest': ['pinterest.com', 'pin.it'],
        'Reddit': ['reddit.com', 'redd.it'],
        'TikTok': ['tiktok.com', 'vm.tiktok.com'],
        'WhatsApp': ['whatsapp.com', 'wa.me'],
        'Telegram': ['telegram.org', 't.me'],
        'Discord': ['discord.com', 'discord.gg'],
        'Slack': ['slack.com'],
        'Medium': ['medium.com'],
        'Quora': ['quora.com'],
        'StackOverflow': ['stackoverflow.com'],
        'GitHub': ['github.com'],
        'ProductHunt': ['producthunt.com']
    };

    try {
        const domain = new URL(referer).hostname.toLowerCase();
        for (const [source, patterns] of Object.entries(sources)) {
            for (const pattern of patterns) {
                if (domain.includes(pattern)) {
                    return source;
                }
            }
        }
        return 'Website';
    } catch {
        return 'Unknown';
    }
}

// User-Agent Parser - IMPROVED
function parseUserAgent(userAgentStr) {
    if (!userAgentStr) return { device: 'Unknown', os: 'Unknown', browser: 'Unknown' };
    
    try {
        const ua = useragent.parse(userAgentStr);
        
        let device = 'Desktop';
        const family = ua.device.family || '';
        if (family !== 'Other') {
            if (family.includes('iPhone') || family.includes('iPad') || 
                family.includes('Android') || family.includes('Mobile')) {
                device = 'Mobile';
            } else if (family.includes('Tablet')) {
                device = 'Tablet';
            } else if (family) {
                device = family;
            }
        }

        return {
            device: device,
            os: (ua.os.family || 'Unknown') + ' ' + (ua.os.major || ''),
            browser: (ua.family || 'Unknown') + ' ' + (ua.major || '')
        };
    } catch {
        return { device: 'Unknown', os: 'Unknown', browser: 'Unknown' };
    }
}

// Home Page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Anonymous Link Generator</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
                * { box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 500px; margin: 50px auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); text-align: center; }
                h2 { color: #1a1a1a; margin-bottom: 30px; }
                input[type="url"] { width: 100%; padding: 12px; border: 2px solid #ddd; border-radius: 6px; font-size: 16px; }
                input[type="url"]:focus { border-color: #0066cc; outline: none; }
                button { padding: 12px 30px; background: #0066cc; color: white; border: none; border-radius: 6px; font-size: 16px; cursor: pointer; }
                button:hover { background: #004d99; }
                .note { font-size: 14px; color: #666; margin-top: 20px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🕵️ Advanced Anonymous Link Generator</h2>
                <form action="/generate" method="POST">
                    <input type="url" name="url" placeholder="Paste link to track here..." required>
                    <br><br>
                    <button type="submit">Create Anonymous Link</button>
                </form>
                <p class="note">Track every click with bot detection & traffic analysis</p>
            </div>
        </body>
        </html>
    `);
});

// Generate Links
app.post('/generate', (req, res) => {
    const targetUrl = req.body.url;
    
    try {
        new URL(targetUrl);
    } catch (e) {
        return res.send(`
            <div style="font-family:Arial; max-width:500px; margin:50px auto; text-align:center; padding:20px; background:white; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                <h3 style="color:red;">❌ Invalid URL</h3>
                <p>Please enter a valid URL including http:// or https://</p>
                <a href="/">← Go Back</a>
            </div>
        `);
    }
    
    const linkId = crypto.randomBytes(4).toString('hex'); 
    const trackingId = crypto.randomBytes(6).toString('hex'); 
    const host = req.get('host');
    const protocol = req.protocol;

    db.run(`INSERT INTO links (id, target_url, tracking_id) VALUES (?, ?, ?)`, [linkId, targetUrl, trackingId], (err) => {
        if (err) {
            console.error("Database error:", err);
            return res.send(`
                <div style="font-family:Arial; max-width:500px; margin:50px auto; text-align:center; padding:20px; background:white; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                    <h3 style="color:red;">❌ Error</h3>
                    <p>Failed to generate link. Please try again.</p>
                    <a href="/">← Go Back</a>
                </div>
            `);
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Link Generated</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                    .container { max-width: 600px; margin: 50px auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h3 { color: #1a1a1a; }
                    .link-box { background: #f8f8f8; padding: 12px; border-radius: 6px; margin: 10px 0; border-left: 4px solid #ff4444; }
                    .link-box.green { border-left-color: #00a854; }
                    input[type="text"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; background: white; }
                    .copy-btn { margin-top: 8px; padding: 6px 12px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
                    .copy-btn:hover { background: #e0e0e0; }
                    .back-link { display: inline-block; margin-top: 20px; color: #0066cc; text-decoration: none; }
                    .back-link:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h3>✅ Your Anonymous Link is Generated!</h3>
                    
                    <p><strong>🔗 Send this link to your target:</strong></p>
                    <div class="link-box">
                        <input type="text" id="trackLink" value="${protocol}://${host}/v/${linkId}" readonly>
                        <br>
                        <button class="copy-btn" onclick="copyToClipboard('trackLink')">📋 Copy Link</button>
                    </div>
                    
                    <p><strong>🔒 Keep this private link to see who clicks:</strong></p>
                    <div class="link-box green">
                        <input type="text" id="resultsLink" value="${protocol}://${host}/results/${trackingId}" readonly>
                        <br>
                        <button class="copy-btn" onclick="copyToClipboard('resultsLink')">📋 Copy Link</button>
                    </div>
                    
                    <p style="font-size:14px; color:#666; margin-top:20px;">
                        ⚠️ Save the results link now! You won't see it again.
                    </p>
                    
                    <a href="/" class="back-link">← Create Another Link</a>
                </div>
                
                <script>
                    function copyToClipboard(elementId) {
                        const input = document.getElementById(elementId);
                        input.select();
                        document.execCommand('copy');
                        alert('Link copied to clipboard!');
                    }
                </script>
            </body>
            </html>
        `);
    });
});

// Tracking Endpoint - UPDATED with ALL data
app.get('/v/:id', async (req, res) => {
    const linkId = req.params.id;
    let clientIp = req.clientIp; 
    const userAgent = req.headers['user-agent']; 
    const referer = req.headers['referer'] || 'Direct';
    const timestamp = new Date().toISOString();

    if (clientIp === '::1' || clientIp === '127.0.0.1' || clientIp === '::ffff:127.0.0.1') {
        clientIp = '8.8.8.8';
    }

    try {
        const row = await new Promise((resolve, reject) => {
            db.get(`SELECT target_url FROM links WHERE id = ?`, [linkId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!row) {
            return res.status(404).send(`
                <div style="font-family:Arial; max-width:500px; margin:50px auto; text-align:center; padding:20px; background:white; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                    <h3 style="color:red;">❌ Link Expired or Invalid</h3>
                    <a href="/">← Go Home</a>
                </div>
            `);
        }

        db.run(`UPDATE links SET click_count = click_count + 1 WHERE id = ?`, [linkId]);

        let country = "Unknown", city = "Unknown", region = "Unknown", isp = "Unknown";

        try {
            const geoResponse = await axios.get(`http://ip-api.com/json/${clientIp}?fields=status,country,city,regionName,isp`, {
                timeout: 5000
            });
            
            if (geoResponse.data && geoResponse.data.status === 'success') {
                country = geoResponse.data.country || "Unknown";
                city = geoResponse.data.city || "Unknown";
                region = geoResponse.data.regionName || "Unknown";
                isp = geoResponse.data.isp || "Unknown";
            }
        } catch (error) {
            console.error("Geocoding failed for IP:", clientIp);
        }

        const botInfo = detectBot(userAgent);
        const trafficSource = detectTrafficSource(referer);
        const parsedUA = parseUserAgent(userAgent);

        // Insert with ALL columns
        db.run(`INSERT INTO visitors (
            link_id, timestamp, ip, country, city, region, isp, user_agent, referer, 
            traffic_source, device_type, os, browser, is_bot, bot_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
            [
                linkId, timestamp, clientIp, country, city, region, isp, userAgent, referer,
                trafficSource, parsedUA.device, parsedUA.os, parsedUA.browser,
                botInfo.isBot ? 1 : 0, botInfo.botName
            ], 
            (err) => {
                if (err) {
                    console.error("Failed to save visitor data:", err);
                }
                res.redirect(row.target_url);
            }
        );
    } catch (error) {
        console.error("Error processing link:", error);
        res.status(500).send("An error occurred.");
    }
});

// Results Page - UPDATED with ALL columns
app.get('/results/:trackingId', (req, res) => {
    const trackingId = req.params.trackingId;

    db.get(`SELECT id, target_url, created_at, click_count FROM links WHERE tracking_id = ?`, [trackingId], (err, link) => {
        if (err || !link) {
            return res.status(404).send(`
                <div style="font-family:Arial; max-width:500px; margin:50px auto; text-align:center; padding:20px; background:white; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                    <h3 style="color:red;">❌ Tracking session not found</h3>
                    <a href="/">← Go Home</a>
                </div>
            `);
        }

        db.all(`SELECT * FROM visitors WHERE link_id = ? ORDER BY timestamp DESC`, [link.id], (err, visitors) => {
            if (err) {
                console.error("Error fetching visitors:", err);
                visitors = [];
            }

            const uniqueIPs = new Set(visitors.map(v => v.ip));
            const uniqueVisitors = uniqueIPs.size;
            const botVisits = visitors.filter(v => v.is_bot === 1);
            const humanVisits = visitors.filter(v => v.is_bot === 0);

            const sourceStats = visitors.reduce((acc, v) => {
                const source = v.traffic_source || 'Direct';
                acc[source] = (acc[source] || 0) + 1;
                return acc;
            }, {});

            let sourceBadges = '';
            for (const [source, count] of Object.entries(sourceStats)) {
                const percentage = visitors.length > 0 ? ((count / visitors.length) * 100).toFixed(1) : 0;
                sourceBadges += `<span style="display:inline-block; background:#e8f4fd; padding:5px 12px; border-radius:20px; margin:3px; font-size:13px;">
                    ${source}: ${count} (${percentage}%)
                </span>`;
            }

            let logRows = visitors.map(v => {
                const botBadge = v.is_bot ? 
                    `🤖 <span style="color:#e74c3c;font-weight:bold;">${v.bot_name || 'Bot'}</span>` : 
                    '👤 Human';
                
                return `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px; font-size:12px;">${new Date(v.timestamp).toLocaleString()}</td>
                    <td style="padding:8px; color:#d63031; font-weight:bold; font-size:13px;">${v.ip}</td>
                    <td style="padding:8px; font-size:12px;">${v.city || 'Unknown'}, ${v.region || ''}<br><span style="color:#666;font-size:11px;">${v.country || 'Unknown'}</span></td>
                    <td style="padding:8px; color:#555; font-size:12px;">${v.isp || 'Unknown'}</td>
                    <td style="padding:8px; font-size:12px;">${v.device_type || 'Unknown'}<br><span style="color:#888;font-size:10px;">${v.os || ''}</span></td>
                    <td style="padding:8px; font-size:12px; color:#666;">${v.browser || 'Unknown'}</td>
                    <td style="padding:8px; font-size:12px; font-weight:bold; color:#2980b9;">${v.traffic_source || 'Direct'}</td>
                    <td style="padding:8px; text-align:center; font-size:12px;">${botBadge}</td>
                    <td style="padding:8px; font-size:11px; color:#888; max-width:100px; word-break:break-all;">${v.referer || 'Direct'}</td>
                </tr>`;
            }).join('');

            res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Traffic Analytics</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>
                        * { box-sizing: border-box; }
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                        .container { max-width: 1400px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                        h2 { color: #1a1a1a; margin-top: 0; }
                        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
                        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
                        .stat-card .number { font-size: 28px; font-weight: bold; color: #0066cc; }
                        .stat-card .label { font-size: 13px; color: #666; margin-top: 5px; }
                        .stat-card .number.green { color: #00a854; }
                        .stat-card .number.orange { color: #e17055; }
                        .stat-card .number.red { color: #e74c3c; }
                        .stat-card .number.purple { color: #8e44ad; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
                        th { background: #f4f4f4; padding: 10px; text-align: left; font-weight: 600; border-bottom: 2px solid #ddd; position: sticky; top: 0; }
                        td { padding: 10px; border-bottom: 1px solid #eee; }
                        tr:hover { background: #fafafa; }
                        .source-badges { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
                        .back-link { display: inline-block; margin-top: 20px; color: #0066cc; text-decoration: none; }
                        .back-link:hover { text-decoration: underline; }
                        @media (max-width: 768px) {
                            .container { padding: 15px; }
                            table { font-size: 10px; }
                            td, th { padding: 6px; }
                            .stats-grid { grid-template-columns: repeat(2, 1fr); }
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h2>📊 Advanced Traffic Analytics</h2>
                        <p><strong>Tracking ID:</strong> ${link.id}</p>
                        <p><strong>Destination:</strong> <a href="${link.target_url}" target="_blank">${link.target_url}</a></p>
                        <p style="font-size:13px; color:#666;"><strong>Created:</strong> ${new Date(link.created_at).toLocaleString()}</p>
                        
                        <div class="stats-grid">
                            <div class="stat-card">
                                <div class="number">${visitors.length}</div>
                                <div class="label">Total Clicks</div>
                            </div>
                            <div class="stat-card">
                                <div class="number green">${uniqueVisitors}</div>
                                <div class="label">Unique Visitors</div>
                            </div>
                            <div class="stat-card">
                                <div class="number orange">${humanVisits.length}</div>
                                <div class="label">👤 Human Visitors</div>
                            </div>
                            <div class="stat-card">
                                <div class="number red">${botVisits.length}</div>
                                <div class="label">🤖 Bots Detected</div>
                            </div>
                            <div class="stat-card">
                                <div class="number purple">${Object.keys(sourceStats).length}</div>
                                <div class="label">Traffic Sources</div>
                            </div>
                        </div>

                        <div class="source-badges">
                            <strong>📊 Traffic Sources:</strong><br>
                            ${sourceBadges || 'No data yet'}
                        </div>
                        
                        <h3>📋 Visitor Log</h3>
                        <div style="overflow-x:auto; max-height:500px; overflow-y:auto;">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>IP</th>
                                        <th>Location</th>
                                        <th>ISP</th>
                                        <th>Device</th>
                                        <th>Browser</th>
                                        <th>Source</th>
                                        <th>Bot Status</th>
                                        <th>Referer</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${logRows || '<tr><td colspan="9" style="text-align:center; padding:40px;">🤔 Nobody has clicked your link yet!</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                        
                        <a href="/" class="back-link">← Create New Link</a>
                    </div>
                </body>
                </html>
            `);
        });
    });
});

// Health Check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).send(`
        <div style="font-family:Arial; max-width:500px; margin:50px auto; text-align:center; padding:20px; background:white; border-radius:12px; box-shadow:0 4px 6px rgba(0,0,0,0.1);">
            <h3 style="color:red;">❌ Server Error</h3>
            <p>Something went wrong. Please try again later.</p>
            <a href="/">← Go Home</a>
        </div>
    `);
});

app.listen(PORT, () => console.log(`🕵️ Advanced tracking server running on port ${PORT}`));
