const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Harp Tech Bot Online'));
app.listen(process.env.PORT || 3000, () => console.log('Web server running'));
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const {
  SMM_SERVICES,
  WEB_TIERS,
  AIRTIME_NETWORKS,
  DATA_PLANS,
  BIZ_SERVICES,
  findSmmService,
  calcSmmCost,
} = require('./services');
const { generateSiteHTML } = require('./templates');
const { GH_OWNER, isValidRepoName, deployStaticSite } = require('./github');
const {
  placeOrder: placeSmmOrder,
  getOrderStatus: getSmmStatus,
  getPanelBalance: getSmmBalance,
  listPanelServices: listSmmServices,
} = require('./smm');

// ============================================================================
// CONFIGURATION
// ============================================================================
const OWNER_NUMBER = '2348141612736';
const PHONE_NUMBER = '2348141612736';
const BOT_NAME = 'HARPS TECH';
const BRAND_TAGLINE = 'Premium Digital Services Concierge';
const PREFIX = '.';
const AUTH_FOLDER = path.join(__dirname, 'auth');
if (fs.existsSync(AUTH_FOLDER)) fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
const DB_FILE = path.join(__dirname, 'database.json');
const SUPPORT_HANDLE = `wa.me/${OWNER_NUMBER}`;
const PAY_INFO = 'Opay  •  8141612736  •  Okugbe Praise';

// ============================================================================
// LOGGER
// ============================================================================
const logger = pino({ level: 'silent' });
const log = {
  info: (...a) => console.log('[INFO]', ...a),
  warn: (...a) => console.warn('[WARN]', ...a),
  error: (...a) => console.error('[ERROR]', ...a),
  success: (...a) => console.log('[OK]', ...a),
};

// ============================================================================
// FORMATTING HELPERS — for a clean, classy WhatsApp look
// ============================================================================
const HR = '━━━━━━━━━━━━━━━━━━━━━━━━';
const fmtNGN = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;

function header(title) {
  return `*${BOT_NAME}*\n_${title}_\n${HR}`;
}

function footer() {
  return `${HR}\n_${BRAND_TAGLINE}_\nSupport: ${SUPPORT_HANDLE}`;
}

function panel(title, body) {
  return `${header(title)}\n${body}\n${footer()}`;
}

function genOrderId(prefix = 'HT') {
  const t = Date.now().toString(36).toUpperCase().slice(-6);
  const r = Math.random().toString(36).toUpperCase().slice(2, 5);
  return `${prefix}-${t}${r}`;
}

// ============================================================================
// DATABASE (fs-based JSON)
// ============================================================================
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: [] }, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!data.users) data.users = {};
    if (!data.orders) data.orders = [];
    return data;
  } catch (err) {
    log.error('Failed to load database:', err.message);
    return { users: {}, orders: [] };
  }
}

function saveDB(data) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }
  catch (err) { log.error('Failed to save database:', err.message); }
}

function getUser(jid, name = '') {
  const db = loadDB();
  const number = jid.split('@')[0];
  if (!db.users[number]) {
    db.users[number] = { jid, name: name || number, balance: 0, joined: new Date().toISOString() };
    saveDB(db);
  } else {
    let dirty = false;
    if (name && db.users[number].name !== name) { db.users[number].name = name; dirty = true; }
    if (!db.users[number].jid) { db.users[number].jid = jid; dirty = true; }
    if (dirty) saveDB(db);
  }
  return db.users[number];
}

function updateBalance(number, delta) {
  const db = loadDB();
  if (!db.users[number]) {
    db.users[number] = { jid: `${number}@s.whatsapp.net`, name: number, balance: 0, joined: new Date().toISOString() };
  }
  db.users[number].balance = (db.users[number].balance || 0) + delta;
  saveDB(db);
  return db.users[number].balance;
}

function recordOrder(order) {
  const db = loadDB();
  db.orders.push({ ...order, createdAt: new Date().toISOString() });
  // Keep only last 500 orders
  if (db.orders.length > 500) db.orders = db.orders.slice(-500);
  saveDB(db);
}

function getUserOrders(number, limit = 5) {
  const db = loadDB();
  return db.orders.filter((o) => o.user === number).slice(-limit).reverse();
}

// ============================================================================
// GEMINI AI
// ============================================================================
let aiClient = null;
function getAI() {
  if (aiClient) return aiClient;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey || !baseUrl) return null;
  aiClient = new GoogleGenAI({ apiKey, httpOptions: { baseUrl } });
  return aiClient;
}

async function askGemini(prompt) {
  const ai = getAI();
  if (!ai) return 'AI service is not configured. Please contact Harps Tech.';
  try {
    const res = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 8192 },
    });
    return (res.text || '').trim() || 'No response generated.';
  } catch (err) {
    log.error('Gemini error:', err?.message || err);
    return 'AI request failed. Please try again later.';
  }
}

