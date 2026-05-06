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
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
    console.log('✅ Google Sheets подключён');
  } catch (e) {
    console.error('❌ Google Sheets error:', e);
  }
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
          new Date().toLocaleString('ru-RU'),
          user.name || '',
          user.phone || '',
          user.budget || '',
          user.goal || ''
        ]]
      }
    });
  } catch (e) {
    console.error('Sheets error:', e);
  }
}

// ===================== НАПОМИНАНИЕ =====================
function setReminder(userId) {
  if (reminders.has(userId)) return;
  
  const timeout = setTimeout(async () => {
    const user = users.get(userId);
    if (user && user.stage !== 'done') {
      await bot.api.sendMessage({
        chat_id: userId,
        text: `👋 Напоминание!\nВы начали подбор недвижимости, но не закончили.\nНапишите /start чтобы продолжить.`
      });
    }
    reminders.delete(userId);
  }, 24 * 60 * 60 * 1000);

  reminders.set(userId, timeout);
}

// ===================== bot_started — АВТОСТАРТ =====================
bot.on('bot_started', async (ctx) => {
  const userId = ctx.user?.user_id;
  if (!userId) return;

  users.set(userId, { stage: 'consent' });
  setReminder(userId);

  await ctx.reply(`👋 Добро пожаловать!\nЯ помогу подобрать недвижимость 🏠\n\n` +
                 `Продолжая использование, вы соглашаетесь с:\n` +
                 `📄 Политикой персональных данных: ${PRIVACY_LINK}\n` +
                 `📄 Обработкой персональных данных: ${PROCESSING_LINK}\n\n` +
                 `Напишите "ок" или "Согласен", чтобы начать.`);
});

// ===================== КОМАНДЫ =====================
bot.api.setMyCommands([
  { name: 'start', description: 'Начать подбор недвижимости' }
]);

// ===================== ОСНОВНАЯ ЛОГИКА =====================
bot.on('message_created', async (ctx) => {
  const userId = ctx.message?.sender?.user_id;
  const text = (ctx.message?.body?.text || '').trim();
  if (!userId || !text) return;

  let user = users.get(userId);
  if (!user) {
    // Если вдруг нет пользователя в памяти
    user = { stage: 'consent' };
    users.set(userId, user);
  }

  // Перезапуск через /start
  if (text === '/start') {
    users.set(userId, { stage: 'consent' });
    setReminder(userId);
    return ctx.reply(`👋 Добро пожаловать!\nНапишите "ок" или "Согласен", чтобы начать.`);
  }

  // Согласие
  if (user.stage === 'consent') {
    if (text.toLowerCase().includes('ок') || text.toLowerCase().includes('согласен')) {
      user.stage = 'goal';
      return ctx.reply('🏠 Какую недвижимость рассматриваете? (например: 1-комнатную квартиру, дом и т.д.)');
    }
    return; // игнорируем другие сообщения на этом этапе
  }

  // Цель
  if (user.stage === 'goal') {
    user.goal = text;
    user.stage = 'budget';
    return ctx.reply('💰 Какой бюджет рассматриваете?');
  }

  // Бюджет
  if (user.stage === 'budget') {
    user.budget = text;
    user.stage = 'name';
    return ctx.reply('Как вас зовут?');
  }

  // Имя
  if (user.stage === 'name') {
    user.name = text;
    user.stage = 'phone';
    return ctx.reply('📱 Оставьте номер телефона:');
  }

  // Телефон + финал
  if (user.stage === 'phone') {
    user.phone = text;
    user.stage = 'done';

    if (reminders.has(userId)) {
      clearTimeout(reminders.get(userId));
      reminders.delete(userId);
    }

    const leadText = `🔥 НОВЫЙ ЛИД\n👤 ${user.name}\n📱 ${user.phone}\n💰 ${user.budget}\n🏠 ${user.goal}`;

    if (MANAGER_ID) await bot.api.sendMessage({ chat_id: MANAGER_ID, text: leadText });
    if (GROUP_ID) await bot.api.sendMessage({ chat_id: GROUP_ID, text: leadText });

    await saveToSheet(user);

    return ctx.reply(`Спасибо! 🎉\nМы уже подбираем варианты.\nС вами свяжется менеджер в ближайшее время.\n\nНапишите /start, если хотите начать заново.`);
  }
});

// ===================== WEBHOOK =====================
const PORT = process.env.PORT || 10000;

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        if (body) {
          const update = JSON.parse(body);
          await bot.handleUpdate(update);
        }
        res.writeHead(200).end('ok');
      } catch (e) {
        console.error('Webhook error:', e);
        res.writeHead(200).end('error');
      }
    });
  } else {
    res.writeHead(200).end('OK');
  }
}).listen(PORT);

console.log('🚀 MAX Бот запущен');