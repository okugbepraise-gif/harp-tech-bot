// ===== HARPS TECH PROv1 =====
import fs from 'fs-extra';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pino from 'pino';

// DYNAMIC IMPORT FOR BAILEYS ESM
const baileys = await import('@whiskeysockets/baileys');
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason, Browsers, makeCacheableSignalKeyStore, downloadMediaMessage } = baileys;

// ===== CONFIG - HARPS TECH PROv1 =====
const config = {
  BOT_NAME: 'HARPS TECH PROv1',
  DEFAULT_PREFIX: '.',
  PHONE_NUMBER: process.env.PHONE_NUMBER,
  OWNER_NUMBER: process.env.OWNER_NUMBER,
  OPAY_ACCOUNT: process.env.OPAY_ACCOUNT || '8141612736',
  OPAY_NAME: process.env.OPAY_NAME || 'OKUGBE PRAISE',
  GEMINI_KEY: process.env.GEMINI_API_KEY,
  SHOPRIME_KEY: process.env.SHOPRIME_API_KEY,
  SUPPORT_NUMBER: process.env.OWNER_NUMBER,
  RENDER_URL: process.env.RENDER_EXTERNAL_URL || `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`,
  BANNED_WORDS: ['fuck','idiot','stupid','mumu','ode','bastard','fool','shit','dick','pussy'],
  REPLY_DELAY: 2500,

  // DISCLAIMER - TO PROTECT YOU BOSS
  DISCLAIMER: `*⚠️ DISCLAIMER*\n\nHARPS TECH PROv1 is only a reseller platform. We use 3rd party service provider Shoprime for all social media services.\n\n1. We do not guarantee 100% retention. Drop may occur.\n2. Account must be PUBLIC. Private accounts will be cancelled automatically.\n3. Delivery time is estimated. Actual time may vary.\n4. No refunds after order is processed by Shoprime.\n5. For bulk discount, contact owner directly.\n\nBy using this bot, you agree to these terms.`,

  // RANDOM ADS WITH 📢
  ADS: [
    "📢 HARPS TECH: Cheapest 1GB Data = ₦280! Type.data mtn 1gb",
    "📢 USA Number for WhatsApp?.yanky usa - ₦500 instant!",
    "📢 1K TikTok Followers = ₦15K. Real & Active. Type.followers",
    "📢 10 IG Followers = ₦350. Nigerian Active. Type.followers instagram <link> 10",
    "📢 10 YouTube Subs = ₦1,200. Type.subs youtube <link> 10",
    "📢 WAEC/NECO Scratch Card Available!.exam waec - ₦800",
    "📢 Bet9ja Instant Funding?.betfund 1000 - Fast!",
    "📢 Pay NEPA Bill Here!.electricity 5000",
    "📢 DSTV Compact = ₦10,500.cable dstv compact",
    "📢 Premium Plan = ₦30K.premium - Netflix + 1K Followers FREE",
    "📢 Need Hostel in School?.hostel_hunt oau - ₦500"
  ],

  // 31 NIGERIAN SERVICES - YOUR CUSTOM PRICES
  SERVICES: {
    tiktok_followers: { min: 30, max: 1000000, price_per_1k: 15000, name: 'TikTok Followers', cat: 'Social', example: '.followers tiktok https://tiktok.com/@username 1000' },
    tiktok_likes: { min: 10, max: 500000, price_per_1k: 5000, name: 'TikTok Likes', cat: 'Social', example: '.likes tiktok https://tiktok.com/@username 10' },
    tiktok_views: { min: 100, max: 10000000, price_per_1k: 2000, name: 'TikTok Views', cat: 'Social', example: '.views tiktok https://tiktok.com/@username 1000' },
    instagram_followers: { min: 10, max: 20000, price_per_1k: 35000, name: 'Instagram Followers', cat: 'Social', example: '.followers instagram https://instagram.com/username 10' },
    instagram_likes: { min: 10, max: 500000, price_per_1k: 5000, name: 'Instagram Likes', cat: 'Social', example: '.likes instagram https://instagram.com/post 10' },
    instagram_views: { min: 100, max: 500000, price_per_1k: 1000, name: 'Instagram Views', cat: 'Social', example: '.views instagram https://instagram.com/reel 100' },
    youtube_subs: { min: 50, max: 100000, price_per_1k: 120000, name: 'YouTube Subscribers', cat: 'Social', example: '.subs youtube https://youtube.com/@channel 10' },
    youtube_views: { min: 1000, max: 5000000, price_per_1k: 2000, name: 'YouTube Views', cat: 'Social', example: '.views youtube https://youtube.com/watch?v=xxx 1000' },
    facebook_followers: { min: 100, max: 100000, price_per_1k: 7000, name: 'Facebook Followers', cat: 'Social', example: '.followers facebook https://facebook.com/page 100' },
    twitter_followers: { min: 100, max: 70000, price_per_1k: 250000, name: 'Twitter Followers', cat: 'Social', example: '.followers twitter https://twitter.com/username 100' },
    mtn_data_1gb: { price: 280, name: 'MTN 1GB Data', cat: 'Data', example: '.data mtn 1gb 08012345678' },
    airtel_data_2gb: { price: 550, name: 'Airtel 2GB Data', cat: 'Data', example: '.data airtel 2gb 08012345678' },
    glo_data_5gb: { price: 1200, name: 'Glo 5GB Data', cat: 'Data', example: '.data glo 5gb 08012345678' },
    airtime: { min: 50, max: 50000, price_per_1: 1, name: 'Airtime All Networks', cat: 'Airtime', example: '.airtime mtn 500 08012345678' },
    electricity: { min: 1000, max: 50000, name: 'Electricity Bill', cat: 'Bills', example: '.electricity 5000 Ikeja 123456789' },
    dstv_compact: { price: 10500, name: 'DSTV Compact', cat: 'Bills', example: '.cable dstv compact 123456789' },
    gotv_max: { price: 5700, name: 'GOTV Max', cat: 'Bills', example: '.cable gotv max 123456789' },
    startimes: { price: 3800, name: 'Startimes Smart', cat: 'Bills', example: '.cable startimes smart 123456789' },
    bet9ja: { min: 100, max: 100000, name: 'Bet9ja Funding', cat: 'Betting', example: '.betfund bet9ja 1000 123456789' },
    sportybet: { min: 100, max: 100000, name: 'Sportybet Funding', cat: 'Betting', example: '.betfund sportybet 1000 123456789' },
    msport: { min: 100, max: 100000, name: 'MSport Funding', cat: 'Betting', example: '.betfund msport 1000 123456789' },
    waec_scratch: { price: 800, name: 'WAEC Scratch Card', cat: 'Education', example: '.exam waec' },
    neco_scratch: { price: 800, name: 'NECO Scratch Card', cat: 'Education', example: '.exam neco' },
    jamb_pin: { price: 4700, name: 'JAMB ePIN', cat: 'Education', example: '.exam jamb' },
    yanky_usa: { price: 500, name: 'USA Number', cat: 'Numbers', example: '.yanky usa' },
    yanky_uk: { price: 600, name: 'UK Number', cat: 'Numbers', example: '.yanky uk' },
    yanky_canada: { price: 550, name: 'Canada Number', cat: 'Numbers', example: '.yanky canada' },
    netflix: { price: 3500, name: 'Netflix Account 1 Month', cat: 'Streaming', example: '.netflix' },
    dstv_box_office: { price: 1000, name: 'DSTV Box Office Rental', cat: 'Streaming', example: '.dstv_box_office' },
    showmax: { price: 2900, name: 'Showmax Mobile', cat: 'Streaming', example: '.showmax' },
    spotify: { price: 1200, name: 'Spotify Premium 1 Month', cat: 'Streaming', example: '.spotify' },
    apple_music: { price: 1200, name: 'Apple Music 1 Month', cat: 'Streaming', example: '.apple_music' },
    bulk_sms: { min: 100, price_per_1: 3, name: 'Bulk SMS Units', cat: 'Marketing', example: '.bulk_sms 08012345678,08098765432 Hello!' },
    biz_card: { price: 5000, name: 'Digital Business Card Design', cat: 'Design', example: '.biz_card' },
    logo: { price: 8000, name: 'Logo Design', cat: 'Design', example: '.logo' },
    hostel_hunt: { price: 500, name: 'Hostel Agent Service', cat: 'Student', example: '.hostel_hunt oau' },
    project_write: { price: 15000, name: 'Project Writing Service', cat: 'Student', example: '.project_write' },
    crypto_buy: { min: 1000, name: 'USDT/BTC Purchase', cat: 'Crypto', example: '.crypto_buy usdt 5000' },
    vpn: { price: 2000, name: 'Premium VPN 1 Month', cat: 'Tools', example: '.vpn' }
  },

  // PREMIUM PLANS
  PREMIUM: {
    basic: { price: 30000, name: 'Premium Basic', benefits: ['Netflix 1 Month', '1K TikTok Followers FREE', '10% Discount All Services', 'Priority Support'], duration_days: 30 },
    pro: { price: 50000, name: 'Premium Pro', benefits: ['Netflix 1 Month', 'Spotify 1 Month', '2K TikTok Followers FREE', '1K IG Followers FREE', '15% Discount', 'VIP Support'], duration_days: 30 },
    biz: { price: 100000, name: 'Business Premium', benefits: ['All Pro Benefits', '5K TikTok Followers FREE', 'Custom Bot Setup', '20% Discount', 'Dedicated Account Manager'], duration_days: 30 }
  },

  GAMES: {
    trivia: { name: 'Trivia Quiz' }, slot: { name: 'Slot Machine' },
    blackjack: { name: 'Blackjack 21' }, dice: { name: 'Dice Roll' },
    rps: { name: 'Rock Paper Scissors' }, tictactoe: { name: 'Tic Tac Toe' },
    hangman: { name: 'Hangman' }, math: { name: 'Math Quiz' },
    flag: { name: 'Guess Flag' }, lyrics: { name: 'Lyrics Quiz' },
    emoji: { name: 'Emoji Guess' }, wordchain: { name: 'Word Chain' },
    fastest: { name: 'Fastest Finger' }, coin: { name: 'Coin Flip' },
    wyr: { name: 'Would You Rather' }, nhie: { name: 'Never Have I Ever' },
    riddle: { name: 'Riddle' }, anagram: { name: 'Anagrams' },
    guessnum: { name: 'Guess Number' }, tod: { name: 'Truth or Dare' }
  }
};

