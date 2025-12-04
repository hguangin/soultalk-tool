/**
 * ============================================================================
 * 📱 通知服務 (notification.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    負責發送通知，支援兩種方式：
 *    1. 透過 N8N Webhook（預設，N8N 可以轉發到任何地方）
 *    2. 直接呼叫 Telegram Bot API
 *    兩種方式可以同時啟用！
 * 
 * 🔧 如何設定？
 *    在網頁設定頁面的「通知設定」分類：
 *    - notify_via_n8n: 是否透過 N8N 發送
 *    - notify_via_telegram_direct: 是否直接發送 Telegram
 *    - telegram_bot_token: Telegram Bot Token
 *    - telegram_chat_id: Telegram Chat ID
 * 
 * 📝 通知模板變數：
 *    {name} - 工作名稱
 *    {type} - 類型（MV/語音）
 *    {ragicCode} - Ragic 代碼
 *    {duration} - 耗時
 *    {error} - 錯誤訊息
 *    {step} - 當前步驟
 *    {steps} - 所有步驟列表
 *    {time} - 當前時間
 * 
 * ============================================================================
 */

const fetch = require('node-fetch');

class NotificationService {
    /**
     * 建構函數
     * @param {Object} db - 資料庫模組
     */
    constructor(db) {
        this.db = db;
    }

    // ========================================================================
    // 📖 讀取設定
    // ========================================================================

    /**
     * 取得通知相關設定
     */
    getConfig() {
        return {
            // 通知方式
            viaN8N: this.db.settings.get('notify_via_n8n') === 'true',
            viaTelegramDirect: this.db.settings.get('notify_via_telegram_direct') === 'true',
            
            // N8N Webhook
            n8nWebhook: this.db.settings.get('webhook_n8n_notification'),
            
            // Telegram 設定
            telegramBotToken: this.db.settings.get('telegram_bot_token'),
            telegramChatId: this.db.settings.get('telegram_chat_id'),
            
            // 通知時機
            onSuccess: this.db.settings.get('notify_on_success') === 'true',
            onFailure: this.db.settings.get('notify_on_failure') === 'true',
            onPause: this.db.settings.get('notify_on_pause') === 'true',
            
            // 模板
            templateSuccess: this.db.settings.get('notify_template_success') || '',
            templateFailure: this.db.settings.get('notify_template_failure') || '',
        };
    }


    // ========================================================================
    // 📤 發送通知
    // ========================================================================

    /**
     * 發送通知（主要函數）
     * 會根據設定選擇發送方式
     * 
     * @param {string} type - 通知類型：success/failure/pause
     * @param {Object} data - 通知資料
     */
    async send(type, data) {
        const config = this.getConfig();

        // 檢查是否應該發送
        if (type === 'success' && !config.onSuccess) return;
        if (type === 'failure' && !config.onFailure) return;
        if (type === 'pause' && !config.onPause) return;

        // 格式化訊息
        const message = this.formatMessage(type, data, config);

        // 發送（可同時啟用多種方式）
        const results = [];

        if (config.viaN8N && config.n8nWebhook) {
            results.push(await this.sendViaN8N(type, data, message, config));
        }

        if (config.viaTelegramDirect && config.telegramBotToken && config.telegramChatId) {
            results.push(await this.sendViaTelegram(message, config));
        }

        // 如果都沒有設定
        if (results.length === 0) {
            console.log('📱 通知未發送：沒有啟用任何通知方式');
        }

        return results;
    }

