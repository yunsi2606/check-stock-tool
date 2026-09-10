const fs = require('fs');
const path = require('path');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const ORIGINAL_DATA_FILE = path.join(__dirname, '..', 'data.json');
const DATA_FILE = isVercel ? '/tmp/data.json' : ORIGINAL_DATA_FILE;

function sanitizeChatId(chatId) {
    if (!chatId) return '';
    let idStr = String(chatId).trim();
    if (!idStr.startsWith('-')) {
        if (idStr.startsWith('100') && idStr.length >= 12) {
            idStr = `-${idStr}`;
        } else if (/^\d{8,14}$/.test(idStr)) {
            idStr = `-100${idStr}`;
        }
    }
    return idStr;
}

const DEFAULT_DATA = {
    settings: {
        telegramBotToken: '',
        telegramChatId: '',
        checkIntervalSeconds: 300,
        checkIntervalMinutes: 5,
        autoCheckEnabled: true
    },
    products: [
        {
            id: "tiki-1",
            url: "https://tiki.vn/sach-ai-do-tap-3-p279695769.html?spid=279695871",
            platform: "tiki",
            title: "Sách Ai Đó - Tập 3",
            targetVariant: "all",
            lastChecked: null,
            lastStatus: "unknown",
            lastData: null,
            created: new Date().toISOString()
        },
        {
            id: "fahasa-1",
            url: "https://www.fahasa.com/ai-do-tap-3-ban-dac-biet-bia-cung-tang-kem-bookmark-postcard-card-pvc-moc-dien-thoai-bao-dung-the-kem-day-deo-so-lo-xo.html?fhs_campaign=SEARCH",
            platform: "fahasa",
            title: "Ai Đó - Tập 3 - Bản Đặc Biệt - Bìa Cứng",
            targetVariant: "all",
            lastChecked: null,
            lastStatus: "unknown",
            lastData: null,
            created: new Date().toISOString()
        },
        {
            id: "azvietnam-1",
            url: "https://azvietnam.vn/products/aido3",
            platform: "azvietnam",
            title: "Sách - Ai Đó (Tập 3)",
            targetVariant: "all",
            lastChecked: null,
            lastStatus: "unknown",
            lastData: null,
            created: new Date().toISOString()
        },
        {
            id: "nobita-1",
            url: "https://nobita.vn/san-pham/ai-do-tap-3-ban-dac-biet",
            platform: "nobita",
            title: "Ai Đó (Tập 3) – Bản Đặc Biệt",
            targetVariant: "all",
            lastChecked: null,
            lastStatus: "unknown",
            lastData: null,
            created: new Date().toISOString()
        }
    ],
    logs: [],
    notifications: []
};

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            if (isVercel && fs.existsSync(ORIGINAL_DATA_FILE)) {
                try {
                    const initialContent = fs.readFileSync(ORIGINAL_DATA_FILE, 'utf-8');
                    fs.writeFileSync(DATA_FILE, initialContent, 'utf-8');
                    return JSON.parse(initialContent);
                } catch (e) {
                    console.error("Error initializing /tmp/data.json on Vercel:", e.message);
                }
            }
            saveData(DEFAULT_DATA);
            return DEFAULT_DATA;
        }
        const content = fs.readFileSync(DATA_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error("Error reading data.json, returning default:", err.message);
        return DEFAULT_DATA;
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
        console.error("Error saving data.json:", err.message);
    }
}

function getSettings() {
    const data = loadData();
    const envToken = process.env.TELEGRAM_BOT_TOKEN;
    const envChat = process.env.TELEGRAM_CHAT_ID;
    return {
        ...data.settings,
        telegramBotToken: data.settings.telegramBotToken || envToken || '',
        telegramChatId: data.settings.telegramChatId || (envChat ? sanitizeChatId(envChat) : '')
    };
}

function updateSettings(newSettings) {
    const data = loadData();
    if (newSettings.telegramChatId) {
        newSettings.telegramChatId = sanitizeChatId(newSettings.telegramChatId);
    }
    data.settings = { ...data.settings, ...newSettings };
    saveData(data);
    return data.settings;
}

function getProducts() {
    const data = loadData();
    return data.products;
}

function addProduct(productData) {
    const data = loadData();
    const newProduct = {
        id: `prod-${Date.now()}`,
        url: productData.url,
        platform: productData.platform || 'unknown',
        title: productData.title || productData.url,
        targetVariant: productData.targetVariant || 'all',
        lastChecked: null,
        lastStatus: 'unknown',
        lastData: null,
        created: new Date().toISOString()
    };
    data.products.push(newProduct);
    saveData(data);
    return newProduct;
}

function updateProduct(id, updates) {
    const data = loadData();
    const index = data.products.findIndex(p => p.id === id);
    if (index !== -1) {
        data.products[index] = { ...data.products[index], ...updates };
        saveData(data);
        return data.products[index];
    }
    return null;
}

function deleteProduct(id) {
    const data = loadData();
    data.products = data.products.filter(p => p.id !== id);
    saveData(data);
    return true;
}

function addLog(level, message, details = null) {
    const data = loadData();
    const logEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        level, // 'info', 'warn', 'error', 'success'
        message,
        details
    };
    data.logs.unshift(logEntry);
    if (data.logs.length > 200) {
        data.logs = data.logs.slice(0, 200); // keep last 200 logs
    }
    saveData(data);
    return logEntry;
}

function getLogs(limit = 50) {
    const data = loadData();
    return data.logs.slice(0, limit);
}

function addNotification(notification) {
    const data = loadData();
    const entry = {
        id: `notif-${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...notification
    };
    data.notifications.unshift(entry);
    if (data.notifications.length > 100) {
        data.notifications = data.notifications.slice(0, 100);
    }
    saveData(data);
    return entry;
}

function getNotifications(limit = 50) {
    const data = loadData();
    return data.notifications.slice(0, limit);
}

module.exports = {
    loadData,
    saveData,
    getSettings,
    updateSettings,
    getProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    addLog,
    getLogs,
    addNotification,
    getNotifications
};
