const { getProducts, updateProduct, getSettings, addLog, addNotification } = require('./storage');
const { scrapeProduct } = require('../scrapers');
const { sendStockAlert } = require('./telegram');

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
    const isNowAvailable = Boolean(result.available);
    const currentStatus = isNowAvailable ? 'in_stock' : 'out_of_stock';
    const previousStatus = product.lastStatus || 'unknown';

    // Variant diffing - strictly filter by targetVariant if specified so unwanted variants never trigger alerts
    const isTargetSpecified = Boolean(product.targetVariant && product.targetVariant !== 'all');
    const cleanTarget = isTargetSpecified ? product.targetVariant.trim().toLowerCase() : '';

    const relevantVariants = isTargetSpecified
        ? (result.variants || []).filter(v => v.title.toLowerCase().includes(cleanTarget))
        : (result.variants || []);

    const availableVariants = relevantVariants.filter(v => v.available);

    const prevRelevantVariants = (product.lastData && product.lastData.variants)
        ? (isTargetSpecified
            ? product.lastData.variants.filter(v => v.title.toLowerCase().includes(cleanTarget))
            : product.lastData.variants)
        : [];

    const prevAvailableVariants = prevRelevantVariants.filter(v => v.available).map(v => v.title);
    const newlyAvailableVariants = availableVariants.filter(v => !prevAvailableVariants.includes(v.title));

    let shouldNotify = false;
    let notifyReason = '';

    // Only notify when product or targeted variant is ACTUALLY available right now
    if (isNowAvailable) {
        // Condition 1: Product was out_of_stock, and is now in_stock
        if (previousStatus === 'out_of_stock') {
            shouldNotify = true;
            notifyReason = isTargetSpecified
                ? `Phân loại ${product.targetVariant} mới có hàng lại (Restock)`
                : 'Sản phẩm mới có hàng lại (Restock)';
        } 
        // Condition 2: Product was in_stock, but a newly available variant came back
        else if (newlyAvailableVariants.length > 0 && previousStatus !== 'unknown') {
            shouldNotify = true;
            notifyReason = `Phân loại mới lên hàng: ${newlyAvailableVariants.map(v => v.title).join(', ')}`;
        }
        // Condition 3: Initial run & product is in stock
        else if (previousStatus === 'unknown') {
            shouldNotify = true;
            notifyReason = 'Phát hiện sản phẩm đang còn hàng khi mở tool';
        }
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
    const updatedTitle = (result.title && !result.title.includes('Shopping Cart Icon') && !result.title.startsWith('Đang tải')) ? result.title : product.title;
    updateProduct(product.id, {
        title: updatedTitle,
        lastChecked: new Date().toISOString(),
        lastStatus: currentStatus,
        lastData: result,
        lastError: null
    });

    return { product, result, changed: shouldNotify };
}

const { stockQueue } = require('./queue');

// Inject checkProductItem into the queue engine
stockQueue.setCheckHandler(checkProductItem);

/**
 * Run full check loop across all products via Task Queue (or sequential for Vercel Cron)
 */
async function runAllStockChecks(force = false) {
    if (process.env.VERCEL) {
        // In serverless Vercel Cron, process sequentially within Lambda execution time
        const products = getProducts();
        addLog('info', `=== [VERCEL CRON] Bắt đầu check tuần tự ${products.length} sản phẩm ===`);
        const results = [];
        for (const p of products) {
            const res = await checkProductItem(p, force);
            results.push(res);
            await new Promise(r => setTimeout(r, 600)); // safe delay
        }
        return results;
    }

    // In normal persistent server (Local/VPS/Docker), push all to priority queue
    stockQueue.enqueueAll(true);
}

/**
 * Initialize Monitor Scheduler using StockQueueEngine
 */
function initMonitorScheduler() {
    const settings = getSettings();
    if (settings.autoCheckEnabled) {
        stockQueue.start();
    } else {
        stockQueue.stop();
        addLog('warn', 'Tự động check stock đang bị TẮT trong cài đặt');
    }
}

module.exports = {
    checkProductItem,
    runAllStockChecks,
    initMonitorScheduler,
    stockQueue
};
