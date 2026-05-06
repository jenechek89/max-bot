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

// ===================== GOOGLE SHEETS =====================
let sheets = null;
if (process.env.GOOGLE_CREDENTIALS && SPREADSHEET_ID) {
    try {
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        sheets = google.sheets({ version: 'v4', auth });
    } catch (e) { }
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
    } catch (e) { console.error(e); }
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
    if (!user) user = { stage: 'consent' };
    users.set(userId, user);

    if (text === '/start') {
        users.set(userId, { stage: 'consent' });
        return ctx.reply(`👋 Добро пожаловать!\nНапишите "Согласен", чтобы начать.`);
    }

    // ==================== 1. СОГЛАСИЕ ====================
    if (user.stage === 'consent') {
        if (text.toLowerCase().includes('согласен') || text.toLowerCase() === 'ок') {
            user.stage = 'real_estate';
            return ctx.reply(`🏠 Какую недвижимость вы ищете?\n\nНапишите один из вариантов:\n• Новостройка\n• Вторичка\n• Загородный дом\n• Другое`);
        } else {
            return ctx.reply('Для продолжения напишите "Согласен".');
        }
    }

    // ==================== 2. ТИП НЕДВИЖИМОСТИ ====================
    if (user.stage === 'real_estate') {
        user.real_estate_type = text;
        user.stage = 'payment';
        return ctx.reply(`Вы выбрали: ${text}\n\n💳 Какой способ оплаты рассматриваете?\nНапишите:\n• Наличные\n• Ипотека\n• Сертификаты / Мат.капитал\n• Другое`);
    }

    // ==================== 3. СПОСОБ ОПЛАТЫ ====================
    if (user.stage === 'payment') {
        user.payment_type = text;
        user.stage = 'budget';
        return ctx.reply(`Вы ищете ${user.real_estate_type} за ${text}\n\n💰 В какую сумму рассчитываете покупку?`);
    }

    // ==================== 4. БЮДЖЕТ ====================
    if (user.stage === 'budget') {
        user.budget = text;
        user.stage = 'name';
        return ctx.reply('Напишите ваше имя (только буквы):');
    }

    // ==================== 5. ИМЯ ====================
    if (user.stage === 'name') {
        if (!/^[А-Яа-яЁёA-Za-z\s-]+$/u.test(text) || text.length < 2) {
            return ctx.reply('❌ Имя должно содержать только буквы и тире. Попробуйте ещё раз.');
        }
        user.name = text;
        user.stage = 'phone';
        return ctx.reply('📱 Введите номер телефона (+79xxxxxxxxx или 89xxxxxxxxx):');
    }

// ==================== 6. Т