// ============================================================================
// CONSTANTS / COSTS
// ============================================================================
const AI_COST = 50;
const INSUFFICIENT_MSG =
  'Insufficient balance. Please contact Harps Tech to fund your account.\n\n' +
  `*Payment:* ${PAY_INFO}\n` +
  `Once paid, message ${SUPPORT_HANDLE} with proof — your balance is credited within minutes.`;

// ============================================================================
// COMMAND ROUTER
// ============================================================================
async function handleCommand(sock, msg, body) {
  const from = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0].split(':')[0];
  const pushName = msg.pushName || senderNumber;
  const user = getUser(`${senderNumber}@s.whatsapp.net`, pushName);

  const args = body.trim().slice(PREFIX.length).split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
  const notifyOwner = async (text) => {
    try {
      await sock.sendMessage(`${OWNER_NUMBER}@s.whatsapp.net`, { text });
    } catch (e) { /* ignore */ }
  };

  switch (command) {
    case 'menu':
    case 'help':
    case 'start':
      return cmdMenu(reply, user, senderNumber);

    case 'about':
      return cmdAbout(reply);

    case 'balance':
    case 'bal':
      return cmdBalance(reply, user, senderNumber, args);

    case 'profile':
      return cmdProfile(reply, user, senderNumber);

    case 'orders':
      return cmdOrders(reply, senderNumber);

    case 'support':
    case 'contact':
      return cmdSupport(reply);

    case 'pay':
      return cmdPay(reply);

    case 'services':
      return cmdServices(reply, args);

    case 'smm':
      return cmdSmm(reply, notifyOwner, user, senderNumber, pushName, args);

    case 'smmstatus':
      return cmdSmmStatus(reply, args);

    case 'web':
      return cmdWeb(reply, notifyOwner, user, senderNumber, pushName, args);

    case 'buy':
      return cmdBuy(reply, notifyOwner, user, senderNumber, pushName, args);

    case 'biz':
      return cmdBiz(reply, notifyOwner, user, senderNumber, pushName, args);

    case 'ai':
      return cmdAi(reply, user, senderNumber, pushName, args);

    // ── Admin only ─────────────────────────────────────────────
    case 'fund':
      return cmdFund(reply, sock, senderNumber, args);
    case 'broadcast':
      return cmdBroadcast(reply, sock, senderNumber, args);
    case 'users':
      return cmdUsers(reply, senderNumber);
    case 'smmbal':
      return cmdSmmBal(reply, senderNumber);
    case 'smmlist':
      return cmdSmmList(reply, senderNumber, args);
    case 'panic':
      return cmdPanic(reply, senderNumber);

    default:
      // Unknown command — stay silent to avoid spam
      return;
  }
}

// ============================================================================
// COMMAND IMPLEMENTATIONS
// ============================================================================
function cmdMenu(reply, user, senderNumber) {
  const isAdmin = senderNumber === OWNER_NUMBER;
  const body =
    `Welcome, *${user.name}*\n` +
    `Balance: *${fmtNGN(user.balance)}*\n` +
    `\n*MAIN MENU*\n` +
    `• ${PREFIX}services           — view our service catalog\n` +
    `• ${PREFIX}web [tier] [name]  — instant GitHub web hosting\n` +
    `• ${PREFIX}smm [code] [link] [qty] — order social boost\n` +
    `• ${PREFIX}buy airtime [amt] [number]\n` +
    `• ${PREFIX}buy data [plan] [number]\n` +
    `• ${PREFIX}biz [code]         — request a business service\n` +
    `• ${PREFIX}ai [question]      — ask Gemini AI\n` +
    `\n*ACCOUNT*\n` +
    `• ${PREFIX}balance            • ${PREFIX}profile\n` +
    `• ${PREFIX}orders             • ${PREFIX}pay\n` +
    `• ${PREFIX}support            • ${PREFIX}about` +
    (isAdmin
      ? `\n\n*ADMIN*\n` +
        `• ${PREFIX}fund [num] [amt]   • ${PREFIX}users\n` +
        `• ${PREFIX}broadcast [msg]    • ${PREFIX}smmbal\n` +
        `• ${PREFIX}smmlist [search]`
      : '');
  return reply(panel('Service Concierge', body));
}

function cmdAbout(reply) {
  const body =
    `${BOT_NAME} is your one-stop concierge for digital growth and business services.\n` +
    `\n*WHAT WE OFFER*\n` +
    `• Web hosting (GitHub Pages, 4 quality tiers)\n` +
    `• 50+ social boosts across 12 platforms\n` +
    `• Airtime & data top-up (all NG networks)\n` +
    `• Brand identity, design & marketing services\n` +
    `• AI assistance powered by Google Gemini\n` +
    `\nFounded and operated by *Okugbe Praise* — Harps Tech.`;
  return reply(panel('About Harps Tech', body));
}

