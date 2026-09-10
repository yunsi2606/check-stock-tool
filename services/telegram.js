/**
 * Telegram Notification Service
 */

function formatPrice(price) {
    if (!price || isNaN(price)) return 'Liên hệ';
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
}

/**
 * Format and sanitize Telegram Chat ID
 */
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

// Lazy logger helper to avoid circular dependency with storage.js
function logEvent(level, message, details = null) {
    try {
        const storage = require('./storage');
        if (storage && typeof storage.addLog === 'function') {
            storage.addLog(level, message, details);
        }
    } catch (e) {
        console.log(`[${level.toUpperCase()}] ${message}`);
    }
}

/**
 * Send raw HTML message to Telegram Chat/Group
 */
async function sendTelegramMessage(botToken, chatId, textMessage) {
    if (!botToken || !chatId) {
        const err = 'Chưa cấu hình Telegram Bot Token hoặc Chat ID';
        logEvent('error', err);
        return { success: false, error: err };
    }

    const cleanToken = botToken.trim();
    const targetChatId = sanitizeChatId(chatId);

    const apiUrl = `https://api.telegram.org/bot${cleanToken}/sendMessage`;

    try {
        const res = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: targetChatId,
                text: textMessage,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        const data = await res.json();
        if (!data.ok) {
            let errorMsg = data.description || 'Lỗi gửi tin nhắn Telegram';
            if (errorMsg.includes('chat not found')) {
                errorMsg = `Lỗi Chat ID không tồn tại (${targetChatId}). Hướng dẫn: Nếu gửi vào Nhóm Telegram, bạn phải THÊM BOT VÀO NHÓM làm Admin. Nếu gửi cá nhân, bạn phải bấm /start với Bot trước.`;
            } else if (errorMsg.includes('bot was blocked')) {
                errorMsg = 'Bot đã bị người dùng/nhóm chặn. Vui lòng unblock bot trên Telegram.';
            } else if (errorMsg.includes('Unauthorized')) {
                errorMsg = 'Bot Token không hợp lệ. Vui lòng kiểm tra lại Token từ @BotFather.';
            }

            logEvent('error', `Telegram Error (${targetChatId}): ${errorMsg}`);
            return { success: false, error: errorMsg, raw: data };
        }

        logEvent('success', `Đã gửi tin nhắn Telegram thành công tới Chat ID: ${targetChatId}`);
        return { success: true, data };
    } catch (err) {
        logEvent('error', `Lỗi kết nối tới Telegram API: ${err.message}`);
        return { success: false, error: err.message };
    }
}

/**
 * Send formatted Telegram alert for stock restock / available status
 */
async function sendStockAlert(botToken, chatId, product, scrapeResult, variantDetails = null) {
    const platformNames = {
        tiki: 'Tiki.vn',
        azvietnam: 'AZ Vietnam',
        fahasa: 'Fahasa.com',
        nobita: 'Nobita.vn'
    };

    const platformName = platformNames[scrapeResult.platform] || scrapeResult.platform.toUpperCase();

    let message = `🚨 <b>[THÔNG BÁO CÓ HÀNG / RESTOCK]</b> 🚨\n\n`;
    message += `📚 <b>Sản phẩm:</b> ${escapeHtml(scrapeResult.title)}\n`;
    message += `🛒 <b>Nguồn:</b> ${platformName}\n`;

    if (variantDetails && variantDetails.length > 0) {
        message += `🏷️ <b>Phân loại còn hàng:</b>\n`;
        variantDetails.forEach(v => {
            message += `  • <b>${escapeHtml(v.title)}</b>: ${formatPrice(v.price)}\n`;
        });
    } else {
        message += `💵 <b>Giá:</b> ${formatPrice(scrapeResult.price)}\n`;
    }

    message += `⏰ <b>Thời gian check:</b> ${new Date().toLocaleTimeString('vi-VN')}\n\n`;
    message += `👉 <a href="${scrapeResult.url}"><b>Bấm vào đây để đặt mua ngay</b></a>`;

    return await sendTelegramMessage(botToken, chatId, message);
}

/**
 * Send test message
 */
async function sendTestTelegramMessage(botToken, chatId) {
    const msg = `✅ <b>[KIỂM TRA TELEGRAM BOT - STOCK MONITOR PRO]</b>\n\nChúc mừng! Telegram Bot đã kết nối thành công với Tool Check Stock.\n⏰ <b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}`;
    return await sendTelegramMessage(botToken, chatId, msg);
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

module.exports = {
    sanitizeChatId,
    sendTelegramMessage,
    sendStockAlert,
    sendTestTelegramMessage
};
