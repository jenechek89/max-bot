import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { google } from 'googleapis';
import http from 'http';

const bot = new Bot(process.env.BOT_TOKEN as string);

console.log("🚀 MAX Bot (TypeScript) запущен");

// ===================== НАСТРОЙКИ =====================
const MANAGER_ID = process.env.MANAGER_ID;
const GROUP_ID = process.env.GROUP_ID;
const PRIVACY_LINK = "https://disk.yandex.ru/i/your-privacy";
const PROCESSING_LINK = "https://disk.yandex.ru/i/your-processing";
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const users = new Map<string, any>();

// ===================== GOOGLE SHEETS =====================
let sheets: any = null;
if (process.env.GOOGLE_CREDENTIALS && SPREADSHEET_ID) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS as string),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        sheets = google.sheets({ version: 'v4', auth });
        console.log("✅ Google Sheets подключён");
    } catch (e) {
        console.error("❌ Google Sheets error:", e);
    }
}

// ===================== bot_started =====================
bot.on('bot_started', async (ctx: any) => {
    const userId = ctx.user?.user_id;
    if (!userId) return;

    users.set(userId, { stage: 'consent' });

    await ctx.reply(`👋 Добро пожаловать!\nЯ помогу подобрать недвижимость 🏠\n\nПродолжая, вы соглашаетесь с обработкой данных.`);

    const keyboard = Keyboard.inlineKeyboard([
        [Keyboard.button.callback("✅ Согласен", "consent_yes")],
        [Keyboard.button.callback("❌ Не согласен", "consent_no")]
    ]);

    await ctx.reply("Пожалуйста, подтвердите согласие:", { attachments: [keyboard] });
});

// ===================== ОБРАБОТКА КНОПОК =====================
bot.on('message_callback', async (ctx: any) => {
    const data = ctx.data || ctx.callbackQuery?.data;
    const userId = ctx.from?.user_id || ctx.callbackQuery?.from?.user_id;

    console.log(`🔥 КНОПКА НАЖАТА! Data = ${data}`);

    if (data === 'consent_yes') {
        const user = users.get(userId);
        if (user) user.stage = 'real_estate';

        const k = Keyboard.inlineKeyboard([
            [Keyboard.button.callback("🏗 Новостройка", "type_new")],
            [Keyboard.button.callback("🏠 Вторичка", "type_secondary")],
            [Keyboard.button.callback("🏡 Загородный дом", "type_house")],
            [Keyboard.button.callback("🌍 Другое", "type_other")]
        ]);

        await ctx.reply("🏠 Какую недвижимость вы ищете?", { attachments: [k] });
    }
});

// ===================== ОБРАБОТКА СООБЩЕНИЙ =====================
bot.on('message_created', async (ctx: any) => {
    const userId = ctx.message?.sender?.user_id;
    const text = (ctx.message?.body?.text || '').trim();
    if (!userId || !text) return;

    console.log(`📨 Сообщение от ${userId}: ${text}`);

    let user = users.get(userId);
    if (!user) user = { stage: 'consent' };
    users.set(userId, user);

    if (text === '/start') {
        users.set(userId, { stage: 'consent' });
        return ctx.reply(`👋 Добро пожаловать!\nНапишите "Согласен", чтобы начать.`);
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
                const update = JSON.parse(body);
                console.log(`📥 Update type: ${update.update_type}`);

                // Обход private метода
                (bot as any).handleUpdate(update);
            } catch (e) {
                console.error('Webhook error:', e);
            }
            res.writeHead(200).end('ok');
        });
    } else {
        res.writeHead(200).end('OK');
    }
}).listen(PORT, () => {
    console.log(`🌐 Webhook сервер запущен на порту ${PORT}`);
});

console.log('🚀 MAX Bot (TypeScript) готов');