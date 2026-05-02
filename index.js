const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Harp Tech Bot Alive'));
app.listen(process.env.PORT || 3000, () => console.log('Web server running'));
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  makeCacheableSignalKeyStore,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const {
  SMM_SERVICES,
  AIRTIME_NETWORKS,
  DATA_PLANS,
  BIZ_SERVICES,
  findSmmService,
  calcSmmCost,
} = require('./services');
// WEBSITE BUILDER DISABLED FOR V1 - Harps Tech
// const { generateSiteHTML } = require('./templates');
// const { isValidRepoName, deployStaticSite } = require('./github');
const {
  placeOrder: placeSmmOrder,
  getOrderStatus: getSmmStatus,
  getPanelBalance: getSmmBalance,
  listPanelServices: listSmmServices,
} = require('./smm');
const { getNumber: get5SimNumber, getSms: get5SimSms } = require('./5sim');

// ============================================================================
// CONFIGURATION
// ============================================================================
const OWNER_NUMBER = process.env.OWNER_NUMBER || '2348141612736';
const PHONE_NUMBER = process.env.PHONE_NUMBER || '2348141612736';
const BOT_NAME = 'HARPS TECH';
const BRAND_TAGLINE = 'Premium Digital Services Concierge';
const PREFIX = '.';
const AUTH_FOLDER = path.join(__dirname, 'auth');
const DB_FILE = path.join(__dirname, 'database.json');
const SUPPORT_HANDLE = `wa.me/${OWNER_NUMBER}`;
const PAY_INFO = 'Opay • 8141612736 • Okugbe Praise';
const CHANNEL_LINK = process.env.CHANNEL_LINK || '';
const GROUP_LINK = process.env.GROUP_LINK || '';

// WEBSITE BUILDER DISABLED - Skip loading web_config.json
function loadWebTiers() {
  return { tiers: {}, github_username: "harpstech-ng" };
}

// ============================================================================
// LOGGER
// ============================================================================
const logger = pino({ level: 'silent' });
const log = {
  info: (...a) => console.log('[INFO]',...a),
  warn: (...a) => console.warn('[WARN]',...a),
  error: (...a) => console.error('[ERROR]',...a),
  success: (...a) => console.log('[OK]',...a),
};

// ============================================================================
// FORMATTING HELPERS
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
      fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, orders: [], groups: {}, demos: {} }, null, 2));
    }
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
    if (!data.users) data.users = {};
    if (!data.orders) data.orders = [];
    if (!data.groups) data.groups = {};
    if (!data.demos) data.demos = {};
    return data;
  } catch (err) {
    log.error('Failed to load database:', err.message);
    return { users: {}, orders: [], groups: {}, demos: {} };
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
    db.users[number] = { jid, name: name || number, balance: 0, joined: new Date().toISOString(), daily: 0, chillMode: false };
    saveDB(db);
  } else {
    let dirty = false;
    if (name && db.users[number].name!== name) { db.users[number].name = name; dirty = true; }
    if (!db.users[number].jid) { db.users[number].jid = jid; dirty = true; }
    if (dirty) saveDB(db);
  }
  return db.users[number];
}

function updateBalance(number, delta) {
  const db = loadDB();
  if (!db.users[number]) {
    db.users[number] = { jid: `${number}@s.whatsapp.net`, name: number, balance: 0, joined: new Date().toISOString(), daily: 0, chillMode: false };
  }
  db.users[number].balance = (db.users[number].balance || 0) + delta;
  saveDB(db);
  return db.users[number].balance;
}

function recordOrder(order) {
  const db = loadDB();
  db.orders.push({...order, createdAt: new Date().toISOString() });
  if (db.orders.length > 500) db.orders = db.orders.slice(-500);
  saveDB(db);
}

function getUserOrders(number, limit = 5) {
  const db = loadDB();
  return db.orders.filter((o) => o.user === number).slice(-limit).reverse();
}

function getGroupSettings(groupId) {
  const db = loadDB();
  if (!db.groups[groupId]) {
    db.groups[groupId] = { enabled: true, cruise: true };
    saveDB(db);
  }
  return db.groups[groupId];
}

function setGroupSettings(groupId, settings) {
  const db = loadDB();
  db.groups[groupId] = {...db.groups[groupId],...settings };
  saveDB(db);
}

// ============================================================================
// GEMINI AI
// ============================================================================
let aiClient = null;
function getAI() {
  if (aiClient) return aiClient;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey ||!baseUrl) return null;
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

// BOT PACKAGES
const BOT_PACKAGES = {
  basic: { name: 'Basic Bot', price: 15000, features: 20, desc: 'Menu, Balance, AI, Airtime, Data' },
  standard: { name: 'Standard Bot', price: 25000, features: 50, desc: 'All Basic + SMM, Biz Services' },
  pro: { name: 'Pro Bot', price: 40000, features: 80, desc: 'All Standard + Games, Referral, Channel Post' },
  premium: { name: 'Premium Bot', price: 60000, features: 101, desc: 'All Pro + Voice Clone, Auto Status, Bulk SMS' }
};

// CHEAP TRIALS
const GROWTH_TRIALS = {
  '10fl': { name: '10 Instagram Followers', price: 50, service: 'IGF', qty: 10 },
  '10tiktok': { name: '10 TikTok Followers', price: 50, service: 'TTF', qty: 10 },
  '50likes': { name: '50 Instagram Likes', price: 30, service: 'IGL', qty: 50 },
  '100views': { name: '100 TikTok Views', price: 20, service: 'TTV', qty: 100 }
};

// CRUISE QUOTES
const CHILL_QUOTES = [
  "Life na pot of beans, if you no get fire, you go chop am raw 😂",
  "Money no dey tree, but if you plant am well, e go grow 💰",
  "No stress yourself, problem no dey finish. Just dey breathe 🌬️",
  "Hustle hard, but remember to chop. Empty stomach no dey code 😂",
  "Today na today. Tomorrow na tomorrow. But money na now 💸"
];