function cmdBalance(reply, user, senderNumber, args) {
  // Admin can check anyone's balance:  .bal <number>
  if (senderNumber === OWNER_NUMBER && args[0]) {
    const target = args[0].replace(/[^0-9]/g, '');
    const db = loadDB();
    const u = db.users[target];
    if (!u) return reply(panel('Account Lookup', `No account found for *${target}*.`));
    return reply(panel('Account Lookup',
      `Number: *${target}*\nName: ${u.name}\nBalance: *${fmtNGN(u.balance)}*\nJoined: ${u.joined?.slice(0,10) || '—'}`));
  }
  return reply(panel('Account Balance',
    `Name: *${user.name}*\nNumber: ${senderNumber}\nBalance: *${fmtNGN(user.balance)}*\n\nTop up via ${PAY_INFO}\nThen send proof to ${SUPPORT_HANDLE}`));
}

function cmdProfile(reply, user, senderNumber) {
  return reply(panel('Your Profile',
    `Name: *${user.name}*\n` +
    `Number: ${senderNumber}\n` +
    `Balance: *${fmtNGN(user.balance)}*\n` +
    `Member since: ${user.joined ? user.joined.slice(0,10) : '—'}\n` +
    `\nUse ${PREFIX}orders to view your recent activity.`));
}

function cmdOrders(reply, senderNumber) {
  const orders = getUserOrders(senderNumber, 8);
  if (!orders.length) {
    return reply(panel('Your Orders', 'You have no orders yet.\nTry ' + PREFIX + 'services to get started.'));
  }
  const lines = orders.map((o) =>
    `• [${o.id}] ${o.type}\n   ${o.summary}\n   ${fmtNGN(o.amount)}  •  ${o.status}  •  ${o.createdAt.slice(5,16).replace('T',' ')}`
  ).join('\n');
  return reply(panel('Your Recent Orders', lines));
}

function cmdSupport(reply) {
  const body =
    `Need help? We're here.\n\n` +
    `*WhatsApp:* ${SUPPORT_HANDLE}\n` +
    `*Owner:* Okugbe Praise\n` +
    `*Hours:* Mon–Sat, 8am–10pm WAT`;
  return reply(panel('Customer Support', body));
}

function cmdPay(reply) {
  const body =
    `Top up your wallet to access all services.\n\n` +
    `*Payment account*\n${PAY_INFO}\n\n` +
    `After payment, send your proof to ${SUPPORT_HANDLE}.\n` +
    `Your balance is credited within minutes.`;
  return reply(panel('Fund Your Account', body));
}

// ── .services [category] ────────────────────────────────────────────────────
function cmdServices(reply, args) {
  const cat = (args[0] || '').toLowerCase();

  if (!cat) {
    const body =
      `Choose a category:\n\n` +
      `*${PREFIX}services smm*    — 50+ social boosts (IG, TikTok, YT, X, FB...)\n` +
      `*${PREFIX}services web*    — GitHub web hosting tiers\n` +
      `*${PREFIX}services airtime* — Airtime networks\n` +
      `*${PREFIX}services data*   — Data plans (all networks)\n` +
      `*${PREFIX}services biz*    — Branding, design & business services`;
    return reply(panel('Service Catalog', body));
  }

  if (cat === 'smm') {
    const grouped = {};
    for (const s of SMM_SERVICES) (grouped[s.platform] ||= []).push(s);
    let body = '';
    for (const platform of Object.keys(grouped)) {
      body += `\n*${platform.toUpperCase()}*\n`;
      body += grouped[platform]
        .map((s) => `  ${s.code.padEnd(5)} ${s.name}\n   ${fmtNGN(s.pricePerK)}/1k  •  min ${s.min.toLocaleString()}  •  max ${s.max.toLocaleString()}`)
        .join('\n');
      body += '\n';
    }
    body += `\n*How to order:*\n${PREFIX}smm [code] [link] [quantity]\n*Example:* ${PREFIX}smm IGF https://instagram.com/yourhandle 1000`;
    return reply(panel('SMM Catalog', body.trim()));
  }

  if (cat === 'web') {
    const body =
      Object.values(WEB_TIERS).map((t) =>
        `*Tier ${t.code} — ${t.name}*  (${fmtNGN(t.price)})\n${t.description}\nSections: ${t.sections.join(', ')}`
      ).join('\n\n') +
      `\n\n*How to order:*\n${PREFIX}web [tier] [sitename]\n*Example:* ${PREFIX}web 2 my-shop\n\nYour live URL will be:\nhttps://${GH_OWNER}.github.io/[sitename]`;
    return reply(panel('Web Hosting Tiers', body));
  }

  if (cat === 'airtime') {
    const body =
      `Top up any of these networks:\n` +
      AIRTIME_NETWORKS.map((n) => `  • ${n}`).join('\n') +
      `\n\n*How to order:*\n${PREFIX}buy airtime [amount] [number]\n*Example:* ${PREFIX}buy airtime 500 08163738389`;
    return reply(panel('Airtime Top-Up', body));
  }

  if (cat === 'data') {
    const body =
      Object.entries(DATA_PLANS)
        .map(([code, p]) => `  ${code.padEnd(8)} ${p.network.padEnd(8)} ${p.name.padEnd(20)} ${fmtNGN(p.price)}`)
        .join('\n') +
      `\n\n*How to order:*\n${PREFIX}buy data [plan] [number]\n*Example:* ${PREFIX}buy data MTN-2GB 08163738389`;
    return reply(panel('Data Plans', body));
  }

  if (cat === 'biz') {
    const body =
      Object.entries(BIZ_SERVICES)
        .map(([code, s]) => `  ${code.padEnd(12)} ${s.name.padEnd(28)} ${fmtNGN(s.price)}`)
        .join('\n') +
      `\n\n*How to order:*\n${PREFIX}biz [code]\n*Example:* ${PREFIX}biz LOGO\n\nA Harps Tech specialist will reach out to scope your project.`;
    return reply(panel('Business Services', body));
  }

  return reply(panel('Service Catalog', `Unknown category: *${cat}*\nUse ${PREFIX}services to see categories.`));
}

