const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const requestIp = require('request-ip');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(requestIp.mw());

// ============================================================
// DATABASE CONNECTION
// ============================================================
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initDatabase() {
    try {
        // Links table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS links (
                id TEXT PRIMARY KEY,
                target_url TEXT,
                tracking_id TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Visits table with ALL columns
        await pool.query(`
            CREATE TABLE IF NOT EXISTS visits (
                id SERIAL PRIMARY KEY,
                link_id TEXT,
                timestamp TIMESTAMP,
                ip TEXT,
                country TEXT,
                city TEXT,
                region TEXT,
                isp TEXT,
                user_agent TEXT,
                referer TEXT,
                os_name TEXT,
                os_version TEXT,
                device_type TEXT,
                device_vendor TEXT,
                device_model TEXT,
                browser_name TEXT,
                browser_version TEXT,
                cpu_cores TEXT,
                ram TEXT,
                gpu TEXT,
                touch_support TEXT,
                screen_width INTEGER,
                screen_height INTEGER,
                color_depth TEXT,
                pixel_ratio REAL,
                timezone TEXT,
                language TEXT,
                cookies_enabled TEXT,
                do_not_track TEXT,
                canvas_hash TEXT,
                fonts TEXT,
                plugins TEXT,
                webgl_vendor TEXT,
                webgl_renderer TEXT,
                is_bot INTEGER DEFAULT 0,
                bot_name TEXT,
                traffic_source TEXT,
                FOREIGN KEY(link_id) REFERENCES links(id)
            )
        `);

        // Add any missing columns (for existing databases)
        const columns = [
            'webgl_vendor TEXT',
            'webgl_renderer TEXT',
            'canvas_hash TEXT',
            'fonts TEXT',
            'plugins TEXT',
            'color_depth TEXT',
            'pixel_ratio REAL',
            'touch_support TEXT',
            'cookies_enabled TEXT',
            'do_not_track TEXT'
        ];

        for (const col of columns) {
            try {
                await pool.query(`ALTER TABLE visits ADD COLUMN ${col}`);
                console.log(`✅ Added column: ${col.split(' ')[0]}`);
            } catch (err) {
                // Column already exists - ignore
            }
        }

        console.log('✅ Database tables ready');
    } catch (err) {
        console.error('❌ Database init error:', err);
    }
}

initDatabase();

// ============================================================
// BOT DETECTION
// ============================================================
function detectBot(ua) {
    if (!ua) return { isBot: false, botName: null };

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
        'MJ12': ['MJ12bot'],
        'Screaming Frog': ['Screaming Frog'],
        'Pingdom': ['Pingdom'],
        'UptimeRobot': ['UptimeRobot'],
        'Site24x7': ['Site24x7'],
        'NewRelic': ['NewRelic'],
        'Cloudflare': ['Cloudflare'],
        'Headless': ['Headless', 'PhantomJS', 'Selenium', 'Puppeteer'],
        'Curl': ['curl'],
        'Wget': ['Wget'],
        'Python': ['Python-urllib', 'Python Requests'],
        'Java': ['Java'],
        'Ruby': ['Ruby'],
        'Go': ['Go-http-client'],
        'Node': ['Node.js', 'node-fetch'],
        'Nmap': ['Nmap', 'masscan']
    };

    for (const [botName, patterns] of Object.entries(bots)) {
        for (const pattern of patterns) {
            if (ua.toLowerCase().includes(pattern.toLowerCase())) {
                return { isBot: true, botName: botName };
            }
        }
    }

    if (ua.includes('bot') || ua.includes('crawler') ||
        ua.includes('spider') || ua.includes('scraper')) {
        return { isBot: true, botName: 'Generic Bot' };
    }

    return { isBot: false, botName: null };
}

