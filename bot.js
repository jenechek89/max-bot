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
    } catch (e) {
        console.error('Google Sheets error:', e);
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
                values: [[new Date().toLocaleString('ru-RU'), user.name || '', user.phone || '', user.budget || '', user.goal || '']]
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
        `📄 Обработкой ПД: ${PROCESSING_LINK}\n\n` +
        `Напишите "Согласен", чтобы начать.`);
});

// ===================== ОСНОВНАЯ ЛОГИКА =====================
bot.on('message_created', async (ctx) => {
    const userId = ctx.message?.sender?.user_id;
    const text = (ctx.message?.body?.text || '').trim();
    if (!userId || !text) return;

    let user = users.get(userId);
    if (!user) {
        user = { stage: 'consent' };
        users.set(userId, user);
    }

    // Перезапуск
    if (text === '/start') {
        users.set(userId, { stage: 'consent' });
        return ctx.reply(`👋 Добро пожаловать!\nНапишите "Согласен", чтобы начать.`);
    }

    // ==================== СОГЛАСИЕ ====================
    if (user.stage === 'consent') {
        if (text.toLowerCase().includes('согласен') || text.toLowerCase() === 'ок') {
            user.stage = 'goal';
            return ctx.reply('🏠 Какую недвижимость вы ищете?\nНапишите один из вариантов:\n• Новостройка\n• Вторичка\n• Загородный дом\n• Другое');
        } else {
            return ctx.reply('Для продолжения напишите "Согласен".');
        }
    }

    // ==================== ОСНОВНОЙ СЦЕНАРИЙ ====================
    if (user.stage === 'goal') {
        user.goal = text;
        user.stage = 'budget';
        return ctx.reply('💰 Какой бюджет рассматриваете?');
    }

    if (user.stage === 'budget') {
        user.budget = text;
        user.stage = 'name';
        return ctx.reply('Как вас зовут?');
    }

    if (user.stage === 'name') {
        user.name = text;
        user.stage = 'phone';
        return ctx.reply('📱 Укажите номер телефона:');
    }

    if (user.stage === 'phone') {
        user.phone = text;
        user.stage = 'done';

        const leadText = `🔥 НОВЫЙ ЛИД\n👤 ${user.name}\n📱 ${user.phone}\n💰 ${user.budget}\n🏠 ${user.goal}`;

        if (MANAGER_ID) await bot.api.sendMessageToChat({ chat_id: MANAGER_ID, text: leadText }).catch(() => { });
        if (GROUP_ID) await bot.api.sendMessageToChat({ chat_id: GROUP_ID, text: leadText }).catch(() => { });

        await saveToSheet(user);

        return ctx.reply(`✅ Спасибо! 🎉\nМы уже подбираем варианты.\nС вами свяжется менеджер в ближайшее время.\n\nНапишите /start, чтобы начать заново.`);
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

console.log('🚀 MAX BOT RUNNING');