// ── .smm [code] [link] [qty] ────────────────────────────────────────────────
async function cmdSmm(reply, notifyOwner, user, senderNumber, pushName, args) {
  if (args.length < 3) {
    return reply(panel('SMM Order',
      `Usage:\n${PREFIX}smm [code] [link] [quantity]\n\n` +
      `Example:\n${PREFIX}smm IGF https://instagram.com/yourhandle 1000\n\n` +
      `See codes: ${PREFIX}services smm`));
  }
  const [codeRaw, link, qtyRaw] = args;
  const service = findSmmService(codeRaw);
  if (!service) {
    return reply(panel('SMM Order', `Unknown service code: *${codeRaw}*\nSee available codes with ${PREFIX}services smm.`));
  }
  const quantity = parseInt(qtyRaw, 10);
  if (!quantity || quantity < service.min || quantity > service.max) {
    return reply(panel('SMM Order',
      `Invalid quantity for *${service.name}*.\nAllowed: ${service.min.toLocaleString()} – ${service.max.toLocaleString()}.`));
  }
  if (!/^https?:\/\//i.test(link)) {
    return reply(panel('SMM Order', 'Please provide a valid link starting with http:// or https://'));
  }

  const cost = calcSmmCost(service, quantity);
  if (user.balance < cost) {
    await reply(INSUFFICIENT_MSG);
    return reply(panel('SMM Order',
      `${service.name}\nQuantity: ${quantity.toLocaleString()}\nCost: ${fmtNGN(cost)}\nYour balance: ${fmtNGN(user.balance)}`));
  }

  // Charge first, then place order. Refund on panel failure.
  updateBalance(senderNumber, -cost);
  const orderId = genOrderId('SMM');
  const result = await placeSmmOrder({ serviceId: service.panelId, link, quantity });

  if (!result.ok) {
    updateBalance(senderNumber, cost); // refund
    log.error('SMM panel failure:', result.error);
    await notifyOwner(`SMM order failed for ${senderNumber} (${service.name}): ${result.error}`);
    return reply(panel('SMM Order',
      `Your order could not be processed by the panel.\n_${result.error}_\n\n` +
      `*Refund:* ${fmtNGN(cost)} returned to your balance.\nNeed help? ${SUPPORT_HANDLE}`));
  }

  const panelOrderId = result.data?.order || result.data?.Order || '—';
  const newBal = updateBalance(senderNumber, 0);
  recordOrder({
    id: orderId, user: senderNumber, type: 'SMM',
    summary: `${service.name} · ${quantity.toLocaleString()} → ${link}`,
    amount: cost, status: 'PROCESSING', meta: { panelOrderId, code: service.code },
  });
  await notifyOwner(
    `New SMM order\nUser: ${pushName} (${senderNumber})\nService: ${service.name}\nQty: ${quantity}\nLink: ${link}\nCharged: ${fmtNGN(cost)}\nPanel ID: ${panelOrderId}`
  );

  return reply(panel('SMM Order Confirmed',
    `Service: *${service.name}*\nQuantity: ${quantity.toLocaleString()}\nLink: ${link}\n` +
    `Charged: *${fmtNGN(cost)}*\nNew balance: *${fmtNGN(newBal)}*\n\n` +
    `Order ID: *${orderId}*\nPanel ref: *${panelOrderId}*\n\n` +
    `Track status: ${PREFIX}smmstatus ${panelOrderId}`));
}

