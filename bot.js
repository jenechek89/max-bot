import { Bot, Keyboard } from '@maxhub/max-bot-api';
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

// ===================== GOOGLE SHEETS =====================
let sheets = null;
if (process.env.GOOGLE_CREDENTIALS && SPREADSHEET_ID) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheets = google.sheets({ version: 'v4', auth });
  } catch (e) {
    console.error('Google Sheets error:', e);
  }
}

async function saveToSheet(user) {
  if (!sheets) return;
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'Лиды!A:F',
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          new Date().toLocaleString('ru-RU'),
          user.name || '',
          user.phone || '',
          user.real_estate_type || '',
          user.payment_type || '',
          user.budget || ''
        ]]
      }
    });
  } catch (e) {
    console.error('Sheets error:', e);
  }
}

// ===================== bot_started =====================
bot.on('bot_started', async (ctx) => {
  const userId = ctx.user?.user_id;
  if (!userId) return;

  users.set(userId, { stage: 'consent' });

  await ctx.reply(`👋 Добро пожаловать!\nЯ помогу подобрать недвижимость 🏠\n\n` +
                 `Продолжая, вы соглашаетесь с:\n` +
                 `📄 Политикой: ${PRIVACY_LINK}\n` +
                 `📄 Обработкой ПД: ${PROCESSING_LINK}`);
  
  const keyboard = Keyboard.inlineKeyboard([
    [Keyboard.button.callback('✅ Согласен', 'consent_yes')],
    [Keyboard.button.callback('❌ Не согласен', 'consent_no')]
  ]);

  await ctx.reply('Пожалуйста, подтвердите согласие:', { attachments: [keyboard] });
});

// ===================== CALLBACKS =====================
bot.on('message_callback', async (ctx) => {
  const data = ctx.data || ctx.callbackQuery?.data;
  const userId = ctx.from?.user_id || ctx.callbackQuery?.from?.user_id;
  if (!data || !userId) return;

  let user = users.get(userId);
  if (!user) return;

  // Согласие
  if (data === 'consent_no') {
    return ctx.reply('Вы не дали согласие. Напишите /start, если передумаете.');
  }

  if (data === 'consent_yes') {
    user.stage = 'real_estate';
    const keyboard = Keyboard.inlineKeyboard([
      [Keyboard.button.callback('Новостройка', 'type_new')],
      [Keyboard.button.callback('Вторичка', 'type_secondary')],
      [Keyboard.button.callback('Загородный дом', 'type_house')],
      [Keyboard.button.callback('Другое', 'type_other')]
    ]);
    return ctx.reply('🏠 Какую недвижимость вы ищете?', { attachments: [keyboard] });
  }

  // Тип недвижимости
  if (data.startsWith('type_')) {
    user.real_estate_type = data === 'type_new' ? 'Новостройка' :
                           data === 'type_secondary' ? 'Вторичка' :
                           data === 'type_house' ? 'Загородный дом' : 'Другое';
    
    user.stage = 'payment';
    const keyboard = Keyboard.inlineKeyboard([
      [Keyboard.button.callback('Наличные', 'pay_cash')],
      [Keyboard.button.callback('Ипотека', 'pay_mortgage')],
      [Keyboard.button.callback('Сертификаты / Мат.капитал', 'pay_cert')]
    ]);
    return ctx.reply(`Вы выбрали: ${user.real_estate_type}\n\n💳 Какой способ оплаты рассматриваете?`, { attachments: [keyboard] });
  }

  // Способ оплаты
  if (data.startsWith('pay_')) {
    user.payment_type = data === 'pay_cash' ? 'Наличные' :
                       data === 'pay_mortgage' ? 'Ипотека' : 'Сертификаты / Мат.капитал';
    
    user.stage = 'budget';
    const keyboard = Keyboard.inlineKeyboard([
      [Keyboard.button.callback('3-5 млн ₽', 'budget_5')],
      [Keyboard.button.callback('5-9 млн ₽', 'budget_9')],
      [Keyboard.button.callback('Более 9 млн ₽', 'budget_9plus')]
    ]);
    return ctx.reply(`Вы ищете ${user.real_estate_type} за ${user.payment_type}\n\n💰 В какую сумму рассчитываете покупку?`, { attachments: [keyboard] });
  }

  // Бюджет
  if (data.startsWith('budget_')) {
    user.budget = data === 'budget_5' ? '3-5 млн ₽' :
                  data === 'budget_9' ? '5-9 млн ₽' : 'Более 9 млн ₽';
    
    user.stage = 'name';
    return ctx.reply('Напишите ваше имя (только буквы и тире):');
  }
});

// ===================== СООБЩЕНИЯ =====================
bot.on('message_created', async (ctx) => {
  const userId = ctx.message?.sender?.user_id;
  const text = (ctx.message?.body?.text || '').trim();
  if (!userId || !text) return;

  let user = users.get(userId);
  if (!user) return;

  // Имя
  if (user.stage === 'name') {
    if (!/^[А-Яа-яЁёA-Za-z\s-]+$/u.test(text) || text.length < 2) {
      return ctx.reply('❌ Имя должно содержать только буквы и тире. Попробуйте ещё раз.');
    }
    user.name = text;
    user.stage = 'phone';
    return ctx.reply('📱 Введите номер телефона (+79123456789 или 89123456789):');
  }

  // Телефон
  if (user.stage === 'phone') {
    const cleanPhone = text.replace(/\s+/g, '').replace(/[^+0-9]/g, '');
    const phoneRegex = /^(\+7|8)\d{10}$/;
    
    if (!phoneRegex.test(cleanPhone)) {
      return ctx.reply('❌ Неверный формат номера.\nВведите правильно, например:\n+79123456789 или 89123456789');
    }

    user.phone = cleanPhone;
    user.stage = 'done';

    const leadText = `🔥 НОВЫЙ ЛИД\n` +
                    `👤 Имя: ${user.name}\n` +
                    `📱 Телефон: ${user.phone}\n` +
                    `🏠 Тип: ${user.real_estate_type}\n` +
                    `💳 Оплата: ${user.payment_type}\n` +
                    `💰 Бюджет: ${user.budget}`;

    if (MANAGER_ID) await bot.api.sendMessage({ chat_id: MANAGER_ID, text: leadText });
    if (GROUP_ID) await bot.api.sendMessage({ chat_id: GROUP_ID, text: leadText });
    await saveToSheet(user);

    await ctx.reply(`✅ Спасибо за ваше обращение, ${user.name}!\nНаш специалист свяжется с вами в ближайшее время.\n\nВсего хорошего!`);
    
    users.delete(userId); // очистка
  }

  // Перезапуск
  if (text === '/start') {
    users.set(userId, { stage: 'consent' });
    // Повторяем начало
    await ctx.reply('Начинаем заново...');
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
        if (body) await bot.handleUpdate(JSON.parse(body));
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