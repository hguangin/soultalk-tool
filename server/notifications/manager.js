/**
 * 通知管理器
 * 統一管理所有通知管道：Telegram、Email、Webhook 等
 */

const fs = require('fs');
const path = require('path');
const configManager = require('../services/config-manager');

class NotificationManager {
    constructor() {
        this.config = configManager.get('notifications');
        this.channels = {};
        this.loadChannels();
    }
    
    /**
     * 動態載入所有通知管道
     */
    loadChannels() {
        const channelsDir = path.join(__dirname, 'channels');
        
        if (!fs.existsSync(channelsDir)) {
            fs.mkdirSync(channelsDir, { recursive: true });
            return;
        }
        
        const files = fs.readdirSync(channelsDir).filter(f => f.endsWith('.js'));
        
        files.forEach(file => {
            const name = file.replace('.js', '');
            try {
                this.channels[name] = require(path.join(channelsDir, file));
                console.log(`📢 載入通知管道: ${name}`);
            } catch (error) {
                console.error(`❌ 載入通知管道失敗 (${name}):`, error.message);
            }
        });
    }
    
    /**
     * 重新載入設定
     */
    reload() {
        this.config = configManager.get('notifications');
        console.log('📢 通知設定已重新載入');
    }
    
    /**
     * 發送通知
     */
    async send(event, data) {
        this.reload();
        
        // 找出符合的規則
        const matchingRules = this.config.rules.filter(rule => {
            if (rule.event !== event) return false;
            
            // 檢查條件
            if (rule.conditions) {
                for (const [key, values] of Object.entries(rule.conditions)) {
                    if (Array.isArray(values)) {
                        if (!values.includes(data[key])) return false;
                    } else {
                        if (data[key] !== values) return false;
                    }
                }
            }
            return true;
        });
        
        if (matchingRules.length === 0) {
            console.log(`📢 沒有符合的通知規則: ${event}`);
            return [];
        }
        
        // 對每個規則發送通知
        const results = [];
        
        for (const rule of matchingRules) {
            for (const channelName of rule.channels) {
                const channelConfig = this.config.channels[channelName];
                
                if (!channelConfig?.enabled) {
                    continue;
                }
                
                const template = this.config.templates[rule.template]?.[channelName];
                if (!template) {
                    console.warn(`⚠️ 找不到模板: ${rule.template}.${channelName}`);
                    continue;
                }
                
                try {
                    const message = this.formatMessage(template, data);
                    const channel = this.channels[channelName];
                    
                    if (channel && channel.send) {
                        await channel.send(channelConfig, message);
                        results.push({ channel: channelName, success: true });
                        console.log(`✅ 通知已發送: ${channelName}`);
                    } else {
                        console.warn(`⚠️ 通知管道未實作: ${channelName}`);
                    }
                    
                } catch (error) {
                    results.push({ channel: channelName, success: false, error: error.message });
                    console.error(`❌ 通知失敗 (${channelName}):`, error.message);
                }
            }
        }
        
        return results;
    }
    
    /**
     * 格式化訊息（替換變數）
     */
    formatMessage(template, data) {
        if (typeof template === 'string') {
            return template.replace(/\{(\w+)\}/g, (match, key) => {
                return data[key] !== undefined ? data[key] : match;
            });
        } else if (typeof template === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(template)) {
                result[key] = this.formatMessage(value, data);
            }
            return result;
        }
        return template;
    }
    
    /**
     * 發送工作完成通知
     */
    async notifyJobComplete(jobData) {
        return this.send('job.complete', {
            title: jobData.title || '未命名',
            mode: jobData.mode || 'unknown',
            duration: jobData.duration || '0s',
            playerUrl: jobData.playerUrl || '',
            ragicCode: jobData.ragicCode || ''
        });
    }
    
    /**
     * 發送工作失敗通知
     */
    async notifyJobFailed(jobData) {
        return this.send('job.failed', {
            title: jobData.title || '未命名',
            mode: jobData.mode || 'unknown',
            error: jobData.error || '未知錯誤',
            retryCount: jobData.retryCount || 0
        });
    }
}

module.exports = new NotificationManager();