// ===== SHOPRIME SERVICE ID MAPPING =====
const SHOPRIME_SERVICES = {
  tiktok_followers: 10720,
  tiktok_likes: 10649,
  tiktok_views: 10732,
  instagram_followers: 10619,
  instagram_likes: 10644,
  instagram_views: 9846,
  facebook_followers: 10129,
  twitter_followers: 9582,
  youtube_subs: 8701
};

// ===== DATABASE =====
const DB_PATH = './users.json';
const ORDER_DB = './orders.json';
const VOICE_DB = './voices.json';
const SETTINGS_DB = './settings.json';
[DB_PATH, ORDER_DB, VOICE_DB, SETTINGS_DB].forEach(p => { if (!fs.existsSync(p)) fs.writeJsonSync(p, {}); });
const getDB = () => fs.readJsonSync(DB_PATH);
const saveDB = (data) => { try { fs.writeJsonSync(DB_PATH, data); } catch(e){ console.log('DB Save Error:', e); } };
const getOrders = () => fs.readJsonSync(ORDER_DB);
const saveOrders = (data) => { try { fs.writeJsonSync(ORDER_DB, data); } catch(e){ console.log('Order Save Error:', e); } };
const getVoices = () => fs.readJsonSync(VOICE_DB);
const saveVoices = (data) => { try { fs.writeJsonSync(VOICE_DB, data); } catch(e){ console.log('Voice Save Error:', e); } };
const getSettings = () => fs.readJsonSync(SETTINGS_DB);
const saveSettings = (data) => { try { fs.writeJsonSync(SETTINGS_DB, data); } catch(e){ console.log('Settings Save Error:', e); } };

