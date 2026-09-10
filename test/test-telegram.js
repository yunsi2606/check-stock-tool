const { sendTestTelegramMessage } = require('../services/telegram');
const { getSettings } = require('../services/storage');

async function testTele() {
    const settings = getSettings();
    console.log("Current Settings Token:", settings.telegramBotToken);
    console.log("Current Settings ChatId:", settings.telegramChatId);

    // Test with saved chat ID
    console.log("\n--- Testing Telegram Send with stored settings ---");
    let res = await sendTestTelegramMessage(settings.telegramBotToken, settings.telegramChatId);
    console.log("Result 1 (Stored Chat ID):", res);

    // Test if chatId missing '-100' prefix for group
    if (!settings.telegramChatId.startsWith('-100') && settings.telegramChatId.startsWith('100')) {
        const fixedChatId = `-100${settings.telegramChatId}`;
        console.log(`\n--- Testing with fixed Chat ID (${fixedChatId}) ---`);
        res = await sendTestTelegramMessage(settings.telegramBotToken, fixedChatId);
        console.log("Result 2 (With -100 Prefix):", res);
    }
}

testTele();
