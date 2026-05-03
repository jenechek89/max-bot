import { Bot } from '@maxhub/max-bot-api';
import { google } from 'googleapis';

const bot = new Bot(process.env.BOT_TOKEN);

// ===== НАСТРОЙКИ =====
const MANAGER_ID = process.env.MANAGER_ID;
const GROUP_ID = process.env.GROUP_ID;

const PRIVACY_LINK = "https://disk.yandex.ru/i/your-privacy";
const PROCESSING_LINK = "https://disk.yandex.ru/i/your-processing";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ===== ПАМЯТЬ =====
const users = new Map();
const REMINDERS = new Map();

// ===== GOOGLE SHEETS =====
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });

async function saveToSheets(user) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Лиды!A:E',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toLocaleString(),
          user.name,
          user.phone,
          user.budget,
          user.goal
        ]]
      }
    });
  } catch (e) {
    console.log('Ошибка записи в таблицу', e);
  }
}

// ===== НАПОМИНАНИЕ 24Ч =====
function setReminder(userId) {
  if (REMINDERS.has(userId)) return;

  const timeout = setTimeout(async () => {
    const user = users.get(userId);

    if (user && user.stage !== 'done') {
      try {
        await bot.api.sendMessage({
          chat_id: userId,
          text: `👋 Вы начали подбор недвижимости, но не завершили.

Могу подобрать для вас лучшие варианты 🏠
Нажмите /start и продолжим.`
        });
      } catch (e) {
        console.log('Ошибка напоминания', e);
      }
    }

    REMINDERS.delete(userId);
  }, 24 * 60 * 60 * 1000);

  REMINDERS.set(userId, timeout);
}

// ===== КОМАНДЫ =====
bot.api.setMyCommands([
  { name: 'start', description: 'Начать' }
]);

// ===== ПРИВЕТСТВИЕ =====
bot.on('message', async (ctx) => {
  const userId = ctx.user()?.user_id;
  const text = ctx.text?.();

  if (!text) return;

  if (!users.has(userId) && text !== '/start') {
    return ctx.reply(
`👋 Привет!

Я бот агентства недвижимости 🏠

Помогу подобрать:
• новостройки
• вторичку
• загородные дома

Чтобы начать — нажми /start`
    );
  }
});

// ===== /START → СОГЛАСИЕ =====
bot.command('start', async (ctx) => {
  const userId = ctx.user()?.user_id;

  users.set(userId, { stage: 'consent' });

  setReminder(userId);

  return ctx.reply(
`Еще чуть-чуть и можем начинать:

Продолжая, вы соглашаетесь с Политикой персональных данных:
${PRIVACY_LINK}

и Обработкой персональных данных:
${PROCESSING_LINK}`,
{
  inline_keyboard: [
    [{ text: "✅ ПРОДОЛЖИТЬ", callback_data: "continue" }]
  ]
}
  );
});

// ===== КНОПКА ПРОДОЛЖИТЬ =====
bot.on('callback_query', async (ctx) => {
  const userId = ctx.user()?.user_id;
  const data = ctx.data();

  if (data === 'continue') {
    users.set(userId, { stage: 'goal' });

    return ctx.reply(
`Отлично 👍

Что вас интересует?
1 - Новостройки
2 - Вторичка
3 - Загородные дома`
    );
  }
});

// ===== ОСНОВНАЯ ВОРОНКА =====
bot.on('message', async (ctx) => {
  const userId = ctx.user()?.user_id;
  const text = ctx.text?.trim();

  if (!users.has(userId) || !text) return;

  const user = users.get(userId);

  // цель
  if (user.stage === 'goal') {
    user.goal = text;
    user.stage = 'budget';

    return ctx.reply('💰 Какой бюджет рассматриваешь?');
  }

  // бюджет
  if (user.stage === 'budget') {
    user.budget = text;
    user.stage = 'name';

    return ctx.reply('Как тебя зовут?');
  }

  // имя
  if (user.stage === 'name') {
    user.name = text;
    user.stage = 'phone';

    return ctx.reply('📱 Оставь номер телефона:');
  }

  // телефон → ФИНАЛ
  if (user.stage === 'phone') {
    user.phone = text;
    user.stage = 'done';

    // отменяем напоминание
    if (REMINDERS.has(userId)) {
      clearTimeout(REMINDERS.get(userId));
      REMINDERS.delete(userId);
    }

    const lead =
`🔥 НОВЫЙ ЛИД

👤 Имя: ${user.name}
📱 Телефон: ${user.phone}
💰 Бюджет: ${user.budget}
🏠 Интерес: ${user.goal}
`;

    // менеджеру
    if (MANAGER_ID) {
      await bot.api.sendMessage({
        chat_id: MANAGER_ID,
        text: lead
      });
    }

    // в группу
    if (GROUP_ID) {
      await bot.api.sendMessage({
        chat_id: GROUP_ID,
        text: lead
      });
    }

    // в таблицу
    await saveToSheets(user);

    return ctx.reply(
`Спасибо! 🎉

Мы уже подбираем варианты.
С вами скоро свяжется менеджер.`
    );
  }
});

bot.start();

console.log('🚀 FULL BOT WORKING');