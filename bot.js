<<<<<<< HEAD
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// =====================
// 🔑 НАСТРОЙКИ (через Render ENV)
// =====================
const TOKEN = process.env.TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

// =====================
// 🧠 ПАМЯТЬ (MVP)
// =====================
const users = {};

// =====================
// 👤 пользователь
// =====================
function getUser(id) {
    if (!users[id]) {
        users[id] = {
            stage: "start",
            data: {
                consent_data: false,
                consent_marketing: false
            },
            lastActivity: Date.now()
        };
    }
    return users[id];
}

// =====================
// 📤 отправка сообщений
// =====================
async function sendMessage(userId, text, buttons = []) {
    try {
        await axios.post("https://api.max.ru/messages", {
            user_id: userId,
            text: text,
            buttons: buttons
        }, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (err) {
        console.log("❌ Ошибка отправки:", err.response?.data || err.message);
    }
}

// =====================
// 🔔 уведомление менеджеру
// =====================
async function notifyManager(data) {
    const message =
`🏠 Новый лид

👤 Имя: ${data.name}
📞 Телефон: ${data.phone}
🎯 Цель: ${data.goal}
💰 Бюджет: ${data.budget}

📣 Маркетинг: ${data.consent_marketing ? "да" : "нет"}`;

    await sendMessage(MANAGER_CHAT_ID, message);
}

// =====================
// 📩 WEBHOOK
// =====================
app.post("/webhook", async (req, res) => {
    const update = req.body;

    console.log("UPDATE:", JSON.stringify(update, null, 2));

    const userId = update.user_id || update.chat_id;
    const text = update.message?.text;

    if (!userId) return res.sendStatus(200);

    const user = getUser(userId);
    user.lastActivity = Date.now();

    // =====================
    // 🚀 START
    // =====================
    if (text === "/start") {
        user.stage = "consent_data";

        await sendMessage(userId,
            "🏠 Перед началом работы необходимо согласие на обработку персональных данных.\n\nОзнакомьтесь с документом:",
            [
                { text: "📄 Открыть документ", url: "https://disk.yandex.ru/i/NzUXt3p-QlhYbw" },
                { text: "✅ Согласен" }
            ]
        );
    }

    // =====================
    // 📄 согласие на данные
    // =====================
    else if (text === "Согласен" && user.stage === "consent_data") {
        user.data.consent_data = true;
        user.stage = "consent_marketing";

        await sendMessage(userId,
            "📣 Разрешаете отправлять подборки недвижимости и персональные предложения?\n\nМожно отказаться в любой момент.",
            ["Согласен", "Не согласен"]
        );
    }

    // =====================
    // 📣 маркетинг
    // =====================
    else if (text === "Согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = true;
        user.stage = "goal";

        await sendMessage(userId,
            "Отлично 👍 Что вас интересует?",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    else if (text === "Не согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = false;
        user.stage = "goal";

        await sendMessage(userId,
            "Понял 👍 Будем работать только по вашему запросу",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    // =====================
    // 🎯 цель
    // =====================
    else if (["Квартира", "Дом", "Инвестиции"].includes(text)) {
        user.data.goal = text;
        user.stage = "budget";

        await sendMessage(userId,
            "Какой у вас бюджет?",
            ["до 3 млн", "3–5 млн", "5–8 млн", "8+ млн"]
        );
    }

    // =====================
    // 💰 бюджет
    // =====================
    else if (text?.includes("млн")) {
        user.data.budget = text;
        user.stage = "name";

        await sendMessage(userId, "Введите ваше имя");
    }

    // =====================
    // 👤 имя
    // =====================
    else if (user.stage === "name") {
        user.data.name = text;
        user.stage = "phone";

        await sendMessage(userId, "Оставьте номер телефона для подбора");
    }

    // =====================
    // 📞 телефон
    // =====================
    else if (user.stage === "phone") {
        user.data.phone = text;
        user.stage = "done";

        console.log("🔥 ЛИД:", user.data);

        await notifyManager(user.data);

        await sendMessage(userId,
            "Спасибо! Мы свяжемся с вами в ближайшее время 🏠"
        );
    }

    res.sendStatus(200);
});

// =====================
// ⏱ реактивация 24h
// =====================
setInterval(() => {
    const now = Date.now();

    for (let id in users) {
        let u = users[id];

        if (
            u.data.phone == null &&
            u.data.consent_data === true &&
            now - u.lastActivity > 24 * 60 * 60 * 1000
        ) {
            if (u.data.consent_marketing) {
                sendMessage(id,
                    "🏠 Вы не завершили подбор недвижимости. Готов показать актуальные варианты.",
                    ["Продолжить"]
                );
            }

            u.lastActivity = now;
        }
    }
}, 60000);

// =====================
// 🚀 запуск (Render)
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Bot running on port " + PORT);
=======
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// =====================
// 🔑 НАСТРОЙКИ (через Render ENV)
// =====================
const TOKEN = process.env.TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

// =====================
// 🧠 ПАМЯТЬ (MVP)
// =====================
const users = {};

// =====================
// 👤 пользователь
// =====================
function getUser(id) {
    if (!users[id]) {
        users[id] = {
            stage: "start",
            data: {
                consent_data: false,
                consent_marketing: false
            },
            lastActivity: Date.now()
        };
    }
    return users[id];
}

// =====================
// 📤 отправка сообщений
// =====================
async function sendMessage(userId, text, buttons = []) {
    try {
        await axios.post("https://api.max.ru/messages", {
            user_id: userId,
            text: text,
            buttons: buttons
        }, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (err) {
        console.log("❌ Ошибка отправки:", err.response?.data || err.message);
    }
}

// =====================
// 🔔 уведомление менеджеру
// =====================
async function notifyManager(data) {
    const message =
`🏠 Новый лид

👤 Имя: ${data.name}
📞 Телефон: ${data.phone}
🎯 Цель: ${data.goal}
💰 Бюджет: ${data.budget}

📣 Маркетинг: ${data.consent_marketing ? "да" : "нет"}`;

    await sendMessage(MANAGER_CHAT_ID, message);
}

// =====================
// 📩 WEBHOOK
// =====================
app.post("/webhook", async (req, res) => {
    const update = req.body;

    console.log("UPDATE:", JSON.stringify(update, null, 2));

    const userId = update.user_id || update.chat_id;
    const text = update.message?.text;

    if (!userId) return res.sendStatus(200);

    const user = getUser(userId);
    user.lastActivity = Date.now();

    // =====================
    // 🚀 START
    // =====================
    if (text === "/start") {
        user.stage = "consent_data";

        await sendMessage(userId,
            "🏠 Перед началом работы необходимо согласие на обработку персональных данных.\n\nОзнакомьтесь с документом:",
            [
                { text: "📄 Открыть документ", url: "https://disk.yandex.ru/i/NzUXt3p-QlhYbw" },
                { text: "✅ Согласен" }
            ]
        );
    }

    // =====================
    // 📄 согласие на данные
    // =====================
    else if (text === "Согласен" && user.stage === "consent_data") {
        user.data.consent_data = true;
        user.stage = "consent_marketing";

        await sendMessage(userId,
            "📣 Разрешаете отправлять подборки недвижимости и персональные предложения?\n\nМожно отказаться в любой момент.",
            ["Согласен", "Не согласен"]
        );
    }

    // =====================
    // 📣 маркетинг
    // =====================
    else if (text === "Согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = true;
        user.stage = "goal";

        await sendMessage(userId,
            "Отлично 👍 Что вас интересует?",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    else if (text === "Не согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = false;
        user.stage = "goal";

        await sendMessage(userId,
            "Понял 👍 Будем работать только по вашему запросу",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    // =====================
    // 🎯 цель
    // =====================
    else if (["Квартира", "Дом", "Инвестиции"].includes(text)) {
        user.data.goal = text;
        user.stage = "budget";

        await sendMessage(userId,
            "Какой у вас бюджет?",
            ["до 3 млн", "3–5 млн", "5–8 млн", "8+ млн"]
        );
    }

    // =====================
    // 💰 бюджет
    // =====================
    else if (text?.includes("млн")) {
        user.data.budget = text;
        user.stage = "name";

        await sendMessage(userId, "Введите ваше имя");
    }

    // =====================
    // 👤 имя
    // =====================
    else if (user.stage === "name") {
        user.data.name = text;
        user.stage = "phone";

        await sendMessage(userId, "Оставьте номер телефона для подбора");
    }

    // =====================
    // 📞 телефон
    // =====================
    else if (user.stage === "phone") {
        user.data.phone = text;
        user.stage = "done";

        console.log("🔥 ЛИД:", user.data);

        await notifyManager(user.data);

        await sendMessage(userId,
            "Спасибо! Мы свяжемся с вами в ближайшее время 🏠"
        );
    }

    res.sendStatus(200);
});

// =====================
// ⏱ реактивация 24h
// =====================
setInterval(() => {
    const now = Date.now();

    for (let id in users) {
        let u = users[id];

        if (
            u.data.phone == null &&
            u.data.consent_data === true &&
            now - u.lastActivity > 24 * 60 * 60 * 1000
        ) {
            if (u.data.consent_marketing) {
                sendMessage(id,
                    "🏠 Вы не завершили подбор недвижимости. Готов показать актуальные варианты.",
                    ["Продолжить"]
                );
            }

            u.lastActivity = now;
        }
    }
}, 60000);

// =====================
// 🚀 запуск (Render)
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Bot running on port " + PORT);
>>>>>>> e61a67594e5a945e6f0703aaba6d890f50ab440e
});