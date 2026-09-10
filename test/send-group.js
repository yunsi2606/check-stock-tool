const { sendTestTelegramMessage } = require('../services/telegram');

async function sendToGroup() {
    const token = "8847925837:AAFJbwbfmpNDZJXM8ieaC4sRNjppyU3Doo0";
    const groupChatId = "-1004324379848";

    console.log(`Sending message to Telegram Group ID: ${groupChatId}`);
    const res = await sendTestTelegramMessage(token, groupChatId);
    console.log("Response:", res);
}

sendToGroup();
