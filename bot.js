import { Bot } from '@maxhub/max-bot-api';
import { google } from 'googleapis';

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

// ===================== УТИЛИТЫ =====================
function getMessage(ctx) {
  return ctx?.message || ctx?.update?.message;
}

function getUserId(msg) {
  return msg?.sender?.user_id;
}

function getText(msg) {
  return msg?.body?.text;
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

// ===================== ВХОДЯЩИЕ СООБЩЕНИЯ =====================
bot.on('message_created', async (ctx) => {
  const msg = getMessage(ctx);
  if (!msg) return;

  const userId = getUserId(msg);
  const text = getText(msg);

  if (!userId || !text) return;

  // /start
  if (text === '/start') {
    users.set(userId, { stage: 'consent' });

    setReminder(userId);

    return bot.api.sendMessage({
      chat_id: userId,
      text:
`👋 Добро пожаловать!

Я помогу подобрать недвижимость 🏠

Перед началом:

Продолжая, вы соглашаетесь с:

Политикой персональных данных:
${PRIVACY_LINK}

Обработкой персональных данных:
${PROCESSING_LINK}`
    });
  }

  const user = users.get(userId);
  if (!user) return;

  // шаг 1 — цель
  if (user.stage === 'goal') {
    user.goal = text;
    user.stage = 'budget';

    return bot.api.sendMessage({
      chat_id: userId,
      text: '💰 Какой бюджет рассматриваете?'
    });
  }

  // шаг 2 — бюджет
  if (user.stage === 'budget') {
    user.budget = text;
    user.stage = 'name';

    return bot.api.sendMessage({
      chat_id: userId,
      text: 'Как вас зовут?'
    });
  }

  // шаг 3 — имя
  if (user.stage === 'name') {
    user.name = text;
    user.stage = 'phone';

    return bot.api.sendMessage({
      chat_id: userId,
      text: '📱 Оставьте номер телефона:'
    });
  }

  // шаг 4 — телефон (ФИНАЛ)
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

    // менеджер
    if (MANAGER_ID) {
      await bot.api.sendMessage({
        chat_id: MANAGER_ID,
        text: leadText
      });
    }

    // группа
    if (GROUP_ID) {
      await bot.api.sendMessage({
        chat_id: GROUP_ID,
        text: leadText
      });
    }

    // таблица
    await saveToSheet(user);

    return bot.api.sendMessage({
      chat_id: userId,
      text: `Спасибо! 🎉

Мы уже подбираем варианты.
С вами свяжется менеджер.`
    });
  }
});

bot.start();

console.log('🚀 MAX BOT RUNNING');