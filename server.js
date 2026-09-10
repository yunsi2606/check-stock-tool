const express = require('express');
const cors = require('cors');
const path = require('path');
const { 
    getProducts, addProduct, deleteProduct, updateProduct,
    getSettings, updateSettings, getLogs, getNotifications, addLog 
} = require('./services/storage');
const { detectPlatform } = require('./scrapers');
const { checkProductItem, runAllStockChecks, initMonitorScheduler } = require('./services/monitor');
const { sendTestTelegramMessage } = require('./services/telegram');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// === REST API ENDPOINTS ===

// System overview status
app.get('/api/status', (req, res) => {
    const products = getProducts();
    const settings = getSettings();
    const logs = getLogs(5);

    const total = products.length;
    const inStock = products.filter(p => p.lastStatus === 'in_stock').length;
    const outOfStock = products.filter(p => p.lastStatus === 'out_of_stock').length;
    const errors = products.filter(p => p.lastStatus === 'error').length;
    const unknown = products.filter(p => !p.lastStatus || p.lastStatus === 'unknown').length;

    res.json({
        totalProducts: total,
        inStockCount: inStock,
        outOfStockCount: outOfStock,
        errorCount: errors,
        unknownCount: unknown,
        telegramConfigured: Boolean(settings.telegramBotToken && settings.telegramChatId),
        autoCheckEnabled: settings.autoCheckEnabled,
        checkIntervalMinutes: settings.checkIntervalMinutes,
        recentLogs: logs
    });
});

// Products CRUD
app.get('/api/products', (req, res) => {
    res.json(getProducts());
});

app.post('/api/products', async (req, res) => {
    const { url, targetVariant } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL không được để trống' });
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
        return res.status(400).json({ error: 'URL không thuộc danh sách hỗ trợ (Tiki, AZ Vietnam, Fahasa, Nobita.vn)' });
    }

    const newProduct = addProduct({
        url,
        platform,
        title: `Đang tải tên sản phẩm (${platform.toUpperCase()})...`,
        targetVariant: targetVariant || 'all'
    });

    addLog('info', `Đã thêm sản phẩm mới: ${url}`);

    // Trigger initial check asynchronously for the newly added product
    checkProductItem(newProduct);

    res.json({ success: true, product: newProduct });
});

app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    deleteProduct(id);
    addLog('info', `Đã xóa sản phẩm khỏi danh sách theo dõi (ID: ${id})`);
    res.json({ success: true });
});

// Manual Stock Check Triggers
app.post('/api/products/:id/check', async (req, res) => {
    const products = getProducts();
    const product = products.find(p => p.id === req.params.id);
    if (!product) {
        return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
    }

    const result = await checkProductItem(product);
    res.json(result);
});

app.post('/api/check-all', async (req, res) => {
    addLog('info', 'Bắt đầu thủ công lượt check stock toàn bộ sản phẩm từ Web UI');
    runAllStockChecks(); // run async
    res.json({ success: true, message: 'Đã phát lệnh check stock toàn bộ sản phẩm' });
});

// Settings
app.get('/api/settings', (req, res) => {
    res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
    const updated = updateSettings(req.body);
    addLog('info', 'Đã cập nhật cấu hình hệ thống');
    initMonitorScheduler(); // re-init scheduler with new interval/settings
    res.json({ success: true, settings: updated });
});

// Telegram Test
app.post('/api/telegram/test', async (req, res) => {
    const { botToken, chatId } = req.body;
    const settings = getSettings();
    const token = botToken || settings.telegramBotToken;
    const chat = chatId || settings.telegramChatId;

    if (!token || !chat) {
        return res.status(400).json({ error: 'Vui lòng nhập Bot Token và Chat ID để thử nghiệm' });
    }

    const result = await sendTestTelegramMessage(token, chat);
    res.json(result);
});

// Logs & Notifications
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    res.json(getLogs(limit));
});

app.get('/api/notifications', (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    res.json(getNotifications(limit));
});

// Vercel Cron Job Trigger Endpoint
app.get('/api/cron', async (req, res) => {
    addLog('info', '⚡ Vercel Cron Triggered: Bắt đầu check stock toàn bộ sản phẩm');
    const results = await runAllStockChecks(true);
    res.json({ success: true, checkedAt: new Date().toISOString(), totalChecked: results ? results.length : 0 });
});

// Start Server & Scheduler (Local execution)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 Stock Checker Server running on http://localhost:${PORT}`);
        console.log(`====================================================`);
        initMonitorScheduler();
    });
}

module.exports = app;