const SAVAGE_REPLIES = [
  "You dey whine me? 😂 Focus on making money not insulting bot",
  "Your papa no train you? 😏 Respect HARPS TECH or comot",
  "Omo you get mouth o 😂 But you get money? Type.pay",
  "Insult no dey pay bills 💰 Send.menu make you blow",
  "You think say na play? 😈 I be AI with anger issues"
];

const JOKES = [
  "Why programmer no dey go party? Because e get too many BUGs 😂",
  "Wetin be phone wey no get network? Ex-boyfriend 📱💔",
  "How you know say food sweet? When you finish am before photo 😂",
  "Why NEPA no dey smile? Because dem dey always TAKE light 😂⚡"
];

// AUTO-SAVAGE
const CURSE_WORDS = ['fuck', 'shit', 'bastard', 'idiot', 'mumu', 'ode', 'fool', 'stupid', 'useless', 'yeye', 'mad'];

function isCursed(text) {
  const lower = text.toLowerCase();
  return CURSE_WORDS.some(word => lower.includes(word));
}

async function autoSavage(sock, msg, from, pushName) {
  const savageClapbacks = [
    `@${msg.key.participant?.split('@')[0] || pushName} You dey mad? 😂 Focus on making money not insulting bot`,
    `@${msg.key.participant?.split('@')[0] || pushName} Your papa no train you? 😏 Respect HARPS TECH or comot`,
    `@${msg.key.participant?.split('@')[0] || pushName} Omo you get mouth o 😂 But you get money? Type.pay`,
    `@${msg.key.participant?.split('@')[0] || pushName} Insult no dey pay bills 💰 Send.menu make you blow`,
    `@${msg.key.participant?.split('@')[0] || pushName} You think say na play? 😈 I be AI with anger issues`
  ];
  const pick = savageClapbacks[Math.floor(Math.random() * savageClapbacks.length)];
  await sock.sendMessage(from, { text: pick }, { quoted: msg });
}

// ============================================================================
// COMMAND ROUTER
// ============================================================================
async function handleCommand(sock, msg, body) {
  const from = msg.key.remoteJid;
  const senderJid = msg.key.participant || msg.key.remoteJid;
  const senderNumber = senderJid.split('@')[0].split(':')[0];
  const pushName = msg.pushName || senderNumber;
  const user = getUser(`${senderNumber}@s.whatsapp.net`, pushName);
  const isGroup = from.endsWith('@g.us');

  if (isGroup) {
    const groupSet = getGroupSettings(from);
    if (!groupSet.enabled && senderNumber!== OWNER_NUMBER) return;
  }

  const args = body.trim().slice(PREFIX.length).split(/\s+/);
  const command = (args.shift() || '').toLowerCase();

  const reply = (text) => sock.sendMessage(from, { text }, { quoted: msg });
  const notifyOwner = async (text) => {
    try {
      await sock.sendMessage(`${OWNER_NUMBER}@s.whatsapp.net`, { text });
    } catch (e) { /* ignore */ }
  };

  const postToChannel = async (text) => {
    if (!CHANNEL_LINK) return;
    try {
      const channelId = CHANNEL_LINK.split('/').pop() + '@newsletter';
      await sock.sendMessage(channelId, { text });
    } catch (e) { log.error('Channel post failed:', e.message); }
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
      return cmdSmm(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args);

    case 'smmstatus':
      return cmdSmmStatus(reply, args);

    case 'web':
      return cmdWebDisabled(reply);

    case 'buy':
      return cmdBuy(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args);

    case 'biz':
      return cmdBiz(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args);

    case 'ai':
      return cmdAi(reply, user, senderNumber, pushName, args);

    case 'buybot':
      return cmdBuyBot(reply, notifyOwner, user, senderNumber, pushName, args);

    case 'demo':
      return cmdDemo(reply, notifyOwner, user, senderNumber, pushName);

    case 'buynumber':
      return cmdBuyNumber(reply, notifyOwner, postToChannel, user, senderNumber, pushName);

    case 'chill':
      return cmdChill(reply, user, senderNumber, pushName);

    case 'nochill':
      return cmdNoChill(reply, user, senderNumber);

    case 'savage':
      return cmdSavage(reply);

    case 'jokes':
      return cmdJokes(reply);

    case 'meme':
      return cmdMeme(reply, user, senderNumber, args);

    case 'ship':
      return cmdShip(reply, args);

    case 'truth':
      return cmdTruth(reply, args);

    case 'quiz':
      return cmdQuiz(reply, from, sock);

    case 'rps':
      return cmdRPS(reply, args);

    case 'on':
      return cmdGroupOn(reply, from, senderNumber);

    case 'off':
      return cmdGroupOff(reply, from, senderNumber);

    case 'group':
      return cmdGroupToggle(reply, from, senderNumber, args);

    case 'growth':
      return cmdGrowth(reply);

    case 'daily':
      return cmdDaily(reply, user, senderNumber);

    case 'voice':
      return cmdVoiceClone(reply, sock, msg, from, user, senderNumber, args);

    case 'setvoice':
      return cmdSetVoice(reply, sock, msg, senderNumber);

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
      return;
  }
}