async function cmdSmmStatus(reply, args) {
  const id = args[0];
  if (!id) return reply(panel('SMM Status', `Usage: ${PREFIX}smmstatus [panel_order_id]`));
  const r = await getSmmStatus(id);
  if (!r.ok) return reply(panel('SMM Status', `Could not fetch status: ${r.error}`));
  const d = r.data || {};
  const body =
    `Order: *${id}*\nStatus: *${d.status || '—'}*\n` +
    `Start count: ${d.start_count ?? '—'}\nRemains: ${d.remains ?? '—'}\nCharge: ${d.charge ?? '—'}`;
  return reply(panel('SMM Status', body));
}

// ── .web [tier] [sitename] ──────────────────────────────────────────────────
async function cmdWeb(reply, notifyOwner, user, senderNumber, pushName, args) {
  if (args.length < 2) {
    return reply(panel('Web Hosting',
      `Usage:\n${PREFIX}web [tier] [sitename]\n\n` +
      `Example:\n${PREFIX}web 2 my-shop\n\n` +
      `See tiers: ${PREFIX}services web`));
  }
  const tierNum = parseInt(args[0], 10);
  const sitename = (args[1] || '').toLowerCase().trim();
  const tier = WEB_TIERS[tierNum];
  if (!tier) {
    return reply(panel('Web Hosting', `Unknown tier *${args[0]}*. Choose 1, 2, 3 or 4.\nSee ${PREFIX}services web.`));
  }
  if (!isValidRepoName(sitename)) {
    return reply(panel('Web Hosting',
      `Invalid sitename *"${sitename}"*.\nUse 2–60 chars, only lowercase letters, digits and hyphens.\nExample: *my-shop*`));
  }
  if (user.balance < tier.price) {
    await reply(INSUFFICIENT_MSG);
    return reply(panel('Web Hosting',
      `${tier.name} tier costs *${fmtNGN(tier.price)}*.\nYour balance: *${fmtNGN(user.balance)}*.`));
  }
  if (!process.env.GITHUB_TOKEN) {
    return reply(panel('Web Hosting', 'Hosting service is temporarily unavailable. Please contact support.'));
  }

  // Charge first, refund on failure
  updateBalance(senderNumber, -tier.price);
  await reply(panel('Web Hosting',
    `Building your *${tier.name}* site...\nThis takes a few seconds. Sit tight.`));

  try {
    const html = generateSiteHTML(tierNum, sitename);
    const result = await deployStaticSite(sitename, html, `${tier.name} site for ${pushName}`);
    if (!result.ok) {
      updateBalance(senderNumber, tier.price); // refund
      const explain =
        result.reason === 'repo_exists'
          ? `The sitename *"${sitename}"* is already taken on GitHub. Please try a different one.`
          : result.message || 'Deployment failed.';
      await notifyOwner(`Web hosting failed for ${senderNumber} (${sitename}): ${result.message}`);
      return reply(panel('Web Hosting', `${explain}\n\n*Refund:* ${fmtNGN(tier.price)} returned to your balance.`));
    }

    const orderId = genOrderId('WEB');
    const newBal = updateBalance(senderNumber, 0);
    recordOrder({
      id: orderId, user: senderNumber, type: 'WEB',
      summary: `${tier.name} · ${sitename}`,
      amount: tier.price, status: 'LIVE', meta: { siteUrl: result.siteUrl, repoUrl: result.repoUrl, tier: tierNum },
    });
    await notifyOwner(
      `New web hosting order\nUser: ${pushName} (${senderNumber})\nTier: ${tier.name}\nSite: ${result.siteUrl}\nCharged: ${fmtNGN(tier.price)}`
    );

    return reply(panel('Site Live',
      `*${tier.name}* deployment complete.\n\n` +
      `Live URL:\n${result.siteUrl}\n\n` +
      `Repository:\n${result.repoUrl}\n\n` +
      `Charged: *${fmtNGN(tier.price)}*\nNew balance: *${fmtNGN(newBal)}*\n` +
      `Order: *${orderId}*\n\n` +
      `_GitHub Pages may take 30–90 seconds to fully publish. Reload the URL if it's not live yet._`));
  } catch (err) {
    log.error('Web deploy crash:', err?.message || err);
    updateBalance(senderNumber, tier.price); // refund
    await notifyOwner(`Web hosting crashed for ${senderNumber} (${sitename}): ${err?.message}`);
    return reply(panel('Web Hosting',
      `Unexpected error during deployment.\nWe've refunded *${fmtNGN(tier.price)}* to your balance. Please try again or contact ${SUPPORT_HANDLE}.`));
  }
}