// ============================================================
// TRAFFIC SOURCE DETECTION
// ============================================================
function detectTrafficSource(referer) {
    if (!referer || referer === 'Direct' || referer === '') return 'Direct';

    try {
        const domain = new URL(referer).hostname.toLowerCase();
        const sources = {
            'Google': ['google.com', 'google.', 'google.co'],
            'Bing': ['bing.com'],
            'Yahoo': ['yahoo.com'],
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
            'ProductHunt': ['producthunt.com'],
            'HackerNews': ['news.ycombinator.com']
        };

        for (const [source, patterns] of Object.entries(sources)) {
            for (const pattern of patterns) {
                if (domain.includes(pattern)) return source;
            }
        }
        return 'Website';
    } catch {
        return 'Unknown';
    }
}

// ============================================================
// HOME PAGE
// ============================================================
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Advanced Link Tracker</title>
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
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🕵️ Advanced Link Tracker</h2>
                <p class="sub">Full device fingerprint · Bot detection · Every view counted</p>
                <form action="/generate" method="POST">
                    <input type="url" name="url" placeholder="https://example.com" required>
                    <button type="submit">Create Tracking Link</button>
                </form>
                <div class="features">
                    <span>📱 Device Info</span>
                    <span>🖥️ Screen</span>
                    <span>🧠 Hardware</span>
                    <span>🤖 Bot Detection</span>
                    <span>👁️ Every View</span>
                </div>
            </div>
        </body>
        </html>
    `);
});

// ============================================================
// GENERATE LINK
// ============================================================
app.post('/generate', async (req, res) => {
    const targetUrl = req.body.url;
    try { new URL(targetUrl); } catch {
        return res.send(`<h3>❌ Invalid URL</h3><a href="/">← Back</a>`);
    }

    const linkId = crypto.randomBytes(4).toString('hex');
    const trackingId = crypto.randomBytes(6).toString('hex');
    const host = req.get('host');
    const protocol = req.protocol;

    try {
        await pool.query(
            `INSERT INTO links (id, target_url, tracking_id) VALUES ($1, $2, $3)`,
            [linkId, targetUrl, trackingId]
        );

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>Link Generated</title>
            <style>
                body { font-family: -apple-system, sans-serif; background: #0b0f1a; color: #eef2f8; padding: 40px; display: flex; justify-content: center; }
                .container { max-width: 600px; background: rgba(16,22,40,0.8); padding: 40px; border-radius: 24px; }
                .box { background: #141a2b; padding: 16px; border-radius: 12px; margin: 12px 0; border-left: 4px solid #4f8cff; }
                .box.green { border-left-color: #34d399; }
                input { width: 100%; padding: 10px; border-radius: 8px; border: none; background: #0b0f1a; color: white; font-size: 14px; }
                .btn { padding: 6px 16px; background: #2a2f45; border: none; border-radius: 8px; color: white; cursor: pointer; margin-top: 8px; }
                a { color: #4f8cff; text-decoration: none; }
            </style>
            </head>
            <body>
            <div class="container">
                <h3>✅ Link Generated</h3>
                <p><strong>🔗 Send this link:</strong></p>
                <div class="box">
                    <input type="text" id="trackLink" value="${protocol}://${host}/v/${linkId}" readonly>
                    <br><button class="btn" onclick="copy('trackLink')">📋 Copy</button>
                </div>
                <p><strong>🔒 Your results link (keep private):</strong></p>
                <div class="box green">
                    <input type="text" id="resultsLink" value="${protocol}://${host}/results/${trackingId}" readonly>
                    <br><button class="btn" onclick="copy('resultsLink')">📋 Copy</button>
                </div>
                <p style="color:#8892b0;font-size:13px;">⚠️ Save the results link now — you won't see it again.</p>
                <a href="/">← Create another</a>
            </div>
            <script>
                function copy(id) {
                    const el = document.getElementById(id);
                    el.select();
                    document.execCommand('copy');
                    alert('Copied!');
                }
            </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Error creating link:', err);
        res.send('Error creating link.');
    }
});

// ============================================================
// TRACKING ENDPOINT
// ============================================================
app.get('/v/:id', async (req, res) => {
    const linkId = req.params.id;

    try {
        const result = await pool.query(
            `SELECT target_url FROM links WHERE id = $1`,
            [linkId]
        );

        if (result.rows.length === 0) {
            return res.status(404).send(`<h3>❌ Link not found</h3><a href="/">← Home</a>`);
        }

        const targetUrl = result.rows[0].target_url;

        if (Object.keys(req.query).length > 0) {
            await processVisit(linkId, targetUrl, req);
            return res.redirect(targetUrl);
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head><meta charset="UTF-8"></head>
            <body>
                <script>
                    (function() {
                        function getDeviceData() {
                            const data = {};

                            // Screen
                            data.sw = screen.width;
                            data.sh = screen.height;
                            data.cd = screen.colorDepth;
                            data.pr = window.devicePixelRatio || 1;

                            // Hardware
                            data.cc = navigator.hardwareConcurrency || 'Unknown';
                            data.ram = navigator.deviceMemory ? navigator.deviceMemory + ' GB' : 'Unknown';
                            data.ts = ('ontouchstart' in window || navigator.maxTouchPoints > 0) ? 'Yes' : 'No';

                            // Advanced
                            data.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
                            data.lang = navigator.language || 'Unknown';
                            data.cookies = navigator.cookieEnabled ? 'Yes' : 'No';
                            data.dnt = navigator.doNotTrack || 'Not set';

                            // Canvas Fingerprint
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = 256;
                                canvas.height = 64;
                                const ctx = canvas.getContext('2d');
                                ctx.textBaseline = 'top';
                                ctx.font = '14px Arial';
                                ctx.fillStyle = '#f60';
                                ctx.fillRect(125, 1, 62, 20);
                                ctx.fillStyle = '#069';
                                ctx.fillText('🖐️ Fingerprint!', 2, 15);
                                ctx.fillStyle = 'rgba(102,204,0,0.7)';
                                ctx.fillText('Canvas', 4, 17);
                                ctx.fillStyle = '#c06';
                                ctx.fillText('Test', 140, 25);
                                ctx.beginPath();
                                ctx.arc(50, 50, 20, 0, Math.PI * 2);
                                ctx.fillStyle = '#0E45EB';
                                ctx.fill();
                                const dataURL = canvas.toDataURL();
                                let hash = 0;
                                for (let i = 0; i < dataURL.length; i++) {
                                    const char = dataURL.charCodeAt(i);
                                    hash = ((hash << 5) - hash) + char;
                                    hash = hash & hash;
                                }
                                data.canvas = 'canvas_' + Math.abs(hash).toString(16).padStart(8, '0');
                            } catch {
                                data.canvas = 'error';
                            }

                            // Fonts
                            try {
                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                const testString = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                                const fontList = ['Arial','Helvetica','Times New Roman','Verdana','Georgia',
                                    'Courier New','Trebuchet MS','Tahoma','Calibri','Candara',
                                    'Garamond','Palatino Linotype','Comic Sans MS','Impact',
                                    'Lucida Sans','Segoe UI','Roboto','Open Sans','Lato',
                                    'Montserrat','Poppins','Inter','Manrope','Space Grotesk',
                                    'SF Pro Display','Helvetica Neue','Consolas','Fira Code','JetBrains Mono'];
                                const installed = [];
                                for (const font of fontList) {
                                    ctx.font = '72px "' + font + '", Arial';
                                    const testWidth = ctx.measureText(testString).width;
                                    ctx.font = '72px Arial';
                                    const defaultWidth = ctx.measureText(testString).width;
                                    if (testWidth !== defaultWidth) {
                                        installed.push(font);
                                    }
                                }
                                data.fonts = installed.join(',');
                            } catch {
                                data.fonts = '';
                            }

                            // Plugins
                            try {
                                const plugins = [];
                                for (let i = 0; i < navigator.plugins.length; i++) {
                                    plugins.push(navigator.plugins[i].name);
                                }
                                data.plugins = plugins.join(',');
                            } catch {
                                data.plugins = '';
                            }

                            // WebGL / GPU
                            try {
                                const canvas = document.createElement('canvas');
                                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                                if (gl) {
                                    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                                    if (debugInfo) {
                                        data.webgl_vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
                                        data.webgl_renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
                                        data.gpu = data.webgl_renderer;
                                    }
                                }
                            } catch {
                                data.gpu = 'Unknown';
                            }

                            return data;
                        }

                        const data = getDeviceData();
                        const params = new URLSearchParams(data).toString();
                        const currentUrl = window.location.href;
                        const separator = currentUrl.includes('?') ? '&' : '?';
                        window.location.href = currentUrl + separator + params;
                    })();
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Tracking error:', err);
        res.status(500).send('An error occurred.');
    }
});

// ============================================================
// PROCESS VISIT
// ============================================================
async function processVisit(linkId, targetUrl, req) {
    const clientIp = req.clientIp || 'Unknown';
    const userAgent = req.headers['user-agent'] || '';
    const referer = req.headers['referer'] || 'Direct';
    const timestamp = new Date().toISOString();
    const query = req.query;

    let ip = clientIp;
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') {
        ip = '8.8.8.8';
    }

    const parser = new UAParser(userAgent);
    const uaResult = parser.getResult();

    // Geo IP
    let country = 'Unknown', city = 'Unknown', region = 'Unknown', isp = 'Unknown';
    try {
        const geo = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,regionName,isp`, { timeout: 5000 });
        if (geo.data && geo.data.status === 'success') {
            country = geo.data.country || 'Unknown';
            city = geo.data.city || 'Unknown';
            region = geo.data.regionName || 'Unknown';
            isp = geo.data.isp || 'Unknown';
        }
    } catch {}

    const botInfo = detectBot(userAgent);
    const trafficSource = detectTrafficSource(referer);

    const osName = uaResult.os.name || 'Unknown';
    const osVersion = uaResult.os.version || 'Unknown';
    const deviceType = uaResult.device.type || 'desktop';
    const deviceVendor = uaResult.device.vendor || 'Unknown';
    const deviceModel = uaResult.device.model || 'Unknown';
    const browserName = uaResult.browser.name || 'Unknown';
    const browserVersion = uaResult.browser.version || 'Unknown';

    try {
        await pool.query(`
            INSERT INTO visits (
                link_id, timestamp, ip, country, city, region, isp,
                user_agent, referer,
                os_name, os_version, device_type, device_vendor, device_model,
                browser_name, browser_version,
                cpu_cores, ram, gpu, touch_support,
                screen_width, screen_height, color_depth, pixel_ratio,
                timezone, language, cookies_enabled, do_not_track,
                canvas_hash, fonts, plugins,
                webgl_vendor, webgl_renderer,
                is_bot, bot_name, traffic_source
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9,
                $10, $11, $12, $13, $14,
                $15, $16,
                $17, $18, $19, $20,
                $21, $22, $23, $24,
                $25, $26, $27, $28,
                $29, $30, $31,
                $32, $33,
                $34, $35, $36
            )
        `, [
            linkId, timestamp, ip, country, city, region, isp,
            userAgent, referer,
            osName, osVersion, deviceType, deviceVendor, deviceModel,
            browserName, browserVersion,
            query.cc || 'Unknown', query.ram || 'Unknown', query.gpu || 'Unknown', query.ts || 'Unknown',
            query.sw || null, query.sh || null, query.cd || null, query.pr || null,
            query.tz || 'Unknown', query.lang || 'Unknown', query.cookies || 'Unknown', query.dnt || 'Unknown',
            query.canvas || null, query.fonts || null, query.plugins || null,
            query.webgl_vendor || null, query.webgl_renderer || null,
            botInfo.isBot ? 1 : 0, botInfo.botName, trafficSource
        ]);
        console.log('✅ Visit saved:', linkId, ip);
    } catch (err) {
        console.error('❌ DB insert error:', err);
    }
}