// ============================================================================
// COMMAND IMPLEMENTATIONS - ALL 101+ FEATURES
// ============================================================================
function cmdMenu(reply, user, senderNumber) {
  const isAdmin = senderNumber === OWNER_NUMBER;
  const body =
    `Welcome, *${user.name}*\n` +
    `Balance: *${fmtNGN(user.balance)}*\n` +
    `\n*MAIN MENU*\n` +
    `• ${PREFIX}services — view our service catalog\n` +
    `• ${PREFIX}smm [code] [link] [qty] — order social boost\n` +
    `• ${PREFIX}buy airtime [amt] [number]\n` +
    `• ${PREFIX}buy data [plan] [number]\n` +
    `• ${PREFIX}biz [code] — request a business service\n` +
    `• ${PREFIX}ai [question] — ask Gemini AI\n` +
    `• ${PREFIX}buynumber — USA WhatsApp Number ₦4k\n` +
    `\n*BOT PACKAGES*\n` +
    `• ${PREFIX}buybot [basic/standard/pro/premium]\n` +
    `• ${PREFIX}demo — Free 24hr demo\n` +
    `\n*GROWTH TRIALS*\n` +
    `• ${PREFIX}growth — 10 Followers ₦50\n` +
    `\n*CRUISE*\n` +
    `• ${PREFIX}chill • ${PREFIX}savage • ${PREFIX}jokes\n` +
    `• ${PREFIX}meme • ${PREFIX}ship • ${PREFIX}truth\n` +
    `• ${PREFIX}quiz • ${PREFIX}rps • ${PREFIX}voice\n` +
    `\n*ACCOUNT*\n` +
    `• ${PREFIX}balance • ${PREFIX}profile • ${PREFIX}daily\n` +
    `• ${PREFIX}orders • ${PREFIX}pay • ${PREFIX}support` +
    (isAdmin
? `\n\n*ADMIN*\n` +
        `• ${PREFIX}fund [num] [amt] • ${PREFIX}users\n` +
        `• ${PREFIX}broadcast [msg] • ${PREFIX}smmbal\n` +
        `• ${PREFIX}on / ${PREFIX}off • ${PREFIX}setvoice`
      : '');
  return reply(panel('Service Concierge', body));
}

function cmdAbout(reply) {
  const body =
    `${BOT_NAME} is your one-stop concierge for digital growth and business services.\n` +
    `\n*WHAT WE OFFER*\n` +
    `• 50+ social boosts across 12 platforms\n` +
    `• Airtime & data top-up (all NG networks)\n` +
    `• USA WhatsApp Numbers ₦4k\n` +
    `• Brand identity, design & marketing services\n` +
    `• AI assistance powered by Google Gemini\n` +
    `• Bot packages ₦15k - ₦60k\n` +
    `• Voice Clone Technology\n` +
    `\nFounded and operated by *Okugbe Praise* — Harps Tech.\n\n_Website Builder coming in V2_`;
  return reply(panel('About Harps Tech', body));
}

function cmdBalance(reply, user, senderNumber, args) {
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
    `Member since: ${user.joined? user.joined.slice(0,10) : '—'}\n` +
    `\nUse ${PREFIX}orders to view your recent activity.`));
}

function cmdOrders(reply, senderNumber) {
  const orders = getUserOrders(senderNumber, 8);
  if (!orders.length) {
    return reply(panel('Your Orders', 'You have no orders yet.\nTry ' + PREFIX + 'services to get started.'));
  }
  const lines = orders.map((o) =>
    `• [${o.id}] ${o.type}\n ${o.summary}\n ${fmtNGN(o.amount)} • ${o.status} • ${o.createdAt.slice(5,16).replace('T',' ')}`
  ).join('\n');
  return reply(panel('Your Recent Orders', lines));
}