// ── .buy airtime / data ─────────────────────────────────────────────────────
async function cmdBuy(reply, notifyOwner, user, senderNumber, pushName, args) {
  const sub = (args.shift() || '').toLowerCase();

  if (sub === 'airtime') {
    if (args.length < 2) {
      return reply(panel('Airtime', `Usage: ${PREFIX}buy airtime [amount] [number]\nExample: ${PREFIX}buy airtime 500 08163738389`));
    }
    const amount = parseInt(args[0], 10);
    const number = (args[1] || '').replace(/[^0-9]/g, '');
    if (!amount || amount < 50 || amount > 50000) {
      return reply(panel('Airtime', 'Amount must be between ₦50 and ₦50,000.'));
    }
    if (number.length < 10 || number.length > 14) {
      return reply(panel('Airtime', 'Please provide a valid Nigerian phone number.'));
    }
    if (user.balance < amount) {
      await reply(INSUFFICIENT_MSG);
      return reply(panel('Airtime', `Top-up of ${fmtNGN(amount)} requires ${fmtNGN(amount)}.\nYour balance: ${fmtNGN(user.balance)}.`));
    }
    updateBalance(senderNumber, -amount);
    const orderId = genOrderId('AIR');
    const newBal = updateBalance(senderNumber, 0);
    recordOrder({
      id: orderId, user: senderNumber, type: 'AIRTIME',
      summary: `Airtime ${fmtNGN(amount)} → ${number}`,
      amount, status: 'PROCESSING', meta: { number, amount },
    });
    await notifyOwner(`New airtime order\nUser: ${pushName} (${senderNumber})\nAmount: ${fmtNGN(amount)}\nNumber: ${number}\nOrder: ${orderId}`);
    return reply(panel('Airtime Order',
      `Amount: *${fmtNGN(amount)}*\nNumber: *${number}*\nCharged: *${fmtNGN(amount)}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* is processing — usually within minutes.`));
  }

  if (sub === 'data') {
    if (args.length < 2) {
      return reply(panel('Data', `Usage: ${PREFIX}buy data [plan] [number]\nExample: ${PREFIX}buy data MTN-2GB 08163738389\nSee plans: ${PREFIX}services data`));
    }
    const planCode = (args[0] || '').toUpperCase();
    const number = (args[1] || '').replace(/[^0-9]/g, '');
    const plan = DATA_PLANS[planCode];
    if (!plan) return reply(panel('Data', `Unknown plan *${planCode}*. See ${PREFIX}services data.`));
    if (number.length < 10 || number.length > 14) {
      return reply(panel('Data', 'Please provide a valid Nigerian phone number.'));
    }
    if (user.balance < plan.price) {
      await reply(INSUFFICIENT_MSG);
      return reply(panel('Data', `${planCode} costs ${fmtNGN(plan.price)}.\nYour balance: ${fmtNGN(user.balance)}.`));
    }
    updateBalance(senderNumber, -plan.price);
    const orderId = genOrderId('DAT');
    const newBal = updateBalance(senderNumber, 0);
    recordOrder({
      id: orderId, user: senderNumber, type: 'DATA',
      summary: `${plan.network} ${plan.name} → ${number}`,
      amount: plan.price, status: 'PROCESSING', meta: { plan: planCode, number },
    });
    await notifyOwner(`New data order\nUser: ${pushName} (${senderNumber})\nPlan: ${planCode} (${plan.name})\nNumber: ${number}\nCharged: ${fmtNGN(plan.price)}\nOrder: ${orderId}`);
    return reply(panel('Data Order',
      `Plan: *${planCode}* (${plan.name})\nNetwork: *${plan.network}*\nNumber: *${number}*\nCharged: *${fmtNGN(plan.price)}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* is processing — usually within minutes.`));
  }

  return reply(panel('Buy',
    `Usage:\n${PREFIX}buy airtime [amount] [number]\n${PREFIX}buy data [plan] [number]\n\nSee ${PREFIX}services airtime  /  ${PREFIX}services data`));
}

