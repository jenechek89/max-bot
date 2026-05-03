import { Bot } from '@maxhub/max-bot-api';
import express from 'express';
import { google } from 'googleapis';

// ===================== BOT =====================
const bot = new Bot(process.env.BOT_TOKEN);

// ===================== WEBHOOK SERVER =====================
const app = express();
app.use(express.json());

// 🔥 ВАЖНО: сюда приходят все события MAX
app.post('/webhook', (req, res) => {
  console.log("🔥 WEBHOOK HIT:", JSON.stringify(req.body, null, 2));

  try {
    bot.handleUpdate(req.body);
  } catch (e) {
    console.log("BOT HANDLE ERROR:", e);
  }

  res.send("OK");
});

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🌐 HTTP server running on ${PORT}`);
});

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
        await bot.api.sendMessage({
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

// ===================== DEBUG (СМОТРИМ ВСЁ ЧТО ПРИХОДИТ) =====================
bot.on('*', async (ctx) => {
  console.log("🔥 RAW EVENT RECEIVED:");
  console.log(JSON.stringify(ctx, null, 2));
});

// ===================== ОСНОВНАЯ ЛОГИКА =====================
bot.on('message_created', async (ctx) => {
  const msg = ctx?.message;
  if (!msg) return;

  const userId = msg?.sender?.user_id;
  const text = msg?.body?.text;

  if (!userId || !text) return;

  // ===================== START =====================
  if (text.trim().startsWith('/start')) {
    users.set(userId, { stage: 'consent' });

    setReminder(userId);

    return bot.api.sendMessage({
      chat_id: userId,
      text: `👋 Добро пожаловать!

Я помогу подобрать недвижимость 🏠

Перед началом:

Продолжая, вы соглашаетесь с:

📄 Политикой персональных данных:
${PRIVACY_LINK}

📄 Обработкой персональных данных:
${PROCESSING_LINK}

Нажмите /start чтобы продолжить.`
    });
  }

  const user = users.get(userId);
  if (!user) return;

  // ===================== ЦЕЛЬ =====================
  if (user.stage === 'goal') {
    user.goal = text;
    user.stage = 'budget';

    return bot.api.sendMessage({
      chat_id: userId,
      text: '💰 Какой бюджет рассматриваете?'
    });
  }

  // ===================== БЮДЖЕТ =====================
  if (user.stage === 'budget') {
    user.budget = text;
    user.stage = 'name';

    return bot.api.sendMessage({
      chat_id: userId,
      text: 'Как вас зовут?'
    });
  }

  // ===================== ИМЯ =====================
  if (user.stage === 'name') {
    user.name = text;
    user.stage = 'phone';

    return bot.api.sendMessage({
      chat_id: userId,
      text: '📱 Оставьте номер телефона:'
    });
  }

  // ===================== ТЕЛЕФОН (ФИНАЛ) =====================
  if (user.stage === 'phone') {
    user.phone = text;
    user.stage = 'done';

    if (reminders.has(userId)) {
      clearTimeout(reminders.get(userId));
      reminders.delete(userId);
    }

    const leadText =
`🔥 НОВЫЙ ЛИД

👤 ${user.name}
📱 ${user.phone}
💰 ${user.budget}
🏠 ${user.goal}
`;

    if (MANAGER_ID) {
      await bot.api.sendMessage({
        chat_id: MANAGER_ID,
        text: leadText
      });
    }

    if (GROUP_ID) {
      await bot.api.sendMessage({
        chat_id: GROUP_ID,
        text: leadText
      });
    }

    await saveToSheet(user);

    return bot.api.sendMessage({
      chat_id: userId,
      text: `Спасибо! 🎉

Мы уже подбираем варианты.
С вами свяжется менеджер.`
    });
  }
});

// ===================== START BOT =====================
bot.start();

console.log('🚀 MAX BOT RUNNING');