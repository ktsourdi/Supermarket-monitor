import TelegramBot from 'node-telegram-bot-api';

export async function sendTelegramMessage(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('Telegram not configured');
    return;
  }
  const bot = new TelegramBot(token, { polling: false });
  await bot.sendMessage(chatId, message, { disable_web_page_preview: true });
}