// ── .biz [code] ─────────────────────────────────────────────────────────────
async function cmdBiz(reply, notifyOwner, user, senderNumber, pushName, args) {
  const code = (args[0] || '').toUpperCase();
  const svc = BIZ_SERVICES[code];
  if (!svc) {
    return reply(panel('Business Service', `Usage: ${PREFIX}biz [code]\nSee codes: ${PREFIX}services biz`));
  }
  if (user.balance < svc.price) {
    await reply(INSUFFICIENT_MSG);
    return reply(panel('Business Service', `${svc.name} costs ${fmtNGN(svc.price)}.\nYour balance: ${fmtNGN(user.balance)}.`));
  }
  updateBalance(senderNumber, -svc.price);
  const orderId = genOrderId('BIZ');
  const newBal = updateBalance(senderNumber, 0);
  recordOrder({
    id: orderId, user: senderNumber, type: 'BIZ',
    summary: svc.name, amount: svc.price, status: 'PENDING', meta: { code },
  });
  await notifyOwner(`New business order\nUser: ${pushName} (${senderNumber})\nService: ${svc.name}\nCharged: ${fmtNGN(svc.price)}\nOrder: ${orderId}`);
  return reply(panel('Order Received',
    `Service: *${svc.name}*\nCharged: *${fmtNGN(svc.price)}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* received. A Harps Tech specialist will contact you within 24 hours to begin work.`));
}

// ── .ai ──────────────────────────────────────────────────────────────────────
async function cmdAi(reply, user, senderNumber, pushName, args) {
  const prompt = args.join(' ').trim();
  if (!prompt) return reply(panel('AI Chat', `Usage: ${PREFIX}ai [your question]\nCost: ${fmtNGN(AI_COST)} per query`));
  if (user.balance < AI_COST) return reply(INSUFFICIENT_MSG);
  updateBalance(senderNumber, -AI_COST);
  await reply('_Thinking..._');
  const answer = await askGemini(prompt);
  const newBal = updateBalance(senderNumber, 0);
  return reply(panel('Gemini AI',
    `${answer}\n\n_Charged ${fmtNGN(AI_COST)}  •  Balance: ${fmtNGN(newBal)}_`));
}

// ── ADMIN: .fund / .users / .broadcast / .smmbal / .smmlist ─────────────────
async function cmdFund(reply, sock, senderNumber, args) {
  if (senderNumber !== OWNER_NUMBER) {
    return reply('Access denied. Only the bot owner can use this command.');
  }
  const target = (args[0] || '').replace(/[^0-9]/g, '');
  const amount = parseInt(args[1], 10);
  if (!target || !amount || isNaN(amount)) {
    return reply(panel('Fund', `Usage: ${PREFIX}fund [number] [amount]\nExample: ${PREFIX}fund 2348163738389 2000`));
  }
  const newBal = updateBalance(target, amount);
  recordOrder({
    id: genOrderId('FND'), user: target, type: 'FUND',
    summary: `Wallet credit by admin`, amount, status: 'COMPLETED', meta: {},
  });
  await reply(panel('Wallet Funded',
    `Number: *${target}*\nAmount added: *${fmtNGN(amount)}*\nNew balance: *${fmtNGN(newBal)}*`));
  try {
    await sock.sendMessage(`${target}@s.whatsapp.net`, {
      text: panel('Account Credited',
        `Your wallet has been funded by Harps Tech.\n\n` +
        `Amount: *${fmtNGN(amount)}*\nNew balance: *${fmtNGN(newBal)}*\n\n` +
        `Use ${PREFIX}menu to see what's available.`),
    });
  } catch (e) { /* ignore */ }
}

async function cmdBroadcast(reply, sock, senderNumber, args) {
  if (senderNumber !== OWNER_NUMBER) return reply('Access denied.');
  const message = args.join(' ').trim();
  if (!message) return reply(panel('Broadcast', `Usage: ${PREFIX}broadcast [message]`));
  const db = loadDB();
  const numbers = Object.keys(db.users);
  let sent = 0, failed = 0;
  await reply(panel('Broadcast', `Sending to *${numbers.length}* users...`));
  for (const n of numbers) {
    try {
      await sock.sendMessage(`${n}@s.whatsapp.net`, {
        text: panel('Announcement', message),
      });
      sent++;
      await new Promise((r) => setTimeout(r, 600)); // rate-limit
    } catch (_) { failed++; }
  }
  return reply(panel('Broadcast Complete', `Sent: *${sent}*\nFailed: *${failed}*`));
}

function cmdUsers(reply, senderNumber) {
  if (senderNumber !== OWNER_NUMBER) return reply('Access denied.');
  const db = loadDB();
  const list = Object.entries(db.users);
  if (!list.length) return reply(panel('Users', 'No users yet.'));
  const total = list.reduce((s, [, u]) => s + (u.balance || 0), 0);
  const top = [...list].sort((a, b) => (b[1].balance || 0) - (a[1].balance || 0)).slice(0, 20);
  const body =
    `Total users: *${list.length}*\nTotal wallet: *${fmtNGN(total)}*\n\n*Top 20 by balance*\n` +
    top.map(([n, u], i) => `${(i+1).toString().padStart(2,'0')}. ${n.padEnd(14)} ${(u.name || '').slice(0,18).padEnd(18)} ${fmtNGN(u.balance)}`).join('\n');
  return reply(panel('User Directory', body));
}

