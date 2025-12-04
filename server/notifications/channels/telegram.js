/**
 * Telegram 通知管道
 */

const fetch = require('node-fetch');

module.exports = {
    /**
     * 發送文字訊息
     */
    async send(config, message) {
        if (!config.botToken || !config.chatId) {
            throw new Error('Telegram 設定不完整：需要 botToken 和 chatId');
        }
        
        const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: config.chatId,
                text: message,
                parse_mode: config.parseMode || 'HTML',
                disable_web_page_preview: config.disablePreview || false
            })
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Telegram API 錯誤: ${error}`);
        }
        
        return await response.json();
    },
    
    /**
     * 發送圖片
     */
    async sendPhoto(config, photoUrl, caption = '') {
        const url = `https://api.telegram.org/bot${config.botToken}/sendPhoto`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: config.chatId,
                photo: photoUrl,
                caption: caption,
                parse_mode: config.parseMode || 'HTML'
            })
        });
        
        return await response.json();
    }
};