// ============================================================
// RESULTS DASHBOARD - FULLY UPDATED
// ============================================================
app.get('/results/:trackingId', async (req, res) => {
    const trackingId = req.params.trackingId;

    try {
        const linkResult = await pool.query(
            `SELECT id, target_url, created_at FROM links WHERE tracking_id = $1`,
            [trackingId]
        );

        if (linkResult.rows.length === 0) {
            return res.status(404).send(`<h3>❌ Not found</h3><a href="/">← Home</a>`);
        }

        const link = linkResult.rows[0];

        const visitsResult = await pool.query(
            `SELECT * FROM visits WHERE link_id = $1 ORDER BY timestamp DESC`,
            [link.id]
        );

        const visits = visitsResult.rows;

        const totalViews = visits.length;
        const uniqueIps = new Set(visits.map(v => v.ip)).size;
        const botCount = visits.filter(v => v.is_bot === 1).length;
        const humanCount = totalViews - botCount;

        // Traffic source stats
        const sourceStats = visits.reduce((acc, v) => {
            const src = v.traffic_source || 'Direct';
            acc[src] = (acc[src] || 0) + 1;
            return acc;
        }, {});

        let sourceBadges = '';
        for (const [src, count] of Object.entries(sourceStats)) {
            const pct = totalViews > 0 ? ((count / totalViews) * 100).toFixed(1) : 0;
            sourceBadges += `<span style="background:rgba(79,140,255,0.12);padding:4px 14px;border-radius:20px;margin:4px;display:inline-block;font-size:13px;">${src}: ${count} (${pct}%)</span>`;
        }

        // Build rows
        let rows = visits.map(v => {
            const isBot = v.is_bot === 1;
            const botBadge = isBot
                ? `<span style="background:#dc2626;padding:2px 10px;border-radius:12px;font-size:11px;color:white;">🤖 ${v.bot_name || 'Bot'}</span>`
                : `<span style="background:#16a34a;padding:2px 10px;border-radius:12px;font-size:11px;color:white;">👤 Human</span>`;

            // Device icon
            let deviceIcon = '💻';
            const dt = (v.device_type || '').toLowerCase();
            if (dt.includes('mobile') || dt.includes('phone')) deviceIcon = '📱';
            else if (dt.includes('tablet')) deviceIcon = '📟';

            // OS icon
            let osIcon = '🪟';
            const os = (v.os_name || '').toLowerCase();
            if (os.includes('mac')) osIcon = '🍎';
            else if (os.includes('linux')) osIcon = '🐧';
            else if (os.includes('android')) osIcon = '📱';
            else if (os.includes('ios') || os.includes('iphone') || os.includes('ipad')) osIcon = '🍏';

            return `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                <td style="padding:10px 8px;font-size:12px;">${new Date(v.timestamp).toLocaleString()}</td>
                <td style="padding:10px 8px;font-size:12px;color:#4f8cff;">${v.ip}</td>
                <td style="padding:10px 8px;font-size:12px;">${v.city || '—'}, ${v.region || ''}<br><span style="color:#8892b0;font-size:10px;">${v.country || '—'}</span></td>
                <td style="padding:10px 8px;font-size:12px;">${v.isp || '—'}</td>
                <td style="padding:10px 8px;font-size:12px;">
                    ${deviceIcon} <strong>${v.device_type || '—'}</strong><br>
                    <span style="color:#8892b0;font-size:10px;">${osIcon} ${v.os_name || ''} ${v.os_version || ''}</span>
                </td>
                <td style="padding:10px 8px;font-size:12px;">${v.browser_name || '—'} ${v.browser_version || ''}</td>
                <td style="padding:10px 8px;font-size:12px;color:#8892b0;">${v.screen_width || '—'}×${v.screen_height || '—'}</td>
                <td style="padding:10px 8px;font-size:12px;color:#8892b0;">${v.cpu_cores || '—'} cores<br>${v.ram || '—'}</td>
                <td style="padding:10px 8px;font-size:12px;">${v.timezone || '—'}</td>
                <td style="padding:10px 8px;font-size:12px;text-align:center;">${botBadge}</td>
                <td style="padding:10px 8px;font-size:12px;color:#8892b0;">${v.traffic_source || '—'}</td>
                <td style="padding:10px 8px;font-size:10px;color:#666;max-width:200px;word-break:break-all;">${v.user_agent || '—'}</td>
            </tr>`;
        }).join('');

        // Metadata section rows (collapsible)
        let metadataRows = visits.slice(0, 10).map(v => `
            <div style="border-bottom:1px solid rgba(255,255,255,0.04);padding:8px 0;font-size:12px;">
                <span style="color:#8892b0;">${new Date(v.timestamp).toLocaleString()}</span>
                <span style="color:#4f8cff;margin-left:12px;">${v.ip}</span>
                ${v.webgl_vendor ? `<span style="color:#8892b0;margin-left:12px;">GPU: ${v.webgl_vendor}</span>` : ''}
                ${v.canvas_hash ? `<span style="color:#8892b0;margin-left:12px;">Canvas: ${v.canvas_hash}</span>` : ''}
            </div>
        `).join('');

        // Fonts and plugins summary
        let fontsSummary = '';
        let pluginsSummary = '';
        if (visits.length > 0) {
            const latest = visits[0];
            if (latest.fonts) {
                const fontList = latest.fonts.split(',').slice(0, 10);
                fontsSummary = fontList.join(', ') + (latest.fonts.split(',').length > 10 ? ` (+${latest.fonts.split(',').length - 10} more)` : '');
            }
            if (latest.plugins) {
                const pluginList = latest.plugins.split(',').slice(0, 6);
                pluginsSummary = pluginList.join(', ') + (latest.plugins.split(',').length > 6 ? ` (+${latest.plugins.split(',').length - 6} more)` : '');
            }
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>📊 Full Analytics</title>
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0f1a; color: #eef2f8; margin: 0; padding: 20px; }
                    .container { max-width: 1500px; margin: 0 auto; background: rgba(16,22,40,0.8); backdrop-filter: blur(12px); padding: 30px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.06); }
                    h2 { margin-top: 0; display: flex; align-items: center; gap: 10px; }
                    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); gap: 12px; margin: 20px 0; }
                    .stat { background: rgba(255,255,255,0.04); padding: 14px; border-radius: 14px; text-align: center; border: 1px solid rgba(255,255,255,0.04); }
                    .stat .num { font-size: 28px; font-weight: 700; color: #4f8cff; }
                    .stat .num.green { color: #34d399; }
                    .stat .num.red { color: #f87171; }
                    .stat .lbl { font-size: 11px; color: #8892b0; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
                    .source-box { background: rgba(255,255,255,0.04); padding: 16px; border-radius: 14px; margin: 16px 0; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 16px; }
                    th { text-align: left; padding: 10px 8px; background: rgba(255,255,255,0.06); font-weight: 600; color: #8892b0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.3px; position: sticky; top: 0; z-index: 2; }
                    td { padding: 10px 8px; vertical-align: middle; }
                    .table-wrap { max-height: 600px; overflow-y: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,0.04); margin-top: 12px; }
                    a { color: #4f8cff; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                    .back { display: inline-block; margin-top: 20px; }
                    .metadata-section { background: rgba(255,255,255,0.02); border-radius: 12px; padding: 16px; margin-top: 20px; border: 1px solid rgba(255,255,255,0.04); }
                    .metadata-toggle { cursor: pointer; color: #4f8cff; font-weight: 600; }
                    .metadata-content { display: none; margin-top: 12px; }
                    .metadata-content.show { display: block; }
                    .tag { display: inline-block; background: rgba(79,140,255,0.12); color: #7aa3ff; padding: 2px 10px; border-radius: 12px; font-size: 11px; margin: 2px; }
                    @media (max-width: 768px) {
                        .container { padding: 16px; }
                        table { font-size: 10px; }
                        td, th { padding: 6px 4px; }
                        .stats { grid-template-columns: repeat(2,1fr); }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>📊 Full Device Analytics <span style="font-size:14px;color:#8892b0;font-weight:400;">Advanced Fingerprint Tracking</span></h2>
                    <p><strong>Link:</strong> <a href="${link.target_url}" target="_blank">${link.target_url}</a></p>
                    <p style="color:#8892b0;font-size:13px;">Created: ${new Date(link.created_at).toLocaleString()}</p>

                    <div class="stats">
                        <div class="stat"><div class="num">${totalViews}</div><div class="lbl">Total Views</div></div>
                        <div class="stat"><div class="num green">${uniqueIps}</div><div class="lbl">Unique IPs</div></div>
                        <div class="stat"><div class="num green">${humanCount}</div><div class="lbl">👤 Humans</div></div>
                        <div class="stat"><div class="num red">${botCount}</div><div class="lbl">🤖 Bots</div></div>
                    </div>

                    <div class="source-box">
                        <strong>📊 Traffic Sources</strong><br>
                        ${sourceBadges || 'No data'}
                    </div>

                    <h3>📋 Detailed Visit Log</h3>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Time</th>
                                    <th>IP</th>
                                    <th>Location</th>
                                    <th>ISP</th>
                                    <th>Device / OS</th>
                                    <th>Browser</th>
                                    <th>Screen</th>
                                    <th>CPU / RAM</th>
                                    <th>Timezone</th>
                                    <th>Status</th>
                                    <th>Source</th>
                                    <th>User-Agent</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows || '<tr><td colspan="12" style="text-align:center;padding:40px;color:#8892b0;">No visits yet.</td></tr>'}
                            </tbody>
                        </table>
                    </div>

                    <!-- Metadata Section -->
                    <div class="metadata-section">
                        <div class="metadata-toggle" onclick="toggleMetadata()">📦 <strong>Metadata & Fingerprint Details</strong> <span id="metadataArrow">▼</span></div>
                        <div class="metadata-content" id="metadataContent">
                            ${visits.length > 0 ? `
                                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
                                    <div>
                                        <strong style="color:#8892b0;">WebGL / GPU</strong><br>
                                        <span style="font-size:13px;">Vendor: ${visits[0].webgl_vendor || '—'}</span><br>
                                        <span style="font-size:13px;">Renderer: ${visits[0].webgl_renderer || '—'}</span>
                                    </div>
                                    <div>
                                        <strong style="color:#8892b0;">Canvas Fingerprint</strong><br>
                                        <span style="font-size:12px;font-family:monospace;">${visits[0].canvas_hash || '—'}</span>
                                    </div>
                                    <div>
                                        <strong style="color:#8892b0;">Fonts (${visits[0].fonts ? visits[0].fonts.split(',').length : 0})</strong><br>
                                        <span style="font-size:11px;">${fontsSummary || '—'}</span>
                                    </div>
                                    <div>
                                        <strong style="color:#8892b0;">Plugins (${visits[0].plugins ? visits[0].plugins.split(',').length : 0})</strong><br>
                                        <span style="font-size:11px;">${pluginsSummary || '—'}</span>
                                    </div>
                                    <div>
                                        <strong style="color:#8892b0;">Display</strong><br>
                                        <span style="font-size:13px;">Color Depth: ${visits[0].color_depth || '—'}</span><br>
                                        <span style="font-size:13px;">Pixel Ratio: ${visits[0].pixel_ratio || '—'}</span>
                                    </div>
                                    <div>
                                        <strong style="color:#8892b0;">Features</strong><br>
                                        <span style="font-size:13px;">Touch: ${visits[0].touch_support || '—'}</span><br>
                                        <span style="font-size:13px;">Cookies: ${visits[0].cookies_enabled || '—'}</span>
                                    </div>
                                </div>
                                <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.04);padding-top:12px;">
                                    <strong style="color:#8892b0;">Recent Metadata (last 10 visits)</strong>
                                    ${metadataRows || 'No data'}
                                </div>
                            ` : '<p style="color:#8892b0;padding:16px;">No visits to show metadata.</p>'}
                        </div>
                    </div>

                    <a href="/" class="back">← Create new link</a>
                </div>

                <script>
                    function toggleMetadata() {
                        const content = document.getElementById('metadataContent');
                        const arrow = document.getElementById('metadataArrow');
                        content.classList.toggle('show');
                        arrow.textContent = content.classList.contains('show') ? '▲' : '▼';
                    }
                </script>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('Results error:', err);
        res.status(500).send('An error occurred.');
    }
});

// ============================================================
// START
// ============================================================
app.listen(PORT, () => {
    console.log(`🕵️ Advanced tracker running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
});