async function cmdSmmBal(reply, senderNumber) {
  if (senderNumber !== OWNER_NUMBER) return reply('Access denied.');
  const r = await getSmmBalance();
  if (!r.ok) return reply(panel('SMM Panel Balance', `Error: ${r.error}`));
  return reply(panel('SMM Panel Balance',
    `Balance: *${r.data?.balance ?? '—'}*\nCurrency: ${r.data?.currency ?? '—'}`));
}

async function cmdSmmList(reply, senderNumber, args) {
  if (senderNumber !== OWNER_NUMBER) return reply('Access denied.');
  await reply(panel('SMM Panel', 'Fetching service list from panel...'));
  const r = await listSmmServices();
  if (!r.ok || !Array.isArray(r.data)) {
    return reply(panel('SMM Panel', `Error: ${r.error || 'Unexpected response.'}`));
  }
  const search = (args[0] || '').toLowerCase();
  const filtered = search ? r.data.filter((s) => (s.name || '').toLowerCase().includes(search)) : r.data;
  const sample = filtered.slice(0, 40);
  const body =
    `Total: ${r.data.length}  •  Showing: ${sample.length}\n\n` +
    sample.map((s) => `[${s.service}] ${s.name}\n  rate ${s.rate}  •  min ${s.min}  •  max ${s.max}`).join('\n');
  return reply(panel('SMM Panel Services', body));
}

function cmdPanic(reply, senderNumber) {
  if (senderNumber !== OWNER_NUMBER) return reply('Access denied.');
  return reply(panel('System Status',
    `Bot uptime: ${(process.uptime() / 60).toFixed(1)} min\n` +
    `Node: ${process.version}\n` +
    `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
    `GitHub token: ${process.env.GITHUB_TOKEN ? 'OK' : 'MISSING'}\n` +
    `SMM key: ${process.env.SMM_KEY ? 'OK' : 'MISSING'}\n` +
    `Gemini: ${process.env.AI_INTEGRATIONS_GEMINI_API_KEY ? 'OK' : 'MISSING'}`));
}

// ============================================================================
// CONNECTION
// ============================================================================
async function startBot() {
  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  log.info(`Starting ${BOT_NAME} (Baileys v${version.join('.')})`);

  const sock = makeWASocket({
    version,
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Safari'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
  });

  sock.ev.on('creds.update', saveCreds);
819  
820  sock.ev.on('connection.update', (update) => {
821    const { connection, lastDisconnect } = update;
822    if (connection === 'connecting') log.info('Connecting to WhatsApp...');
823    else if (connection === 'open') log.success(`${BOT_NAME} connected as ${sock.user?.id || 'unknown'}`);
824    else if (connection === 'close') {
825      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;
826      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
827      log.warn(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
828      if (shouldReconnect) {
829        setTimeout(() => {
830          startBot().catch((e) => log.error('Restart failed:', e?.message || e));
831        }, 3000);
832      } else {
833        log.error('Logged out. Delete the auth folder and restart to re-pair.');

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'connecting') log.info('Connecting to WhatsApp...');
    else if (connection === 'open') log.success(`${BOT_NAME} connected as ${sock.user?.id || 'unknown'}`);
    else if (connection === 'close') {
      const statusCode =
        lastDisconnect?.error?.output?.statusCode ||
        lastDisconnect?.error?.output?.payload?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log.warn(`Connection closed (${statusCode}). Reconnecting: ${shouldReconnect}`);
      if (shouldReconnect) {
        setTimeout(() => {
          startBot().catch((e) => log.error('Restart failed:', e?.message || e));
        }, 3000);
      } else {
        log.error('Logged out. Delete the auth folder and restart to re-pair.');
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          '';
        if (!text) continue;

        const senderJid = msg.key.participant || msg.key.remoteJid;
        const senderNumber = senderJid.split('@')[0].split(':')[0];
        getUser(`${senderJid.split('@')[0]}@s.whatsapp.net`, msg.pushName || senderNumber);

        if (text.startsWith(PREFIX)) {
          await handleCommand(sock, msg, text);
        }
      } catch (err) {
        log.error('Message handler error:', err?.message || err);
      }
    }
  });

  return sock;
}

process.on('uncaughtException', (err) => log.error('Uncaught exception:', err?.message || err));
process.on('unhandledRejection', (err) => log.error('Unhandled rejection:', err?.message || err));

console.log('=== BOT FILE LOADED ===');
console.log('Starting HARP TECH bot...');
startBot().catch((err) => {
  console.error('=== FATAL STARTUP ERROR ===');
  console.error(err?.stack || err);
  setTimeout(() => {
    console.log('Retrying startBot...');
    startBot().catch((e) => console.error('Retry failed:', e?.stack || e));
  }, 5000);
});