// ===== SHOPRIME API =====
async function buyFromShoprime(serviceId, link, quantity) {
  if (!config.SHOPRIME_KEY) return { success: false, error: "Shoprime API key not set" };
  try {
    const response = await axios.post('https://shopprime.ng/api/order', {
      key: config.SHOPRIME_KEY,
      action: 'add',
      service: serviceId,
      link: link,
      quantity: quantity
    });
    if (response.data.order) {
      return { success: true, orderId: response.data.order };
    } else {
      return { success: false, error: response.data.error || "Shoprime failed" };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function checkShoprimeStatus(shoprimeOrderId) {
  if (!config.SHOPRIME_KEY) return { success: false };
  try {
    const response = await axios.post('https://shopprime.ng/api/order', {
      key: config.SHOPRIME_KEY,
      action: 'status',
      order: shoprimeOrderId
    });
    return { success: true, status: response.data.status, charge: response.data.charge };
  } catch (err) {
    return { success: false };
  }
}

// ===== GEMINI AI + PIDGIN DETECT =====
const genAI = config.GEMINI_KEY? new GoogleGenerativeAI(config.GEMINI_KEY) : null;
function isPidgin(text) {
  const pidginWords = ['dey','nor','abi','wey','na','oga','comot','chop','wan','shey','wetin','how far','e be','no be','una'];
  return pidginWords.some(w => text.toLowerCase().includes(w));
}
async function askGemini(text) {
  if (!genAI) return "AI offline. Contact owner.";
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const mode = isPidgin(text)? 'pidgin' : 'business';
    const prompt = mode === 'pidgin'
  ? `You are HARPS TECH bot. Reply in Nigerian Pidgin English like street guy. Be helpful, funny and friendly. User: ${text}`
      : `You are HARPS TECH PROv1, a professional Nigerian business WhatsApp bot. Reply professionally, classic, brief and helpful. User: ${text}`;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch { return "Network error. Please try again."; }
}

// ===== VN CLONE =====
async function saveVoiceNote(msg) {
  const voices = getVoices();
  const buffer = await downloadMediaMessage(msg, 'buffer', {});
  const voiceId = Date.now().toString();
  voices[voiceId] = buffer.toString('base64');
  voices['latest'] = voiceId;
  saveVoices(voices);
  return voiceId;
}
async function sendVNClone(sock, from, text) {
  const voices = getVoices();
  const latestId = voices['latest'];
  if (latestId && voices[latestId]) {
    const audioBuffer = Buffer.from(voices[latestId], 'base64');
    await sock.sendMessage(from, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true });
    await sock.sendMessage(from, { text: `🎙️ ${text}` });
  } else {
    await sock.sendMessage(from, { text: `🎙️ VN: ${text}\n\n_Note: Send me a voice note to clone your voice_` });
  }
}

// ===== UTILS =====
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SAVAGE_LINES = ["Oga, respect yourself. Your papa no teach you home training?","Mumu, go sit down. You dey mad?","Fool, rest. I go report you to admin.","Bastard, shift one side. Werey.","Thunder fire you. Ode.","Your head correct so? Idiot."];

function calculatePrice(service, qty = 1) {
  const s = config.SERVICES[service];
  if (!s) return null;
  let amount = s.price_per_1k? Math.ceil((qty / 1000) * s.price_per_1k) : s.price || qty;
  if (qty >= 1000000) amount = Math.ceil(amount * 0.8);
  else if (qty >= 500000) amount = Math.ceil(amount * 0.85);
  else if (qty >= 100000) amount = Math.ceil(amount * 0.9);
  return { amount, serviceName: s.name, cat: s.cat };
}

function createOrder(userId, service, link, qty, amount, type = 'service') {
  const orders = getOrders();
  const orderId = 'HT' + Date.now().toString().slice(-6);
  orders[orderId] = { userId, service, link, qty, amount, type, status: 'pending', created: Date.now() };
  saveOrders(orders);
  return orderId;
}

function getUserData(userId) {
  const db = getDB();
  if (!db[userId]) {
    db[userId] = { wallet: 0, referrals: [], totalSpent: 0, premium: null, referredBy: null, customPrefix: null, awayMessage: null };
    saveDB(db);
  }
  return db[userId];
}

function isPremiumActive(userData) {
  if (!userData.premium) return false;
  return Date.now() < userData.premium.expires;
}

function getUserPrefix(userId) {
  return getUserData(userId).customPrefix || config.DEFAULT_PREFIX;
}

// ===== BOT START =====
const AUTH_FOLDER = './session';
const logger = pino({ level: 'silent' });
let pairingCodeRequested = false;

async function startBot() {
  if (!config.PHONE_NUMBER) {
    console.log('❌ PHONE_NUMBER not set in environment variables');
    return;
  }

  // 🔥 BOSS FIX: FORCE CLEAR SESSION + WAIT LONGER FOR RENDER FREE
  if (fs.existsSync(AUTH_FOLDER)) {
    console.log('🧹 Clearing old session to prevent Code 405...');
    fs.removeSync(AUTH_FOLDER);
    await delay(5000);
  }

  await fs.ensureDir(AUTH_FOLDER);
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    logger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'), // 🔥 CHANGED FROM MACOS TO UBUNTU - FIXES CODE 405 ON RENDER
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    markOnlineOnConnect: false,
  });

  // FIXED CONNECTION + PAIRING CODE
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'connecting' &&!sock.authState.creds.registered &&!pairingCodeRequested) {
      pairingCodeRequested = true;
      console.log('\n!!! HARPS TECH PROv1 PAIRING MODE!!!');
      console.log('Waiting 35 seconds for Baileys to load...\n'); // 35S FOR RENDER SLOW SERVERS

      setTimeout(async () => {
        try {
          const code = await sock.requestPairingCode(config.PHONE_NUMBER);
          console.log('═══════════════');
          console.log(` 🔥🔥 8-DIGIT CODE: ${code} 🔥🔥`);
          console.log('═══════════════');
          console.log('COPY THIS CODE TO WHATSAPP NOW');
          console.log('WhatsApp > Settings > Linked Devices > Link with phone number');
        } catch (err) {
          console.log('[PAIRING ERROR]:', err.message);
          pairingCodeRequested = false;
          setTimeout(() => process.exit(1), 5000);
        }
      }, 35000);
    }

    if (connection === 'open') {
      console.log(`✅ ${config.BOT_NAME} Connected Successfully`);
      pairingCodeRequested = false;
    } else if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`[CONNECTION CLOSED]: Code ${code}`);

      // 🔥 BOSS NEW: 2MIN COOLDOWN TO PREVENT 24H BAN
      if (code === DisconnectReason.loggedOut || code === 405 || code === 401) {
        console.log('🚫 WhatsApp rate limit detected. 2min cooldown to prevent 24h ban...');
        fs.removeSync(AUTH_FOLDER);
        pairingCodeRequested = false;
        await delay(120000); // 2 MIN COOLDOWN
        process.exit(1);
      }

      console.log('Restarting in 15 seconds...');
      setTimeout(() => process.exit(1), 15000);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // AUTO ADVERTISE IN GROUPS
  setInterval(async () => {
    const groups = await sock.groupFetchAllParticipating();
    const ad = config.ADS[Math.floor(Math.random() * config.ADS.length)];
    for (const groupId of Object.keys(groups)) {
      try {
        await sock.sendMessage(groupId, { text: ad });
        await delay(2000);
      } catch {}
    }
  }, 15 * 60 * 1000);

  // AUTO CHECK SHOPRIME DELIVERY STATUS EVERY 5 MINUTES
  setInterval(async () => {
    const orders = getOrders();
    for (const orderId in orders) {
      const order = orders[orderId];
      if (order.status === 'processing' && order.shoprimeOrderId) {
        const status = await checkShoprimeStatus(order.shoprimeOrderId);
        if (status.success && status.status === 'Completed') {
          order.status = 'completed';
          await sock.sendMessage(order.userId + '@s.whatsapp.net', {
            text: `✅ *ORDER COMPLETED*\n\nOrder ID: #${orderId}\nService: ${config.SERVICES[order.service].name}\nQuantity: ${order.qty.toLocaleString()}\n\nThank you for patronizing HARPS TECH PROv1!\n\n${config.DISCLAIMER}`
          });
          saveOrders(orders);
        }
      }
    }
  }, 5 * 60 * 1000);

  // ===== MESSAGE HANDLER =====
  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg?.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid;
      const sender = msg.key.participant || from;
      const senderNum = sender.split('@')[0];
      const isGroup = from.endsWith('@g.us');
      const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || '';
      const text = body.trim();

      // AUTO FORWARD VIEW ONCE TO OWNER
      if (msg.message?.viewOnceMessageV2 && senderNum!== config.OWNER_NUMBER) {
        try {
          const owner = config.OWNER_NUMBER + '@s.whatsapp.net';
          const media = await downloadMediaMessage(msg, 'buffer', {});
          const mtype = Object.keys(msg.message.viewOnceMessageV2.message)[0].replace('Message','');
          await sock.sendMessage(owner, { [mtype]: media, caption: `👀 *VIEW ONCE FROM @${senderNum}*\n\nThis message was auto-forwarded to you.` });
          console.log(`[AUTO-VV] Forwarded view-once from ${senderNum} to owner`);
        } catch(e){ console.log('[AUTO-VV ERROR]:', e); }
      }

      const userData = getUserData(senderNum);
      const userPrefix = userData.customPrefix || config.DEFAULT_PREFIX;
      const isCommand = text.startsWith(userPrefix);
      const cmd = isCommand? text.toLowerCase().split(' ')[0] : '';
      const cmdWithoutPrefix = cmd.replace(userPrefix, '');
      const args = isCommand? text.split(' ').slice(1) : [];

      if (!isCommand && userData.awayMessage &&!isGroup) {
        await delay(config.REPLY_DELAY);
        await sock.sendMessage(from, { text: userData.awayMessage }, { quoted: msg });
        continue;
      }

      if (msg.message?.audioMessage && senderNum === config.OWNER_NUMBER) {
        await saveVoiceNote(msg);
        await delay(config.REPLY_DELAY);
        await sock.sendMessage(from, { text: `✅ *Voice Cloned!*\n\nYour voice saved. Bot go dey talk like you now when use.chill mode.` }, { quoted: msg });
        continue;
      }

      await delay(config.REPLY_DELAY);

      if (cmd === `${userPrefix}vv` && msg.message?.viewOnceMessageV2) {
        try {
          const owner = config.OWNER_NUMBER + '@s.whatsapp.net';
          const media = await downloadMediaMessage(msg, 'buffer', {});
          const mtype = Object.keys(msg.message.viewOnceMessageV2.message)[0].replace('Message','');
          await sock.sendMessage(owner, { [mtype]: media, caption: `👀 Manual ViewOnce from @${senderNum}` });
          await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        } catch { await sock.sendMessage(from, { text: '❌ Failed to view. Message might be already opened.' }, { quoted: msg }); }
        continue;
      }

      if ([`${userPrefix}tiktok`,`${userPrefix}ig`,`${userPrefix}instagram`,`${userPrefix}yt`,`${userPrefix}youtube`].includes(cmd)) {
        await sock.sendMessage(from, { text: `*${config.BOT_NAME}*\n\n⚠️ Video download temporarily disabled.\nContact owner to enable it.` }, { quoted: msg });
        continue;
      }

      if (cmd === `${userPrefix}menu`) {
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - SERVICES MENU*\n\n━━━━━━━━━━━━
*📱 SOCIAL MEDIA*
•.followers tiktok <link> <qty> - 1K = ₦15,000
  Example:.followers tiktok https://tiktok.com/@user 1000
•.likes tiktok <link> <qty> - 10 = ₦50
•.followers instagram <link> <qty> - 10 = ₦350
•.likes instagram <link> <qty> - 10 = ₦50
•.views instagram <link> <qty> - 10 = ₦10
•.subs youtube <link> <qty> - 10 = ₦1,200
•.followers facebook <link> <qty> - 10 = ₦70
•.followers twitter <link> <qty> - 10 = ₦2,500

*📊 DATA & AIRTIME*
•.data mtn 1gb 08012345678 - ₦280
•.airtime mtn 500 08012345678 - ₦500

*💡 BILLS*
•.electricity 5000 Ikeja 123456789 - ₦5,000
•.cable dstv compact 123456789 - ₦10,500

*🎰 BETTING*
•.betfund bet9ja 1000 123456789 - ₦1,000

*📚 EDUCATION*
•.exam waec - ₦800

*📞 NUMBERS*
•.yanky usa - ₦500

*💎 PREMIUM*
•.premium basic - ₦30,000/30days
•.premium pro - ₦50,000/30days

*🎮 GAMES*
•.game trivia - Play & Win Cash!

*💼 OTHER SERVICES*
•.hostel_hunt oau - ₦500
•.project_write - ₦15,000
•.crypto_buy usdt 5000 - ₦5,000

━━━━━━━━━━━━
*⚠️ IMPORTANT*
• Account must be PUBLIC for social media
• ${config.DISCLAIMER}
• For bulk discount, message owner: wa.me/${config.SUPPORT_NUMBER}
• Type ${userPrefix}help for full guide` }, { quoted: msg });
        continue;
      }

      if (cmd === `${userPrefix}help`) {
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - HOW TO USE*\n\n━━━━━━━━━━━━
*1. SOCIAL MEDIA ORDER FORMAT*
${userPrefix}followers <platform> <link> <quantity>
${userPrefix}likes <platform> <link> <quantity>
${userPrefix}views <platform> <link> <quantity>
${userPrefix}subs <platform> <link> <quantity>

*EXAMPLES:*
• ${userPrefix}followers tiktok https://tiktok.com/@user 1000
• ${userPrefix}likes instagram https://instagram.com/post 10
• ${userPrefix}subs youtube https://youtube.com/@channel 10

*2. DATA & AIRTIME*
${userPrefix}data <network> <plan> <phone>
Example: ${userPrefix}data mtn 1gb 08012345678

*3. BILLS*
${userPrefix}electricity <amount> <disco> <meter>
Example: ${userPrefix}electricity 5000 Ikeja 123456789

*4. RECEIPT*
${userPrefix}receipt <orderId>
Example: ${userPrefix}receipt HT123456

*5. DISCOUNT*
For bulk orders or discount, message owner directly:
wa.me/${config.SUPPORT_NUMBER}

━━━━━━━━━━━━
${config.DISCLAIMER}
━━━━━━━━━━━━` }, { quoted: msg });
        continue;
      }

      // SOCIAL MEDIA ORDERS
      if (['followers','likes','views','subs'].includes(cmdWithoutPrefix)) {
        const platform = args[0];
        const link = args[1];
        const qty = parseInt(args[2]);
        const serviceKey = `${platform}_${cmdWithoutPrefix}`;
        const service = config.SERVICES[serviceKey];

        if (!platform ||!link ||!qty ||!service) {
          return sock.sendMessage(from, { text: `*${config.BOT_NAME} - ORDER FORMAT*\n\nUsage: ${cmd} <platform> <link> <quantity>\n\n*EXAMPLE:*\n${config.SERVICES[serviceKey]?.example || '.followers tiktok <link> 1000'}\n\n*⚠️ ACCOUNT MUST BE PUBLIC*\nMin: ${service?.min || 10} | Max: ${service?.max || 'Unlimited'}\n\nPay to: ${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\n\n${config.DISCLAIMER}` }, { quoted: msg });
        }

        if (!SHOPRIME_SERVICES[serviceKey]) {
          return sock.sendMessage(from, { text: '*❌ Service not available yet*\n\nContact owner to add this service.' }, { quoted: msg });
        }

        const price = calculatePrice(serviceKey, qty);
        let finalAmount = price.amount;
        if (isPremiumActive(userData)) {
          const discount = userData.premium.plan === 'basic'? 0.1 : userData.premium.plan === 'pro'? 0.15 : 0.2;
          finalAmount = Math.ceil(price.amount * (1 - discount));
        }

        const shoprimeRes = await buyFromShoprime(SHOPRIME_SERVICES[serviceKey], link, qty);
        if (!shoprimeRes.success) {
          return sock.sendMessage(from, { text: `❌ *ORDER FAILED*\n\n${shoprimeRes.error}\n\nContact owner for refund.` }, { quoted: msg });
        }

        const orderId = createOrder(senderNum, serviceKey, link, qty, finalAmount);
        const orders = getOrders();
        orders[orderId].shoprimeOrderId = shoprimeRes.orderId;
        orders[orderId].status = 'processing';
        saveOrders(orders);

        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - ORDER CONFIRMATION*\n\n━━━━━━━━━━━━\nOrder ID: #${orderId}\nService: ${price.serviceName}\nQuantity: ${qty.toLocaleString()}\nAmount: ₦${finalAmount.toLocaleString()}${isPremiumActive(userData)? ' (Premium Discount Applied)' : ''}\nCategory: ${price.cat}\nStatus: Processing\n━━━━━━━━━━━━\n\n*PAYMENT DETAILS*\nBank: Opay\nAccount: ${config.OPAY_ACCOUNT}\nName: ${config.OPAY_NAME}\n\n⚠️ *IMPORTANT*\n1. Account must be PUBLIC\n2. Delivery: 0-24hrs after confirmation\n3. Type ${userPrefix}receipt ${orderId} for receipt\n${config.DISCLAIMER}` }, { quoted: msg });
        continue;
      }

      // NON-SOCIAL SERVICES
      const allServiceKeys = Object.keys(config.SERVICES);
      if (allServiceKeys.includes(cmdWithoutPrefix)) {
        const service = config.SERVICES[cmdWithoutPrefix];
        let qty = parseInt(args[0]) || service.min || 1;
        let link = args[1] || 'N/A';

        const price = calculatePrice(cmdWithoutPrefix, qty);
        if (!price) return sock.sendMessage(from, { text: '*Service not available or invalid quantity*' }, { quoted: msg });

        let finalAmount = price.amount;
        if (isPremiumActive(userData)) {
          const discount = userData.premium.plan === 'basic'? 0.1 : userData.premium.plan === 'pro'? 0.15 : 0.2;
          finalAmount = Math.ceil(price.amount * (1 - discount));
        }

        const orderId = createOrder(senderNum, cmdWithoutPrefix, link, qty, finalAmount);
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - ORDER CONFIRMATION*\n\n━━━━━━━━━━━━\nOrder ID: #${orderId}\nService: ${price.serviceName}\nQuantity: ${qty.toLocaleString()}\nAmount: ₦${finalAmount.toLocaleString()}${isPremiumActive(userData)? ' (Premium Discount Applied)' : ''}\nCategory: ${price.cat}\n━━━━━━━━━━━━\n\n*PAYMENT DETAILS*\nBank: Opay\nAccount: ${config.OPAY_ACCOUNT}\nName: ${config.OPAY_NAME}\n\n⚠️ *IMPORTANT*\n1. Send payment proof to owner\n2. Type ${userPrefix}receipt ${orderId} after payment\n3. Delivery: 0-24hrs after confirmation\n${config.DISCLAIMER}` }, { quoted: msg });
        continue;
      }

      if (cmd === `${userPrefix}receipt`) {
        const orderId = args[0];
        if (!orderId) return sock.sendMessage(from, { text: `*Usage:* ${userPrefix}receipt <orderId>\n\nExample: ${userPrefix}receipt HT123456` }, { quoted: msg });
        const orders = getOrders();
        const order = orders[orderId];
        if (!order || order.userId!== senderNum) return sock.sendMessage(from, { text: '*Receipt Not Found*\n\nCheck your Order ID or contact support.' }, { quoted: msg });
        const service = config.SERVICES[order.service];
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - OFFICIAL RECEIPT*\n\n━━━━━━━━━━━━\nReceipt #: ${orderId}\nDate: ${new Date(order.created).toLocaleString()}\nCustomer: @${senderNum}\n━━━━━━━━━━━━\n\n*ITEM DETAILS*\nService: ${service.name}\nQuantity: ${order.qty.toLocaleString()}\nLink: ${order.link}\n\n*PAYMENT*\nAmount Paid: ₦${order.amount.toLocaleString()}\nStatus: ${order.status.toUpperCase()}\nMethod: Bank Transfer\n━━━━━━━━━━━━\n*HARPS TECH PROv1*\n${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\nThank you for your patronage!\n\n${config.DISCLAIMER}\n━━━━━━━━━━━━` }, { quoted: msg });
        continue;
      }

      //.invest
      if (cmd === `${userPrefix}invest`) {
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - INVESTMENT PLANS*\n\n━━━━━━━━━━━━\n*📈 PLANS AVAILABLE*\n\n1. *Starter* - ₦10,000\nReturn: ₦15,000 in 30 days\nROI: 50%\n\n2. *Growth* - ₦50,000\nReturn: ₦80,000 in 30 days\nROI: 60%\n\n3. *Premium* - ₦100,000\nReturn: ₦170,000 in 30 days\nROI: 70%\n\n━━━━━━━━━━━━\n*HOW TO INVEST*\n1. Pay to: ${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\n2. Send proof to owner\n3. Type: ${userPrefix}invest confirm <amount>\n\n*Note:* Investment is managed by HARPS TECH. T&C Apply.\n${config.DISCLAIMER}\n━━━━━━━━━━━━` }, { quoted: msg });
        continue;
      }

      //.refer
      if (cmd === `${userPrefix}refer`) {
        const refCode = senderNum;
        const refCount = userData.referrals.length;
        const earnings = refCount * 500;
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - REFERRAL PROGRAM*\n\n━━━━━━━━━━━━\nYour Code: ${refCode}\nTotal Referrals: ${refCount}\nEarnings: ₦${earnings.toLocaleString()}\n━━━━━━━━━━━━\n\n*HOW IT WORKS*\n1. Share your code: ${refCode}\n2. Friend uses: ${userPrefix}start ${refCode}\n3. Friend makes first purchase\n4. You earn ₦500\n*SHARE LINK*\nwa.me/${config.PHONE_NUMBER}?text=${userPrefix}start%20${refCode}\n\nWithdraw: ${userPrefix}withdraw\n━━━━━━━━━━━━` }, { quoted: msg });
        continue;
      }

      //.start - WITH REFERRAL
      if (cmd === `${userPrefix}start` && args[0]) {
        const refCode = args[0];
        if (refCode!== senderNum &&!userData.referredBy) {
          userData.referredBy = refCode;
          const db = getDB();
          if (db[refCode]) {
            db[refCode].referrals.push(senderNum);
            saveDB(db);
          }
          saveDB({...getDB(), [senderNum]: userData});
          await sock.sendMessage(from, { text: `✅ *Referral Applied!*\n\nYou were referred by ${refCode}. You get ₦200 bonus on first order!` }, { quoted: msg });
        } else {
          await sock.sendMessage(from, { text: `*Welcome to ${config.BOT_NAME}!*\n\nType ${userPrefix}menu to see services.\n\n${config.DISCLAIMER}` }, { quoted: msg });
        }
        continue;
      }

      //.hostel_hunt
      if (cmd === `${userPrefix}hostel_hunt`) {
        const school = args[0];
        if (!school) return sock.sendMessage(from, { text: `*${config.BOT_NAME} - HOSTEL HUNT*\n\nUsage: ${userPrefix}hostel_hunt <school>\n\nExample: ${userPrefix}hostel_hunt oau\nExample: ${userPrefix}hostel_hunt unilag\nExample: ${userPrefix}hostel_hunt ui\nPrice: ₦500\nWe connect you to verified agents.\n\n${config.DISCLAIMER}` }, { quoted: msg });
        const orderId = createOrder(senderNum, 'hostel_hunt', school, 1, 500);
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - HOSTEL HUNT ORDER*\n\n━━━━━━━━━━━━\nOrder ID: #${orderId}\nSchool: ${school.toUpperCase()}\nService: Hostel Agent Connection\nAmount: ₦500\n━━━━━━━━━━━━\n\nPay to: ${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\n\nAfter payment, our agent will contact you within 24hrs with available hostels.\n\n${config.DISCLAIMER}` }, { quoted: msg });
        continue;
      }

      //.custom_prefix
      if (cmd === `${userPrefix}custom_prefix`) {
        const newPrefix = args[0];
        if (!newPrefix || newPrefix.length> 2) return sock.sendMessage(from, { text: `*Usage:* ${userPrefix}custom_prefix <symbol>\n\nExample: ${userPrefix}custom_prefix!\nExample: ${userPrefix}custom_prefix /\n\nMax 2 characters. Current: ${userPrefix}` }, { quoted: msg });
        userData.customPrefix = newPrefix;
        saveDB({...getDB(), [senderNum]: userData});
        await sock.sendMessage(from, { text: `✅ *Prefix Changed!*\n\nYour new prefix: ${newPrefix}\n\nExample: ${newPrefix}menu\nExample: ${newPrefix}balance` }, { quoted: msg });
        continue;
      }

      //.auto_reply
      if (cmd === `${userPrefix}auto_reply`) {
        const message = args.join(' ');
        if (!message) return sock.sendMessage(from, { text: `*Usage:* ${userPrefix}auto_reply <message>\n\nExample: ${userPrefix}auto_reply I dey busy now. I go reply you later.\n\nTo disable: ${userPrefix}auto_reply off` }, { quoted: msg });
        if (message.toLowerCase() === 'off') {
          userData.awayMessage = null;
          await sock.sendMessage(from, { text: '✅ *Away Message Disabled*' }, { quoted: msg });
        } else {
          userData.awayMessage = message;
          await sock.sendMessage(from, { text: `✅ *Away Message Set!*\n\nMessage: "${message}"\n\nWhen customers message you, bot go reply this.` }, { quoted: msg });
        }
        saveDB({...getDB(), [senderNum]: userData});
        continue;
      }

      //.support
      if (cmd === `${userPrefix}support`) {
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - SUPPORT*\n\n━━━━━━━━━━━━\n*CONTACT OWNER*\nWhatsApp: wa.me/${config.SUPPORT_NUMBER}\n\n*BUSINESS HOURS*\nMon-Sat: 8AM - 10PM\nSunday: 2PM - 8PM\n*COMMON ISSUES*\n1. Order delay: Send Order ID\n2. Payment issue: Send proof\n3. Technical: Describe problem\nWe reply within 1 hour.\n\n${config.DISCLAIMER}\n━━━━━━━━━━━━` }, { quoted: msg });
        continue;
      }

      //.premium
      if (cmd === `${userPrefix}premium`) {
        const planKey = args[0] || 'basic';
        const plan = config.PREMIUM[planKey];
        if (!plan) return sock.sendMessage(from, { text: `*${config.BOT_NAME} - PREMIUM PLANS*\n\n*Available Plans:*\n1. Basic - ₦30,000/30days\n2. Pro - ₦50,000/30days\n3. Biz - ₦100,000/30days\n*HOW TO BUY:* Pay to ${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\nThen send proof to owner.\n\n${config.DISCLAIMER}` }, { quoted: msg });
        const orderId = createOrder(senderNum, 'premium', planKey, 1, plan.price, 'premium');
        await sock.sendMessage(from, { text: `*${config.BOT_NAME} - PREMIUM ORDER*\n\n━━━━━━━━━━━━\nPlan: ${plan.name}\nPrice: ₦${plan.price.toLocaleString()}\nDuration: ${plan.duration_days} days\nBenefits:\n${plan.benefits.map(b => `• ${b}`).join('\n')}\n━━━━━━━━━━━━\n\nPay to: ${config.OPAY_ACCOUNT} - ${config.OPAY_NAME}\n\nAfter payment, send proof to owner for activation.\n\n${config.DISCLAIMER}` }, { quoted: msg });
        continue;
      }

      //.chill - VN MODE
      if (cmd === `${userPrefix}chill`) {
        const chatText = args.join(' ');
        if (!chatText) return sock.sendMessage(from, { text: `*Usage:* ${userPrefix}chill <your message>\n\nExample: ${userPrefix}chill How are you today?\n\nBot go reply you with voice note like owner.` }, { quoted: msg });
        const aiResponse = await askGemini(chatText);
        await sendVNClone(sock, from, aiResponse);
        continue;
      }

      // GAME COMMANDS
      if (cmd === `${userPrefix}game`) {
        const gameType = args[0]?.toLowerCase();
        const game = config.GAMES[gameType];
        if (!game) return sock.sendMessage(from, { text: `*${config.BOT_NAME} - GAMES*\n\n*Available Games:*\ntrivia, slot, blackjack, dice, rps, tictactoe, hangman, math, flag, lyrics, emoji, wordchain, fastest, coin, wyr, nhie, riddle, anagram, guessnum, tod\n*Example:* ${userPrefix}game trivia\n*Win Cash:* 1st place gets ₦500 cash prize!` }, { quoted: msg });
        await sock.sendMessage(from, { text: `🎮 *${game.name} STARTED!*\n\nGame coming soon! Cash prize: ₦500\nContact owner to play now.` }, { quoted: msg });
        continue;
      }

      // AI MODE
      if (!isCommand &&!isGroup) {
        const aiResponse = await askGemini(text);
        await sock.sendMessage(from, { text: aiResponse }, { quoted: msg });
        continue;
      }

      // GROUP SAVAGE MODE
      if (isGroup && isCommand) {
        const randomSavage = SAVAGE_LINES[Math.floor(Math.random() * SAVAGE_LINES.length)];
        await sock.sendMessage(from, { text: randomSavage }, { quoted: msg });
        continue;
      }
    }
  });

  // ANTI-LINK + WELCOME
  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (action === 'add') {
      for (const user of participants) {
        const welcome = `*WELCOME TO HARPS TECH PROv1!*\n\n@${user.split('@')[0]}, welcome to our official group!\n\n*WHAT WE DO:*\n• Data & Airtime\n• Social Media Services\n• Bills Payment\n• Betting Funding\n• Education PINs\n• And 20+ more services\n*TYPE:*.menu to see all services\n*SUPPORT:* wa.me/${config.SUPPORT_NUMBER}\n\n${config.DISCLAIMER}`;
        await sock.sendMessage(id, { text: welcome, mentions: [user] });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const sender = msg.key.participant || from;
      const senderNum = sender.split('@')[0];
      const isGroup = from.endsWith('@g.us');
      const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const urlRegex = /(https?:\/\/|www\.)[^\s]+/i;

      if (isGroup && urlRegex.test(body) && senderNum!== config.OWNER_NUMBER) {
        await sock.sendMessage(from, { delete: msg.key });
        await sock.sendMessage(from, { text: `🚫 *LINK DETECTED*\n\n@${senderNum}, links not allowed in this group. Contact admin.` }, { mentions: [sender] });
      }
    }
  });
}

startBot().catch(console.error);
