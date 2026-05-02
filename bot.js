const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");

const app = express();
app.use(bodyParser.json());

// =====================
// 🔑 ENV
// =====================
const TOKEN = process.env.TOKEN;
const MANAGER_CHAT_ID = process.env.MANAGER_CHAT_ID;

// =====================
// 🧠 ПАМЯТЬ (временно)
// =====================
const users = {};

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
async function sendMessage(userId, text, buttons = []) {
    try {
        await axios.post("https://api.max.ru/messages", {
            user_id: userId,
            text,
            buttons
        }, {
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json"
            }
        });
    } catch (err) {
        console.log("❌ send error:", err.response?.data || err.message);
    }
}

// =====================
async function notifyManager(data) {
    const message = `
🏠 Новый лид

👤 Имя: ${data.name}
📞 Телефон: ${data.phone}
🎯 Цель: ${data.goal}
💰 Бюджет: ${data.budget}
📣 Маркетинг: ${data.consent_marketing ? "да" : "нет"}
`;

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

    // START
    if (text === "/start") {
        user.stage = "consent_data";

        await sendMessage(userId,
            "Перед началом работы нужно согласие на обработку данных:",
            [
                { text: "Открыть документ", url: "https://disk.yandex.ru/i/NzUXt3p-QlhYbw" },
                { text: "Согласен" }
            ]
        );
    }

    // consent data
    else if (text === "Согласен" && user.stage === "consent_data") {
        user.data.consent_data = true;
        user.stage = "consent_marketing";

        await sendMessage(userId,
            "Разрешаете отправлять подборки?",
            ["Согласен", "Не согласен"]
        );
    }

    // marketing yes
    else if (text === "Согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = true;
        user.stage = "goal";

        await sendMessage(userId,
            "Что вас интересует?",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    // marketing no
    else if (text === "Не согласен" && user.stage === "consent_marketing") {
        user.data.consent_marketing = false;
        user.stage = "goal";

        await sendMessage(userId,
            "Ок, без рассылок. Что ищем?",
            ["Квартира", "Дом", "Инвестиции"]
        );
    }

    // goal
    else if (["Квартира", "Дом", "Инвестиции"].includes(text)) {
        user.data.goal = text;
        user.stage = "budget";

        await sendMessage(userId,
            "Какой бюджет?",
            ["до 3 млн", "3–5 млн", "5–8 млн", "8+ млн"]
        );
    }

    // budget
    else if (text && text.includes("млн")) {
        user.data.budget = text;
        user.stage = "name";

        await sendMessage(userId, "Введите имя");
    }

    // name
    else if (user.stage === "name") {
        user.data.name = text;
        user.stage = "phone";

        await sendMessage(userId, "Введите телефон");
    }

    // phone
    else if (user.stage === "phone") {
        user.data.phone = text;
        user.stage = "done";

        console.log("🔥 ЛИД:", user.data);

        await notifyManager(user.data);

        await sendMessage(userId,
            "Спасибо! Скоро свяжемся 🏠"
        );
    }

    res.sendStatus(200);
});

// =====================
// ⏱ напоминание 24ч
// =====================
setInterval(() => {
    const now = Date.now();

    for (let id in users) {
        let u = users[id];

        if (
            !u.data.phone &&
            u.data.consent_data &&
            now - u.lastActivity > 24 * 60 * 60 * 1000
        ) {
            if (u.data.consent_marketing) {
                sendMessage(id,
                    "Вы не завершили заявку. Продолжим?",
                    ["Продолжить"]
                );
            }

            u.lastActivity = now;
        }
    }
}, 60000);

// =====================
// 🚀 START SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("🚀 Bot running on port " + PORT);
});