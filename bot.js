import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { google } from 'googleapis';
import http from 'http';

const bot = new Bot(process.env.BOT_TOKEN);

const MANAGER_ID = process.env.MANAGER_ID;
const GROUP_ID = process.env.GROUP_ID;
const PRIVACY_LINK = "https://disk.yandex.ru/i/your-privacy";
const PROCESSING_LINK = "https://disk.yandex.ru/i/your-processing";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const users = new Map();

// ===================== GOOGLE SHEETS =====================
let sheets = null;
if (process.env.GOOGLE_CREDENTIALS && SPREADSHEET_ID) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
  } catch (e) {}
}

// ===================== bot_started =====================
bot.on('bot_started', async (ctx) => {
  const userId = ctx.user?.user_id;
  if (!userId) return;

  users.set(userId, { stage: 'consent' });

  await ctx.reply(`👋 Добро пожаловать!\nЯ помогу подобрать недвижимость 🏠\n\nПродолжая, вы соглашаетесь с обработкой данных.`);

  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('✅ Согласен', 'consent_yes')],
    [Keyboard.button.callback('❌ Не согласен', 'consent_no')]
  ]);

  await ctx.reply('Пожалуйста, подтвердите согласие:', { attachments: [keyboard] });
});

// ===================== ВАЖНО: ВСЕ ВОЗМОЖНЫЕ СОБЫТИЯ =====================
bot.on('message_callback', async (ctx) => {
  console.log('📌 message_callback сработал!', ctx);
  handleCallback(ctx);
});

bot.on('callback_query', async (ctx) => {
  console.log('📌 callback_query сработал!', ctx);
  handleCallback(ctx);
});

async function handleCallback(ctx) {
  const data = ctx.data || ctx.callbackQuery?.data;
  const userId = ctx.from?.user_id || ctx.callbackQuery?.from?.user_id;

  console.log(`✅ Callback data: ${data} | userId: ${userId}`);

  if (!data || !userId) return;

  let user = users.get(userId);
  if (!user) return;

  if (data === 'consent_yes') {
    user.stage = 'real_estate';
    const k = Keyboard.inlineKeyboard([
      [Keyboard.button.callback('Новостройка', 'type_new')],
      [Keyboard.button.callback('Вторичка', 'type_secondary')],
      [Keyboard.button.callback('Загородный дом', 'type_house')],
      [Keyboard.button.callback('Другое', 'type_other')]
    ]);
    await ctx.reply('🏠 Какую недвижимость вы ищете?', { attachments: [k] });
  }

  if (data === 'consent_no') {
    await ctx.reply('Вы отказались от согласия. Напишите /start, если передумаете.');
  }
}

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

console.log('🚀 Бот запущен');