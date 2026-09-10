const token = "8847925837:AAFJbwbfmpNDZJXM8ieaC4sRNjppyU3Doo0";

async function checkTelegramUpdates() {
    console.log("=== Checking Telegram Bot Updates ===");
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        const data = await res.json();
        console.log("getUpdates result:", JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error:", err.message);
    }
}

checkTelegramUpdates();
