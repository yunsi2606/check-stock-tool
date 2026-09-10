const { getProducts, updateProduct, getSettings, addLog, addNotification } = require('./storage');
const { scrapeProduct } = require('../scrapers');
const { sendStockAlert } = require('./telegram');

let monitorTimer = null;
let isChecking = false;

// Track last check timestamp per product to support adaptive throttling (e.g., Nobita max 1 check per 60s)
const lastCheckTimestamps = {};

/**
 * Perform stock check for a single product item
 */
async function checkProductItem(product, force = false) {
    const now = Date.now();
    
    // Adaptive Throttling: Nobita server responds slowly (5-8s).
    // If interval is 20s or 30s, throttle Nobita to minimum 60s interval unless forced by user click.
    if (!force && product.platform === 'nobita') {
        const lastTime = lastCheckTimestamps[product.id] || 0;
        if (now - lastTime < 50000) { // 50 seconds cooldown for Nobita
            return { product, result: product.lastData, changed: false, throttled: true };
        }
    }

    lastCheckTimestamps[product.id] = now;

    addLog('info', `Đang check stock cho: ${product.title} (${product.platform})`);

    const result = await scrapeProduct(product.url, product.targetVariant);

    if (!result.success) {
        addLog('error', `Lỗi check stock ${product.title}: ${result.error}`);
        updateProduct(product.id, {
            lastChecked: new Date().toISOString(),
            lastStatus: 'error',
            lastError: result.error
        });
        return { product, result, changed: false };
    }

    // Determine current availability
    const isNowAvailable = result.available;
    const currentStatus = isNowAvailable ? 'in_stock' : 'out_of_stock';
    const previousStatus = product.lastStatus || 'unknown';

    // Variant diffing
    const availableVariants = (result.variants || []).filter(v => v.available);
    const prevAvailableVariants = (product.lastData && product.lastData.variants) 
        ? product.lastData.variants.filter(v => v.available).map(v => v.title)
        : [];

    const newlyAvailableVariants = availableVariants.filter(v => !prevAvailableVariants.includes(v.title));

    let shouldNotify = false;
    let notifyReason = '';

    // Condition 1: Product was out_of_stock or unknown, and is now in_stock
    if (previousStatus === 'out_of_stock' && currentStatus === 'in_stock') {
        shouldNotify = true;
        notifyReason = 'Sản phẩm mới có hàng lại (Restock)';
    } 
    // Condition 2: Product was already in_stock or unknown, but new variant came back in stock
    else if (newlyAvailableVariants.length > 0 && previousStatus !== 'unknown') {
        shouldNotify = true;
        notifyReason = `Phân loại mới lên hàng: ${newlyAvailableVariants.map(v => v.title).join(', ')}`;
    }
    // Condition 3: Initial run & product is in stock
    else if (previousStatus === 'unknown' && currentStatus === 'in_stock') {
        shouldNotify = true;
        notifyReason = 'Phát hiện sản phẩm đang còn hàng khi mở tool';
    }

    addLog('success', `Check hoàn tất [${product.platform.toUpperCase()}]: ${result.title} - ${isNowAvailable ? 'CÒN HÀNG' : 'HẾT HÀNG'} (${result.responseTimeMs}ms)`);

    // Handle Telegram Notification
    if (shouldNotify) {
        const settings = getSettings();
        if (settings.telegramBotToken && settings.telegramChatId) {
            addLog('info', `Gửi thông báo Telegram cho ${product.title} (${notifyReason})...`);
            const teleRes = await sendStockAlert(
                settings.telegramBotToken,
                settings.telegramChatId,
                product,
                result,
                availableVariants
            );

            if (teleRes.success) {
                addLog('success', `Đã gửi thông báo Telegram thành công cho ${product.title}`);
                addNotification({
                    productId: product.id,
                    productTitle: result.title,
                    platform: product.platform,
                    reason: notifyReason,
                    url: product.url,
                    variants: availableVariants.map(v => v.title)
                });
            } else {
                addLog('error', `Lỗi gửi Telegram cho ${product.title}: ${teleRes.error}`);
            }
        } else {
            addLog('warn', `Chưa gửi Telegram cho ${product.title} vì chưa cấu hình Bot Token & Chat ID`);
        }
    }

    // Update state in storage
    updateProduct(product.id, {
        title: result.title || product.title,
        lastChecked: new Date().toISOString(),
        lastStatus: currentStatus,
        lastData: result,
        lastError: null
    });

    return { product, result, changed: shouldNotify };
}

/**
 * Run full check loop across all products
 */
async function runAllStockChecks(force = false) {
    if (isChecking && !force) {
        addLog('warn', 'Tiến trình check stock đang chạy, bỏ qua lượt này để tránh trùng lặp');
        return;
    }

    isChecking = true;
    const products = getProducts();
    addLog('info', `=== Bắt đầu lượt check stock tự động cho ${products.length} sản phẩm ===`);

    const startTime = Date.now();

    try {
        // Run all products in parallel
        const results = await Promise.all(products.map(p => checkProductItem(p, force)));
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        addLog('success', `=== Hoàn thành lượt check stock (${elapsed}s) ===`);
        return results;
    } catch (err) {
        addLog('error', `Lỗi trong tiến trình check stock: ${err.message}`);
    } finally {
        isChecking = false;
    }
}

/**
 * Initialize Scheduler (Supports 20s, 30s, 60s, 300s...)
 */
function initMonitorScheduler() {
    const settings = getSettings();
    if (monitorTimer) {
        clearInterval(monitorTimer);
        monitorTimer = null;
    }

    if (settings.autoCheckEnabled) {
        // Interval calculation in seconds
        let seconds = settings.checkIntervalSeconds;
        if (!seconds) {
            seconds = (settings.checkIntervalMinutes || 5) * 60;
        }
        const intervalMs = Math.max(10, seconds) * 1000;

        addLog('info', `Hệ thống tự động check stock khởi động (tần suất: ${seconds} giây/lần)`);
        
        // Trigger initial check after 2 seconds
        setTimeout(() => {
            runAllStockChecks();
        }, 2000);

        monitorTimer = setInterval(() => {
            runAllStockChecks();
        }, intervalMs);
    } else {
        addLog('warn', 'Tự động check stock đang bị TẮT trong cài đặt');
    }
}

module.exports = {
    checkProductItem,
    runAllStockChecks,
    initMonitorScheduler
};
