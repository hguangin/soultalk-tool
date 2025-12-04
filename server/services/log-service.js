/**
 * 日誌服務 - 統一管理所有日誌記錄
 * 支援分級、持久化、查詢
 */

const fs = require('fs');
const path = require('path');

class LogService {
    constructor() {
        this.logPath = process.env.LOG_PATH || '/app/data/logs';
        this.maxLogFiles = 30;  // 保留最近 30 天
        this.maxMemoryLogs = 1000;  // 記憶體中保留最近 1000 筆
        this.logs = [];  // 記憶體中的日誌
        
        this.ensureLogDirectory();
    }
    
    /**
     * 確保日誌目錄存在
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logPath)) {
            fs.mkdirSync(this.logPath, { recursive: true });
            console.log(`📁 建立日誌目錄: ${this.logPath}`);
        }
    }
    
    /**
     * 取得今天的日誌檔案路徑
     */
    getTodayLogFile() {
        const today = new Date().toISOString().slice(0, 10);
        return path.join(this.logPath, `${today}.log`);
    }
    
    /**
     * 記錄日誌
     * @param {string} level - 日誌等級: debug, info, warn, error, fatal
     * @param {string} category - 分類: transcription, ai-matching, ragic, config, api, system
     * @param {string} message - 訊息
     * @param {object} details - 詳細資料
     */
    log(level, category, message, details = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            details,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };
        
        // 加入記憶體
        this.logs.unshift(logEntry);
        if (this.logs.length > this.maxMemoryLogs) {
            this.logs = this.logs.slice(0, this.maxMemoryLogs);
        }
        
        // 寫入檔案
        this.writeToFile(logEntry);
        
        // 控制台輸出
        this.consoleOutput(logEntry);
        
        return logEntry;
    }
    
    /**
     * 寫入檔案
     */
    writeToFile(logEntry) {
        try {
            const logFile = this.getTodayLogFile();
            const line = JSON.stringify(logEntry) + '\n';
            fs.appendFileSync(logFile, line);
        } catch (error) {
            console.error('寫入日誌檔案失敗:', error.message);
        }
    }
    
    /**
     * 控制台輸出
     */
    consoleOutput(logEntry) {
        const icons = {
            debug: '🔍',
            info: 'ℹ️',
            warn: '⚠️',
            error: '❌',
            fatal: '💀'
        };
        
        const colors = {
            debug: '\x1b[36m',  // cyan
            info: '\x1b[32m',   // green
            warn: '\x1b[33m',   // yellow
            error: '\x1b[31m',  // red
            fatal: '\x1b[35m'   // magenta
        };
        
        const reset = '\x1b[0m';
        const icon = icons[logEntry.level] || 'ℹ️';
        const color = colors[logEntry.level] || '';
        
        console.log(
            `${color}${icon} [${logEntry.timestamp}] [${logEntry.category}] ${logEntry.message}${reset}`
        );
        
        if (logEntry.level === 'error' || logEntry.level === 'fatal') {
            if (logEntry.details && Object.keys(logEntry.details).length > 0) {
                console.log(`   詳細資料:`, JSON.stringify(logEntry.details, null, 2));
            }
        }
    }
    
    // ==================== 便捷方法 ====================
    
    debug(category, message, details) {
        return this.log('debug', category, message, details);
    }
    
    info(category, message, details) {
        return this.log('info', category, message, details);
    }
    
    warn(category, message, details) {
        return this.log('warn', category, message, details);
    }
    
    error(category, message, details) {
        return this.log('error', category, message, details);
    }
    
    fatal(category, message, details) {
        return this.log('fatal', category, message, details);
    }
    
    // ==================== 查詢方法 ====================
    
    /**
     * 查詢日誌（記憶體中）
     */
    query(options = {}) {
        let results = [...this.logs];
        
        // 按等級過濾
        if (options.level) {
            const levels = Array.isArray(options.level) ? options.level : [options.level];
            results = results.filter(log => levels.includes(log.level));
        }
        
        // 按分類過濾
        if (options.category) {
            const categories = Array.isArray(options.category) ? options.category : [options.category];
            results = results.filter(log => categories.includes(log.category));
        }
        
        // 按時間過濾
        if (options.since) {
            const sinceDate = new Date(options.since);
            results = results.filter(log => new Date(log.timestamp) >= sinceDate);
        }
        
        if (options.until) {
            const untilDate = new Date(options.until);
            results = results.filter(log => new Date(log.timestamp) <= untilDate);
        }
        
        // 按關鍵字搜尋
        if (options.keyword) {
            const keyword = options.keyword.toLowerCase();
            results = results.filter(log => 
                log.message.toLowerCase().includes(keyword) ||
                JSON.stringify(log.details).toLowerCase().includes(keyword)
            );
        }
        
        // 限制數量
        if (options.limit) {
            results = results.slice(0, options.limit);
        }
        
        return results;
    }
    
    /**
     * 從檔案讀取歷史日誌
     */
    async readHistoryLogs(date) {
        const logFile = path.join(this.logPath, `${date}.log`);
        
        if (!fs.existsSync(logFile)) {
            return [];
        }
        
        try {
            const content = fs.readFileSync(logFile, 'utf8');
            const lines = content.trim().split('\n').filter(line => line);
            return lines.map(line => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            }).filter(Boolean);
        } catch (error) {
            this.error('system', '讀取歷史日誌失敗', { date, error: error.message });
            return [];
        }
    }
    
    /**
     * 取得可用的日誌日期列表
     */
    getAvailableDates() {
        try {
            if (!fs.existsSync(this.logPath)) return [];
            
            return fs.readdirSync(this.logPath)
                .filter(f => f.endsWith('.log'))
                .map(f => f.replace('.log', ''))
                .sort()
                .reverse();
        } catch (error) {
            return [];
        }
    }
    
    /**
     * 取得統計資料
     */
    getStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byCategory: {},
            recentErrors: []
        };
        
        this.logs.forEach(log => {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
        });
        
        stats.recentErrors = this.logs
            .filter(log => log.level === 'error' || log.level === 'fatal')
            .slice(0, 10);
        
        return stats;
    }
    
    /**
     * 清理舊日誌
     */
    cleanOldLogs() {
        try {
            const files = fs.readdirSync(this.logPath)
                .filter(f => f.endsWith('.log'))
                .sort()
                .reverse();
            
            files.slice(this.maxLogFiles).forEach(file => {
                fs.unlinkSync(path.join(this.logPath, file));
                this.info('system', `清理舊日誌: ${file}`);
            });
        } catch (error) {
            console.error('清理舊日誌失敗:', error.message);
        }
    }
}

// 單例模式
const logService = new LogService();

module.exports = logService;