    /**
     * 透過 N8N Webhook 發送
     */
    async sendViaN8N(type, data, message, config) {
        try {
            console.log('📤 透過 N8N 發送通知...');
            
            const response = await fetch(config.n8nWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: type,           // success/failure/pause
                    message: message,     // 格式化的訊息
                    data: data,           // 原始資料（N8N 可以自己處理）
                    timestamp: new Date().toISOString()
                })
            });

            if (response.ok) {
                console.log('✅ N8N 通知發送成功');
                return { method: 'n8n', success: true };
            } else {
                console.error('❌ N8N 通知發送失敗:', response.status);
                return { method: 'n8n', success: false, error: response.status };
            }
        } catch (error) {
            console.error('❌ N8N 通知發送錯誤:', error.message);
            return { method: 'n8n', success: false, error: error.message };
        }
    }

    /**
     * 直接透過 Telegram Bot API 發送
     */
    async sendViaTelegram(message, config) {
        try {
            console.log('📤 直接發送 Telegram 通知...');
            
            const url = `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: config.telegramChatId,
                    text: message,
                    parse_mode: 'HTML'  // 支援 <b>, <i>, <code> 等標籤
                })
            });

            const result = await response.json();

            if (result.ok) {
                console.log('✅ Telegram 通知發送成功');
                return { method: 'telegram', success: true };
            } else {
                console.error('❌ Telegram 通知發送失敗:', result.description);
                return { method: 'telegram', success: false, error: result.description };
            }
        } catch (error) {
            console.error('❌ Telegram 通知發送錯誤:', error.message);
            return { method: 'telegram', success: false, error: error.message };
        }
    }


    // ========================================================================
    // 📝 格式化訊息
    // ========================================================================

    /**
     * 格式化通知訊息
     * 
     * @param {string} type - 通知類型
     * @param {Object} data - 資料
     * @param {Object} config - 設定
     */
    formatMessage(type, data, config) {
        // 選擇模板
        let template;
        if (type === 'success') {
            template = config.templateSuccess || this.getDefaultSuccessTemplate();
        } else if (type === 'failure') {
            template = config.templateFailure || this.getDefaultFailureTemplate();
        } else {
            template = this.getDefaultPauseTemplate();
        }

        // 準備變數
        const variables = {
            name: data.name || '未命名',
            type: data.type === 'mv' ? 'MV' : '語音',
            ragicCode: data.ragicCode || '-',
            duration: this.formatDuration(data.durationSeconds),
            error: data.error || '未知錯誤',
            step: data.currentStep || '未知',
            steps: this.formatSteps(data.logs || []),
            time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }),
        };

        // 替換變數
        let message = template;
        for (const [key, value] of Object.entries(variables)) {
            message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
        }

        // 處理換行（設定中的 \n 轉成真的換行）
        message = message.replace(/\\n/g, '\n');

        return message;
    }

    /**
     * 格式化時間
     */
    formatDuration(seconds) {
        if (!seconds) return '未知';
        if (seconds < 60) return `${seconds}秒`;
        if (seconds < 3600) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}分${secs}秒`;
        }
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hours}小時${mins}分`;
    }

    /**
     * 格式化步驟列表
     */
    formatSteps(logs) {
        if (!logs || logs.length === 0) return '(無)';
        
        return logs.map(log => {
            const icon = log.status === 'completed' ? '✅' :
                        log.status === 'failed' ? '❌' :
                        log.status === 'skipped' ? '⏭️' : '🔄';
            const duration = log.duration_ms ? ` (${(log.duration_ms / 1000).toFixed(1)}s)` : '';
            return `${icon} ${log.step}${duration}`;
        }).join('\n');
    }


    // ========================================================================
    // 📋 預設模板
    // ========================================================================

    getDefaultSuccessTemplate() {
        return `✅ <b>完成</b>
━━━━━━━━━━━━
📌 專案: {name}
🎬 類型: {type}
🆔 代碼: {ragicCode}
⏱️ 耗時: {duration}

<b>步驟:</b>
{steps}
━━━━━━━━━━━━`;
    }

    getDefaultFailureTemplate() {
        return `❌ <b>失敗</b>
━━━━━━━━━━━━
📌 專案: {name}
🎬 類型: {type}
🆔 代碼: {ragicCode}
⏱️ 耗時: {duration}
📍 失敗於: {step}

<b>錯誤:</b>
{error}

<b>步驟:</b>
{steps}
━━━━━━━━━━━━`;
    }

    getDefaultPauseTemplate() {
        return `⏸️ <b>已暫停</b>
━━━━━━━━━━━━
📌 專案: {name}
📍 暫停於: {step}
━━━━━━━━━━━━`;
    }


    // ========================================================================
    // 🧪 測試功能
    // ========================================================================

    /**
     * 發送測試通知
     */
    async sendTest() {
        const config = this.getConfig();
        
        const testMessage = `🔔 <b>測試通知</b>
━━━━━━━━━━━━
✅ 通知設定正確！
📱 來自 SoulTalk Tool
⏰ ${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}
━━━━━━━━━━━━`;

        const results = [];

        if (config.viaN8N && config.n8nWebhook) {
            results.push(await this.sendViaN8N('test', {}, testMessage, config));
        }

        if (config.viaTelegramDirect && config.telegramBotToken && config.telegramChatId) {
            results.push(await this.sendViaTelegram(testMessage, config));
        }

        if (results.length === 0) {
            return { success: false, message: '沒有啟用任何通知方式' };
        }

        return { success: results.some(r => r.success), results };
    }


    // ========================================================================
    // 🎯 快捷方法
    // ========================================================================

    /**
     * 發送成功通知
     */
    async notifySuccess(job, logs = []) {
        return this.send('success', {
            name: job.name,
            type: job.type,
            ragicCode: job.ragic_code,
            durationSeconds: job.duration_seconds,
            logs: logs
        });
    }

    /**
     * 發送失敗通知
     */
    async notifyFailure(job, error, logs = []) {
        return this.send('failure', {
            name: job.name,
            type: job.type,
            ragicCode: job.ragic_code,
            durationSeconds: job.duration_seconds,
            error: error,
            currentStep: job.current_step,
            logs: logs
        });
    }

    /**
     * 發送暫停通知
     */
    async notifyPause(job) {
        return this.send('pause', {
            name: job.name,
            type: job.type,
            ragicCode: job.ragic_code,
            currentStep: job.current_step
        });
    }
}

module.exports = NotificationService;
