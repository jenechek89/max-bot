import { Bot } from '@maxhub/max-bot-api';
import { google } from 'googleapis';
import http from 'http';

const bot = new Bot(process.env.BOT_TOKEN);

// ===================== НАСТРОЙКИ =====================
const MANAGER_ID = process.env.MANAGER_ID;
const GROUP_ID = process.env.GROUP_ID;

const PRIVACY_LINK = "https://disk.yandex.ru/i/your-privacy";
const PROCESSING_LINK = "https://disk.yandex.ru/i/your-processing";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ===================== ПАМЯТЬ =====================
const users = new Map();
const reminders = new Map();

// ===================== GOOGLE SHEETS =====================
let sheets = null;

if (process.env.GOOGLE_CREDENTIALS && SPREADSHEET_ID) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  sheets = google.sheets({ version: 'v4', auth });
}

async function saveToSheet(user) {
  if (!sheets) return;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Лиды!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toLocaleString(),
          user.name || '',
          user.phone || '',
          user.budget || '',
          user.goal || ''
        ]]
      }
    });
  } catch (e) {
    console.log('Google Sheets error:', e);
  }
}

// ===================== НАПОМИНАНИЕ =====================
function setReminder(userId) {
  if (reminders.has(userId)) return;

  const timeout = setTimeout(async () => {
    const user = users.get(userId);

    if (user && user.stage !== 'done') {
      try {
        await bot.api.sendMessageToChat({
          chat_id: userId,
          text: `👋 Напоминание

Вы начали подбор недвижимости, но не закончили.

Нажмите /start чтобы продолжить.`
        });
      } catch (e) {
        console.log('Reminder error:', e);
      }
    }

    reminders.delete(userId);
  }, 24 * 60 * 60 * 1000);

  reminders.set(userId, timeout);
}

// ===================== КОМАНДЫ =====================
bot.api.setMyCommands([
  { name: 'start', description: 'Начать' }
]);

// ===================== ОБРАБОТКА =====================
bot.on('message_created', async (ctx) => {
  const msg = ctx?.message;
  if (!msg) return;

  const userId = msg?.sender?.user_id;
  const text = msg?.body?.text;

  if (!userId || !text) return;

  // ===== START =====
  if (text === '/start') {
    users.set(userId, { stage: 'consent' });

    setReminder(userId);

    return ctx.reply(`👋 Добро пожаловать!

Я помогу подобрать недвижимость 🏠

Продолжая, вы соглашаетесь с:

📄 Политикой персональных данных:
${PRIVACY_LINK}

📄 Обработкой персональных данных:
${PROCESSING_LINK}

Напишите "ок" чтобы продолжить`);
  }

  const user = users.get(userId);
  if (!user) return;

  // ===== CONSENT =====
  if (user.stage === 'consent') {
    user.stage = 'goal';

    return ctx.reply('🏠 Какую недвижимость рассматриваете?');
  }

  // ===== GOAL =====
  if (user.stage === 'goal') {
    user.goal = text;
    user.stage = 'budget';

    return ctx.reply('💰 Какой бюджет?');
  }

  // ===== BUDGET =====
  if (user.stage === 'budget') {
    user.budget = text;
    user.stage = 'name';

    return ctx.reply('Как вас зовут?');
  }

  // ===== NAME =====
  if (user.stage === 'name') {
    user.name = text;
    user.stage = 'phone';

    return ctx.reply('📱 Оставьте номер телефона:');
  }

  // ===== PHONE (ФИНАЛ) =====
  if (user.stage === 'phone') {
    user.phone = text;
    user.stage = 'done';

    if (reminders.has(userId)) {
      clearTimeout(reminders.get(userId));
      reminders.delete(userId);
    }

    const leadText = `🔥 НОВЫЙ ЛИД

👤 ${user.name}
📱 ${user.phone}
💰 ${user.budget}
🏠 ${user.goal}`;

    // менеджер
    if (MANAGER_ID) {
      await bot.api.sendMessageToChat({
        chat_id: MANAGER_ID,
        text: leadText
      });
    }

    // группа
    if (GROUP_ID) {
      await bot.api.sendMessageToChat({
        chat_id: GROUP_ID,
        text: leadText
      });
    }

    // таблица
    await saveToSheet(user);

    return ctx.reply(`Спасибо! 🎉

Мы уже подбираем варианты.
С вами свяжется менеджер.`);
  }
});

// ===================== HTTP СЕРВЕР =====================
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  let body = '';

  req.on('data', chunk => {
    body += chunk;
  });

  req.on('end', async () => {
    try {
    if (!body) {
      res.writeHead(200);
      return res.end('OK');
    }
      const update = JSON.parse(body);
      console.log("🔥 WEBHOOK HIT:", JSON.stringify(update, null, 2));

      await bot.handleUpdate(update);
    } catch (e) {
      console.log('Webhook error:', e);
    }

    res.writeHead(200);
    res.end('OK');
  });
}).listen(PORT, () => {
  console.log(`🌐 HTTP server running on ${PORT}`);
});

console.log('🚀 MAX BOT RUNNING');