function cmdSupport(reply) {
  const body =
    `Need help? We're here.\n\n` +
    `*WhatsApp:* ${SUPPORT_HANDLE}\n` +
    `*Channel:* ${CHANNEL_LINK || 'Coming soon'}\n` +
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

function cmdServices(reply, args) {
  const cat = (args[0] || '').toLowerCase();

  if (!cat) {
    const body =
      `Choose a category:\n\n` +
      `*${PREFIX}services smm* — 50+ social boosts (IG, TikTok, YT, X, FB...)\n` +
      `*${PREFIX}services airtime* — Airtime networks\n` +
      `*${PREFIX}services data* — Data plans (all networks)\n` +
      `*${PREFIX}services biz* — Branding, design & business services\n` +
      `*${PREFIX}services bots* — Bot packages ₦15k-₦60k\n\n` +
      `_Website Builder coming in V2_`;
    return reply(panel('Service Catalog', body));
  }

  if (cat === 'smm') {
    const grouped = {};
    for (const s of SMM_SERVICES) (grouped[s.platform] ||= []).push(s);
    let body = '';
    for (const platform of Object.keys(grouped)) {
      body += `\n*${platform.toUpperCase()}*\n`;
      body += grouped[platform]
.map((s) => ` ${s.code.padEnd(5)} ${s.name}\n ${fmtNGN(s.pricePerK)}/1k • min ${s.min.toLocaleString()} • max ${s.max.toLocaleString()}`)
.join('\n');
      body += '\n';
    }
    body += `\n*How to order:*\n${PREFIX}smm [code] [link] [quantity]\n*Example:* ${PREFIX}smm IGF https://instagram.com/yourhandle 1000`;
    return reply(panel('SMM Catalog', body.trim()));
  }

  if (cat === 'web') {
    return reply(panel('Web Hosting', `🚧 *Coming in V2*\n\nWebsite builder temporarily disabled.\n\nContact ${SUPPORT_HANDLE} for custom websites ₦30k+`));
  }

  if (cat === 'airtime') {
    const body =
      `Top up any of these networks:\n` +
      AIRTIME_NETWORKS.map((n) => ` • ${n}`).join('\n') +
      `\n\n*How to order:*\n${PREFIX}buy airtime [amount] [number]\n*Example:* ${PREFIX}buy airtime 500 08163738389`;
    return reply(panel('Airtime Top-Up', body));
  }

  if (cat === 'data') {
    const body =
      Object.entries(DATA_PLANS)
.map(([code, p]) => ` ${code.padEnd(8)} ${p.network.padEnd(8)} ${p.name.padEnd(20)} ${fmtNGN(p.price)}`)
.join('\n') +
      `\n\n*How to order:*\n${PREFIX}buy data [plan] [number]\n*Example:* ${PREFIX}buy data MTN-2GB 08163738389`;
    return reply(panel('Data Plans', body));
  }

  if (cat === 'biz') {
    const body =
      Object.entries(BIZ_SERVICES)
.map(([code, s]) => ` ${code.padEnd(12)} ${s.name.padEnd(28)} ${fmtNGN(s.price)}`)
.join('\n') +
      `\n\n*How to order:*\n${PREFIX}biz [code]\n*Example:* ${PREFIX}biz LOGO\n\nA Harps Tech specialist will reach out to scope your project.`;
    return reply(panel('Business Services', body));
  }

  if (cat === 'bots') {
    const body =
      Object.entries(BOT_PACKAGES)
.map(([key, b]) => `*${b.name}* - ${fmtNGN(b.price)}\n${b.desc}\nFeatures: ${b.features}\nCommand: ${PREFIX}buybot ${key}`)
.join('\n\n') +
      `\n\n*Free Demo:* ${PREFIX}demo - 24hr trial`;
    return reply(panel('Bot Packages', body));
  }

  return reply(panel('Service Catalog', `Unknown category: *${cat}*\nUse ${PREFIX}services to see categories.`));
}

function cmdWebDisabled(reply) {
  return reply(panel('Web Hosting', `🚧 *Website Builder Coming in V2*\n\nTemporarily disabled to fix bugs.\n\nFor custom websites ₦30k+ contact:\n${SUPPORT_HANDLE}\n\n_Use other services:.menu_`));
}

async function cmdSmm(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args) {
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

  updateBalance(senderNumber, -cost);
  const orderId = genOrderId('SMM');
  const result = await placeSmmOrder({ serviceId: service.panelId, link, quantity });

  if (!result.ok) {
    updateBalance(senderNumber, cost);
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

  await postToChannel(`🔥 *NEW ORDER* 🔥\n\n${pushName} just ordered ${quantity} ${service.name}!\n\nJoin HARPS TECH: ${CHANNEL_LINK}`);

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
    `Start count: ${d.start_count?? '—'}\nRemains: ${d.remains?? '—'}\nCharge: ${d.charge?? '—'}`;
  return reply(panel('SMM Status', body));
}

async function cmdBuy(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args) {
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
    await postToChannel(`💳 *AIRTIME TOPUP* 💳\n\n${pushName} just bought ${fmtNGN(amount)} airtime!\n\nTop up yours: ${PREFIX}buy airtime`);
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
    await postToChannel(`📶 *DATA PURCHASE* 📶\n\n${pushName} bought ${plan.name}!\n\nGet yours: ${PREFIX}buy data`);
    return reply(panel('Data Order',
      `Plan: *${planCode}* (${plan.name})\nNetwork: *${plan.network}*\nNumber: *${number}*\nCharged: *${fmtNGN(plan.price)}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* is processing — usually within minutes.`));
  }

  return reply(panel('Buy',
    `Usage:\n${PREFIX}buy airtime [amount] [number]\n${PREFIX}buy data [plan] [number]\n\nSee ${PREFIX}services airtime / ${PREFIX}services data`));
}

async function cmdBiz(reply, notifyOwner, postToChannel, user, senderNumber, pushName, args) {
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
  await postToChannel(`💼 *BUSINESS ORDER* 💼\n\n${pushName} ordered ${svc.name}!\n\nStart yours: ${PREFIX}biz`);
  return reply(panel('Order Received',
    `Service: *${svc.name}*\nCharged: *${fmtNGN(svc.price)}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* received. A Harps Tech specialist will contact you within 24 hours to begin work.`));
}

// ──.ai ──────────────────────────────────────────────────────────────────────
async function cmdAi(reply, user, senderNumber, pushName, args) {
  const prompt = args.join(' ').trim();
  if (!prompt) return reply(panel('AI Chat', `Usage: ${PREFIX}ai [your question]\nCost: ${fmtNGN(AI_COST)} per query`));
  if (user.balance < AI_COST) return reply(INSUFFICIENT_MSG);
  updateBalance(senderNumber, -AI_COST);
  await reply('_Thinking..._');
  const answer = await askGemini(prompt);
  const newBal = updateBalance(senderNumber, 0);
  return reply(panel('Gemini AI',
    `${answer}\n\n_Charged ${fmtNGN(AI_COST)} • Balance: ${fmtNGN(newBal)}_`));
}

// ── BOT SELLING ─────────────────────────────────────────────────────────────
async function cmdBuyBot(reply, notifyOwner, user, senderNumber, pushName, args) {
  const type = (args[0] || '').toLowerCase();
  const bot = BOT_PACKAGES[type];
  if (!bot) {
    return reply(panel('Bot Packages', `Usage: ${PREFIX}buybot [basic/standard/pro/premium]\n\nSee ${PREFIX}services bots`));
  }
  if (user.balance < bot.price) {
    await reply(INSUFFICIENT_MSG);
    return reply(panel('Bot Purchase', `${bot.name} costs ${fmtNGN(bot.price)}.\nYour balance: ${fmtNGN(user.balance)}.`));
  }
  updateBalance(senderNumber, -bot.price);
  const orderId = genOrderId('BOT');
  const newBal = updateBalance(senderNumber, 0);
  recordOrder({
    id: orderId, user: senderNumber, type: 'BOT',
    summary: `${bot.name} Package`, amount: bot.price, status: 'PENDING', meta: { type },
  });
  await notifyOwner(`NEW BOT SALE!\nUser: ${pushName} (${senderNumber})\nPackage: ${bot.name}\nPaid: ${fmtNGN(bot.price)}\nOrder: ${orderId}\n\nSend bot files to customer!`);
  return reply(panel('Bot Purchase Success',
    `Package: *${bot.name}*\nPrice: *${fmtNGN(bot.price)}*\nFeatures: *${bot.features}*\nNew balance: *${fmtNGN(newBal)}*\n\nOrder *${orderId}* confirmed!\n\nA Harps Tech agent will contact you within 1 hour to deliver your bot files + setup guide.`));
}

async function cmdDemo(reply, notifyOwner, user, senderNumber, pushName) {
  const db = loadDB();
  if (db.demos[senderNumber]) {
    return reply(panel('Demo Active', `You already have an active demo!\nExpires: ${new Date(db.demos[senderNumber]).toLocaleString()}\n\nContact ${SUPPORT_HANDLE} to upgrade.`));
  }
  const expiry = new Date(Date.now() + 24*60*60*1000);
  db.demos[senderNumber] = expiry.toISOString();
  saveDB(db);
  await notifyOwner(`DEMO REQUEST\nUser: ${pushName} (${senderNumber})\nExpires: ${expiry.toLocaleString()}\n\nSend demo bot to customer!`);
  return reply(panel('Demo Activated',
    `✅ 24hr Demo Bot Activated!\n\nExpires: ${expiry.toLocaleString()}\n\nFeatures: Menu, Balance, AI, Basic commands\n\nA demo bot will be sent to you shortly.\n\nUpgrade anytime: ${PREFIX}buybot`));
}

// ── NUMBER SHOP ─────────────────────────────────────────────────────────────
async function cmdBuyNumber(reply, notifyOwner, postToChannel, user, senderNumber, pushName) {
  const COST = 4000;
  if (user.balance < COST) {
    await reply(INSUFFICIENT_MSG);
    return reply(panel('USA Number', `USA WhatsApp Number costs *${fmtNGN(COST)}*.\nYour balance: *${fmtNGN(user.balance)}*.`));
  }
  if (!process.env.FIVESIM_API_KEY) {
    return reply(panel('USA Number', 'Number service temporarily unavailable. Contact support.'));
  }

  updateBalance(senderNumber, -COST);
  await reply(panel('Buying Number', 'Purchasing USA WhatsApp number from 5SIM...\nPlease wait 10-30 seconds.'));

  try {
    const numData = await get5SimNumber('usa', 'whatsapp');
    if (!numData ||!numData.phone) {
      updateBalance(senderNumber, COST);
      return reply(panel('USA Number', 'Failed to get number from 5SIM. Refunded ₦4,000.\nTry again or contact support.'));
    }

    const orderId = genOrderId('NUM');
    const newBal = updateBalance(senderNumber, 0);
    recordOrder({
      id: orderId, user: senderNumber, type: 'NUMBER',
      summary: `USA WhatsApp ${numData.phone}`, amount: COST, status: 'WAITING_SMS', meta: { phone: numData.phone, id: numData.id },
    });

    await notifyOwner(`NUMBER SOLD\nUser: ${pushName} (${senderNumber})\nNumber: ${numData.phone}\nCharged: ₦4,000\nOrder: ${orderId}`);
    await postToChannel(`📱 *NUMBER SOLD* 📱\n\n${pushName} bought USA WhatsApp number!\n\nGet yours: ${PREFIX}buynumber ₦4k`);

    await reply(panel('Number Purchased',
      `Phone: *${numData.phone}*\nCountry: USA\nService: WhatsApp\nCharged: *₦4,000*\nBalance: *${fmtNGN(newBal)}*\n\n` +
      `Order: *${orderId}*\n\nNow go to WhatsApp → Enter this number → Request SMS code\n\nI'll auto-send you the code when it arrives!`));

    let attempts = 0;
    const maxAttempts = 30;
    const checkSMS = async () => {
      attempts++;
      const sms = await get5SimSms(numData.id);
      if (sms && sms.sms && sms.sms.length > 0) {
        const code = sms.sms[0].code;
        await reply(panel('SMS CODE RECEIVED',
          `Phone: *${numData.phone}*\n\n*WhatsApp Code: ${code}*\n\nEnter this code in WhatsApp now!\n\nNote: Number works for WhatsApp only. No guarantee after code delivered.`));
        return;
      }
      if (attempts < maxAttempts) {
        setTimeout(checkSMS, 10000);
      } else {
        await reply(panel('SMS Timeout', `No SMS received after 5 minutes.\n\nContact ${SUPPORT_HANDLE} with Order ID: ${orderId}`));
      }
    };
    setTimeout(checkSMS, 10000);

  } catch (err) {
    log.error('5SIM error:', err.message);
    updateBalance(senderNumber, COST);
    return reply(panel('USA Number', `Error buying number: ${err.message}\n\nRefunded ₦4,000. Try again later.`));
  }
}

// ── CRUISE COMMANDS ─────────────────────────────────────────────────────────
function cmdChill(reply, user, senderNumber, pushName) {
  const db = loadDB();
  db.users[senderNumber].chillMode = true;
  saveDB(db);
  const responses = [
    `Omo *${pushName}* 😂 I don switch to chill mode. No more business talk. Wetin dey sup?`,
    `Guyyyyy *${pushName}* 😎 Friend mode activated. How you dey?`,
    `My gee *${pushName}* 💯 No more bot vibes. Just me and you. Wetin happen?`,
    `Baba *${pushName}* 😂 I don drop customer service. Now na gist. How far?`
  ];
  const pick = responses[Math.floor(Math.random() * responses.length)];
  return reply(pick + `\n\n_Type.nochill to go back business mode_`);
}

function cmdNoChill(reply, user, senderNumber) {
  const db = loadDB();
  db.users[senderNumber].chillMode = false;
  saveDB(db);
  return reply(panel('Business Mode ON', `✅ Back to HARPS TECH Bot\n\nSend.menu to see services\nSend.pay to fund wallet\n\n_${BRAND_TAGLINE}_`));
}

function cmdSavage(reply) {
  const savage = SAVAGE_REPLIES[Math.floor(Math.random() * SAVAGE_REPLIES.length)];
  return reply(panel('Savage Mode 😏', savage));
}

function cmdJokes(reply) {
  const joke = JOKES[Math.floor(Math.random() * JOKES.length)];
  return reply(panel('Joke Time 😂', joke));
}

async function cmdMeme(reply, user, senderNumber, args) {
  const text = args.join(' ').trim();
  if (!text) return reply(panel('Meme Generator', `Usage: ${PREFIX}meme [text]\nExample: ${PREFIX}meme When NEPA take light`));
  if (user.balance < 20) return reply(panel('Meme Generator', 'Cost: ₦20\nYour balance: ' + fmtNGN(user.balance)));
  updateBalance(senderNumber, -20);
  const meme = await askGemini(`Create a funny Nigerian meme caption for: "${text}". Make it short, savage, relatable.`);
  return reply(panel('Meme Generated 😂', `${meme}\n\n_Charged ₦20_`));
}

function cmdShip(reply, args) {
  if (args.length < 2) return reply(panel('Ship Calculator', `Usage: ${PREFIX}ship @user1 @user2`));
  const love = Math.floor(Math.random() * 100) + 1;
  const u1 = args[0].replace('@', '');
  const u2 = args[1].replace('@', '');
  let msg = `${u1} ❤️ ${u2} = ${love}%\n\n`;
  if (love > 80) msg += 'Soulmates! 💍 Marry now!';
  else if (love > 60) msg += 'Strong connection! 🔥';
  else if (love > 40) msg += 'E fit work. Try am 😏';
  else msg += 'Omo... na friend zone 📦';
  return reply(panel('Love Calculator', msg));
}

function cmdTruth(reply, args) {
  const type = (args[0] || 'truth').toLowerCase();
  const truths = ["What's your biggest secret?", "Who be your crush?", "You don ever lie for this group?", "Wetin you dey hide for your phone?"];
  const dares = ["Send voice note sing 'God is Good'", "Change your DP to potato for 1hr", "Send ₦100 to admin 😂", "Call your ex right now 📞"];
  const pick = type === 'dare'? dares[Math.floor(Math.random() * dares.length)] : truths[Math.floor(Math.random() * truths.length)];
  return reply(panel(type === 'dare'? 'DARE 🔥' : 'TRUTH 🤔', pick));
}

async function cmdQuiz(reply, from, sock) {
  const questions = [
    { q: "What is Nigeria capital?", a: "abuja" },
    { q: "2 + 2 x 2 =?", a: "6" },
    { q: "Who founded HARPS TECH?", a: "okugbe praise" },
    { q: "Which year Nigeria gain independence?", a: "1960" }
  ];
  const q = questions[Math.floor(Math.random() * questions.length)];
  await reply(panel('QUIZ TIME 🧠', `${q.q}\n\nReply with answer in 30 seconds!\nFirst correct answer wins ₦50!`));
}

function cmdRPS(reply, args) {
  const user = (args[0] || '').toLowerCase();
  const choices = ['rock', 'paper', 'scissors'];
  if (!choices.includes(user)) return reply(panel('RPS Game', `Usage: ${PREFIX}rps [rock/paper/scissors]`));
  const bot = choices[Math.floor(Math.random() * 3)];
  let result = '';
  if (user === bot) result = 'Draw! 😐';
  else if ((user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper')) result = 'You win! 🎉 +₦20';
  else result = 'Bot wins! 🤖';
  return reply(panel('Rock Paper Scissors', `You: ${user}\nBot: ${bot}\n\n${result}`));
}

// ── GROUP CONTROL ───────────────────────────────────────────────────────────
function cmdGroupOn(reply, from, senderNumber) {
  if (senderNumber!== OWNER_NUMBER) return reply('❌ Only owner can turn on bot.');
  setGroupSettings(from, { enabled: true });
  return reply(panel('Bot Activated', '✅ Bot is now ON in this group\n\nAll commands active for everybody!\n\nType.off to deactivate me.'));
}

function cmdGroupOff(reply, from, senderNumber) {
  if (senderNumber!== OWNER_NUMBER) return reply('❌ Only owner can turn off bot.');
  setGroupSettings(from, { enabled: false });
  return reply(panel('Bot Deactivated', '❌ Bot is now OFF in this group\n\nI no go reply anybody again.\n\nOnly owner commands work.\n\nType.on to activate me back.'));
}

function cmdGroupToggle(reply, from, senderNumber, args) {
  if (senderNumber!== OWNER_NUMBER) return reply('❌ Only owner can use this.');
  const mode = (args[0] || '').toLowerCase();
  if (mode === 'on') {
    setGroupSettings(from, { enabled: true });
    return reply(panel('Group Mode', '✅ Bot enabled for everyone'));
  } else if (mode === 'off') {
    setGroupSettings(from, { enabled: false });
    return reply(panel('Group Mode', '❌ Bot disabled for members'));
  }
  return reply(panel('Group Mode', `Usage: ${PREFIX}group [on/off]`));
}

// ── GROWTH TRIALS ───────────────────────────────────────────────────────────
function cmdGrowth(reply) {
  const body = Object.entries(GROWTH_TRIALS)
.map(([key, t]) => `*${t.name}* - ${fmtNGN(t.price)}\nCommand: ${PREFIX}smm ${t.service} [link] ${t.qty}`)
.join('\n\n') +
    `\n\n*Example:* ${PREFIX}smm IGF https://instagram.com/yourhandle 10`;
  return reply(panel('Growth Trials 🔥', body));
}

// ── DAILY BONUS ─────────────────────────────────────────────────────────────
function cmdDaily(reply, user, senderNumber) {
  const db = loadDB();
  const today = new Date().toDateString();
  const lastClaim = db.users[senderNumber].daily? new Date(db.users[senderNumber].daily).toDateString() : null;

  if (lastClaim === today) {
    return reply(panel('Daily Bonus', '❌ You already claimed today!\n\nCome back tomorrow for ₦100 free.'));
  }

  updateBalance(senderNumber, 100);
  db.users[senderNumber].daily = new Date().toISOString();
  saveDB(db);

  return reply(panel('Daily Bonus Claimed! 🎉', `+₦100 added to your balance!\n\nNew balance: ${fmtNGN(user.balance + 100)}\n\nCome back tomorrow!`));
}

// ── VOICE CLONE ─────────────────────────────────────────────────────────────
async function cmdSetVoice(reply, sock, msg, senderNumber) {
  if (senderNumber!== OWNER_NUMBER) return reply('❌ Only owner can set voice.');

  if (!msg.message?.audioMessage) {
    return reply(panel('Set Voice Clone', '❌ Send voice note + caption.setvoice\n\nExample: Record 10sec voice saying "Hello I be HARPS TECH" then caption.setvoice'));
  }

  await reply(panel('Voice Clone', '⏳ Processing your voice... This take 30sec'));

  const buffer = await downloadMediaMessage(msg, 'buffer', {});
  const db = loadDB();
  db.voiceClone = buffer.toString('base64');
  saveDB(db);

  return reply(panel('Voice Clone Success', '✅ Your voice saved!\n\nNow when you use.ai or.voice, bot go reply with YOUR voice.\n\nTest:.voice Hello customers'));
}

async function cmdVoiceClone(reply, sock, msg, from, user, senderNumber, args) {
  const text = args.join(' ').trim();
  if (!text) return reply(panel('Voice Clone', `Usage: ${PREFIX}voice [text]\nExample: ${PREFIX}voice Hello customers, HARPS TECH here`));

  const db = loadDB();
  if (!db.voiceClone) {
    return reply(panel('Voice Clone', '❌ Owner never set voice yet.\n\nOwner should send voice note + caption.setvoice'));
  }

  if (user.balance < 100) return reply(panel('Voice Clone', 'Cost: ₦100\nYour balance: ' + fmtNGN(user.balance)));
  updateBalance(senderNumber, -100);

  await reply(panel('Voice Clone', `🎙️ Sending voice note...\n\nText: "${text}"\n\n_Charged ₦100_`));

  const audioBuffer = Buffer.from(db.voiceClone, 'base64');
  await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
}

// ── ADMIN COMMANDS ──────────────────────────────────────────────────────────
async function cmdFund(reply, sock, senderNumber, args) {
  if (senderNumber!== OWNER_NUMBER) {
    return reply('Access denied. Only the bot owner can use this command.');
  }
  const target = (args[0] || '').replace(/[^0-9]/g, '');
  const amount = parseInt(args[1], 10);
  if (!target ||!amount || isNaN(amount)) {
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
  if (senderNumber!== OWNER_NUMBER) return reply('Access denied.');
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
      await new Promise((r) => setTimeout(r, 600));
    } catch (_) { failed++; }
  }
  return reply(panel('Broadcast Complete', `Sent: *${sent}*\nFailed: *${failed}*`));
}

function cmdUsers(reply, senderNumber) {
  if (senderNumber!== OWNER_NUMBER) return reply('Access denied.');
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
  if (senderNumber!== OWNER_NUMBER) return reply('Access denied.');
  const r = await getSmmBalance();
  if (!r.ok) return reply(panel('SMM Panel Balance', `Error: ${r.error}`));
  return reply(panel('SMM Panel Balance',
    `Balance: *${r.data?.balance?? '—'}*\nCurrency: ${r.data?.currency?? '—'}`));
}

async function cmdSmmList(reply, senderNumber, args) {
  if (senderNumber!== OWNER_NUMBER) return reply('Access denied.');
  await reply(panel('SMM Panel', 'Fetching service list from panel...'));
  const r = await listSmmServices();
  if (!r.ok ||!Array.isArray(r.data)) {
    return reply(panel('SMM Panel', `Error: ${r.error || 'Unexpected response.'}`));
  }
  const search = (args[0] || '').toLowerCase();
  const filtered = search? r.data.filter((s) => (s.name || '').toLowerCase().includes(search)) : r.data;
  const sample = filtered.slice(0, 40);
  const body =
    `Total: ${r.data.length} • Showing: ${sample.length}\n\n` +
    sample.map((s) => `[${s.service}] ${s.name}\n rate ${s.rate} • min ${s.min} • max ${s.max}`).join('\n');
  return reply(panel('SMM Panel Services', body));
}

function cmdPanic(reply, senderNumber) {
  if (senderNumber!== OWNER_NUMBER) return reply('Access denied.');
  return reply(panel('System Status',
    `Bot uptime: ${(process.uptime() / 60).toFixed(1)} min\n` +
    `Node: ${process.version}\n` +
    `Memory: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB\n` +
    `GitHub token: DISABLED (V1)\n` +
    `SMM key: ${process.env.SMM_KEY? 'OK' : 'MISSING'}\n` +
    `5SIM key: ${process.env.FIVESIM_API_KEY? 'OK' : 'MISSING'}\n` +
    `Gemini: ${process.env.AI_INTEGRATIONS_GEMINI_API_KEY? 'OK' : 'MISSING'}`));
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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    // === LATEST + 60 SEC DELAY - THE ONE THAT WORKED BEFORE ===
    if (connection === 'connecting' && !sock.authState.creds.registered) {
      console.log('!!! HARPS TECH LATEST MODE!!!');
      console.log(' Waiting 60 seconds for WhatsApp server...');
      
      // Auto delete auth to fix "Couldn't link device"
      if (fs.existsSync(AUTH_FOLDER)) {
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        console.log('[CLEANUP] Old auth deleted');
      }
      
      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(PHONE_NUMBER);
          console.log('\n');
          console.log('═══════════════════════════════════════════');
          console.log(` 🔥🔥 LATEST CODE: ${code} 🔥🔥`);
          console.log('═══════════════════════════════════════════');
          console.log(' ⚠️  YOU GET 8-10 SECONDS ONLY - BE FAST');
          console.log(' 📱 WhatsApp → Settings → Linked Devices');
          console.log('    Link with Phone Number → +234 814 161 2736');
          console.log('═══════════════════════════════════════════');
          console.log('\n');
          
        } catch (err) {
          console.log('[ERROR] Pairing failed:', err.message);
          console.log('[AUTO-FIX] Restarting in 3 seconds...');
          setTimeout(() => process.exit(1), 3000);
        }
      }, 60000); // 60 SECOND DELAY - THIS IS THE KEY
    }

    sock.ev.on('connection.update', (u) => {
      if (u.connection === 'open') {
        console.log('\n🎉🎉 iPHONE 8 LINKED SUCCESSFULLY 🎉🎉🎉\n');
      }
    });

    if (connection === 'open') {
      log.success(`${BOT_NAME} connected as ${sock.user?.id || 'unknown'}`);
    } else if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('[ERROR] 401 Detected. Auto-deleting auth...');
        fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
        console.log(' Auth cleaned. Restarting for fresh pairing...');
      }

      log.warn(`Connection closed (${statusCode}). Reconnecting...`);
      setTimeout(() => {
        startBot().catch((e) => log.error('Restart failed:', e?.message || e));
      }, 3000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type!== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg?.message || msg.key.fromMe) continue;

        const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const text = body?.trim() || '';

        const from = msg.key.remoteJid;
        const isGroup = from.endsWith('@g.us');
        const isPrivate =!isGroup;
        const pushName = msg.pushName || 'there';
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const senderNumber = senderJid.split('@')[0].split(':')[0];

        if (msg.message.audioMessage || msg.message.imageMessage || msg.message.stickerMessage || msg.message.videoMessage) {
          if (isPrivate) {
            await sock.sendMessage(from, {
              text: panel('HARPS TECH Bot', `Hello *${pushName}* 👋\n\nI received your voice note/image.\n\nI can only read TEXT right now.\n\nSend *.menu* to see services\nSend *.ai your question* to chat with AI\n\n_${BRAND_TAGLINE}_`)
            }, { quoted: msg });
          }
          continue;
        }

        if (!text) continue;

        if (text && isCursed(text) &&!text.startsWith(PREFIX)) {
          const groupSet = isGroup? getGroupSettings(from) : { enabled: true };
          if (groupSet.enabled) {
            await autoSavage(sock, msg, from, pushName);
            continue;
          }
        }

        if (text.startsWith(PREFIX)) {
          await handleCommand(sock, msg, text);
          continue;
        }

        if (isPrivate) {
          const db = loadDB();
          const isChillMode = db.users[senderNumber]?.chillMode || false;

          if (isChillMode) {
            const lowerText = text.toLowerCase().trim();
            let reply = '';

            if (lowerText.includes('how far') || lowerText.includes('sup')) {
              reply = `I dey o *${pushName}* 😂 You sef how far? Wetin dey happen?`;
            } else if (lowerText.includes('wetin') || lowerText.includes('what')) {
              reply = `Nothing much o *${pushName}* 😎 Just dey observe life. You?`;
            } else if (lowerText.includes('money') || lowerText.includes('broke')) {
              reply = `Omo money matter 😂 We go hustle am. God dey. You get update?`;
            } else if (lowerText.includes('love') || lowerText.includes('babe')) {
              reply = `Ahn ahn *${pushName}* 😂 Love don hold you? Talk to me`;
            } else {
              const chillReplies = [
                `Lmao *${pushName}* 😂 You funny o`,
                `Na so *${pushName}* 😎 I hear you`,
                `True talk *${pushName}* 💯`,
                `Omo e don be for you 😂 Wetin next?`
              ];
              reply = chillReplies[Math.floor(Math.random() * chillReplies.length)];
            }

            await sock.sendMessage(from, { text: reply }, { quoted: msg });
            continue;
          }

          const lowerText = text.toLowerCase().trim();

          const pidginWords = ['watin', 'dey', 'how far', 'abeg', 'omo', 'na you dey', 'ehn', 'wahala', 'shey', 'na', 'oya'];
          if (pidginWords.some(w => lowerText.includes(w))) {
            await sock.sendMessage(from, {
              text: panel('HARPS TECH Bot', `Omo *${pushName}* 👋 You don show!\n\nI be *HARPS TECH Bot* — I dey run business 24/7\n\n*Sharp sharp:*\n• Send *.menu* — See all wey I fit do\n• Send *.ai* + your question — AI go answer ₦50\n• Send *.pay* — Fund wallet to buy\n• Send *.chill* — Gist mode\n\nNo dull yourself 👇 Type *.menu*\n\n_${BRAND_TAGLINE}_`)
            }, { quoted: msg });
            continue;
          }

          const greetings = ['hey', 'hi', 'hello', 'sup', 'yo', 'good morning', 'good afternoon', 'good evening', 'gm', 'gn'];
          if (greetings.some(g => lowerText.startsWith(g))) {
            await sock.sendMessage(from, {
              text: panel('Welcome to Harps Tech', `Hello *${pushName}* 👋\n\nI'm *HARPS TECH Bot* — your 24/7 business assistant.\n\n*Quick Start:*\n• Send *.menu* — see all services\n• Send *.ai how to make money* — chat with AI ₦50\n• Send *.balance* — check wallet\n• Send *.chill* — Friend mode\n\n_${BRAND_TAGLINE}_`)
            }, { quoted: msg });
            continue;
          }

          await sock.sendMessage(from, {
            text: panel('HARPS TECH Bot', `Hi *${pushName}* 👋\n\nDid you need help?\n\n*Popular commands:*\n• *.menu* — Full service list\n• *.services* — Business catalog \n• *.ai* + question — AI chat ₦50\n• *.pay* — Fund your wallet\n• *.chill* — Gist with me\n\nType *.menu* to start 👇\n\n_${BRAND_TAGLINE}_`)
          }, { quoted: msg });
          continue;
        }

        if (isGroup) {
          const groupSet = getGroupSettings(from);
          if (!groupSet.enabled) continue;

          if (groupSet.cruise && (text.toLowerCase().includes('harps') || text.toLowerCase().includes('bot'))) {
            const responses = [
              `Na who mention HARPS TECH? 😏 Money dey?`,
              `Yes boss *${pushName}* 😂 Wetin you want buy?`,
              `I dey here o. Type.menu to see services 💰`,
              `No disturb me unless na business 📈`
            ];
            await sock.sendMessage(from, {
              text: responses[Math.floor(Math.random() * responses.length)]
            }, { quoted: msg });
          }
        }

        getUser(`${senderJid.split('@')[0]}@s.whatsapp.net`, msg.pushName || senderNumber);

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
