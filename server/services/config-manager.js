/**
 * 設定管理器 - 統一管理所有設定檔
 * 支援熱更新、合併預設值、設定保護
 * 
 * 🔒 重要：設定檔在 Volume 掛載目錄，重新部署不會清空
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        // 設定檔路徑（Volume 掛載，重新部署不會清空）
        this.configPath = process.env.CONFIG_PATH || '/app/data/config';
        
        // 預設值路徑（程式碼內，會被更新覆蓋）
        this.defaultsPath = path.join(__dirname, '../../data/config');
        
        // 備份路徑
        this.backupPath = process.env.BACKUP_PATH || '/app/data/backups';
        
        this.cache = {};
        this.watchers = {};
        
        // 確保目錄存在
        this.ensureDirectories();
    }
    
    /**
     * 確保必要目錄存在
     */
    ensureDirectories() {
        [this.configPath, this.backupPath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`📁 建立目錄: ${dir}`);
            }
        });
    }
    
    /**
     * 載入設定檔（自動合併預設值，不覆蓋現有值）
     * 
     * 🔒 保護機制：
     * 1. 如果 Volume 中已有設定 → 使用現有的（不覆蓋）
     * 2. 如果 Volume 中沒有 → 從預設值複製
     * 3. 如果有新增設定項目 → 只補充新項目，不改現有值
     */
    load(configName) {
        const volumePath = path.join(this.configPath, `${configName}.json`);
        const defaultPath = path.join(this.defaultsPath, `${configName}.json`);
        
        try {
            // 讀取預設值
            let defaults = {};
            if (fs.existsSync(defaultPath)) {
                defaults = JSON.parse(fs.readFileSync(defaultPath, 'utf8'));
            }
            
            // 🔒 關鍵：檢查 Volume 中是否已有設定
            if (fs.existsSync(volumePath)) {
                // ✅ Volume 中有設定 → 使用現有的
                const current = JSON.parse(fs.readFileSync(volumePath, 'utf8'));
                console.log(`✅ 載入現有設定: ${configName}.json（不覆蓋）`);
                
                // 合併：保留現有值，只補充缺少的新項目
                const merged = this.deepMerge(defaults, current);
                
                // 如果有新項目，更新檔案（但不改變現有值）
                const hasNewItems = JSON.stringify(merged) !== JSON.stringify(current);
                if (hasNewItems) {
                    // 備份現有設定
                    this.backup(configName, current);
                    
                    // 寫入合併後的設定
                    merged._lastModified = new Date().toISOString();
                    merged._version = (current._version || '1.0') + ' (updated)';
                    fs.writeFileSync(volumePath, JSON.stringify(merged, null, 2));
                    console.log(`📝 補充新設定項目: ${configName}.json`);
                }
                
                this.cache[configName] = merged;
                return merged;
                
            } else {
                // ❌ Volume 中沒有 → 從預設值建立
                console.log(`📝 建立設定檔（從預設值）: ${configName}.json`);
                defaults._lastModified = new Date().toISOString();
                fs.writeFileSync(volumePath, JSON.stringify(defaults, null, 2));
                this.cache[configName] = defaults;
                return defaults;
            }
            
        } catch (error) {
            console.error(`❌ 載入設定失敗 (${configName}):`, error.message);
            return {};
        }
    }
    
    /**
     * 備份設定檔
     */
    backup(configName, data) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupFile = path.join(this.backupPath, `${configName}-${timestamp}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
            console.log(`💾 備份設定: ${configName}-${timestamp}.json`);
            
            // 只保留最近 10 個備份
            this.cleanOldBackups(configName);
        } catch (error) {
            console.error(`⚠️ 備份失敗 (${configName}):`, error.message);
        }
    }
    
    /**
     * 清理舊備份（保留最近 10 個）
     */
    cleanOldBackups(configName) {
        try {
            const files = fs.readdirSync(this.backupPath)
                .filter(f => f.startsWith(configName + '-') && f.endsWith('.json'))
                .sort()
                .reverse();
            
            // 刪除超過 10 個的備份
            files.slice(10).forEach(file => {
                fs.unlinkSync(path.join(this.backupPath, file));
            });
        } catch (error) {
            // 忽略清理錯誤
        }
    }
    
    /**
     * 儲存設定檔
     */
    save(configName, data) {
        const filePath = path.join(this.configPath, `${configName}.json`);
        
        try {
            // 備份現有設定
            if (fs.existsSync(filePath)) {
                const backupPath = path.join(this.configPath, `${configName}.backup.json`);
                fs.copyFileSync(filePath, backupPath);
            }
            
            // 更新時間戳
            data._lastModified = new Date().toISOString();
            
            // 儲存
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            this.cache[configName] = data;
            
            console.log(`✅ 設定已儲存: ${configName}.json`);
            return true;
            
        } catch (error) {
            console.error(`❌ 儲存設定失敗 (${configName}):`, error.message);
            return false;
        }
    }
    
    /**
     * 取得設定（使用快取）
     */
    get(configName) {
        if (!this.cache[configName]) {
            this.load(configName);
        }
        return this.cache[configName];
    }
    
    /**
     * 重新載入設定（清除快取）
     */
    reload(configName) {
        delete this.cache[configName];
        return this.load(configName);
    }
    
    /**
     * 重新載入所有設定
     */
    reloadAll() {
        const configNames = Object.keys(this.cache);
        configNames.forEach(name => this.reload(name));
        console.log('🔄 所有設定已重新載入');
    }
    
    /**
     * 深度合併物件（保留現有值）
     */
    deepMerge(defaults, current) {
        const result = { ...current };
        
        for (const key of Object.keys(defaults)) {
            // 跳過私有屬性（_開頭）
            if (key.startsWith('_')) continue;
            
            if (!(key in result)) {
                // 新項目，使用預設值
                result[key] = defaults[key];
            } else if (
                typeof defaults[key] === 'object' && 
                defaults[key] !== null &&
                !Array.isArray(defaults[key])
            ) {
                // 遞迴合併物件
                result[key] = this.deepMerge(defaults[key], result[key] || {});
            }
            // 現有值保留不變
        }
        
        return result;
    }
    
    /**
     * 監聽設定變更
     */
    watch(configName, callback) {
        const filePath = path.join(this.configPath, `${configName}.json`);
        
        if (this.watchers[configName]) {
            this.watchers[configName].close();
        }
        
        this.watchers[configName] = fs.watch(filePath, (eventType) => {
            if (eventType === 'change') {
                console.log(`🔄 設定變更: ${configName}.json`);
                this.reload(configName);
                callback(this.cache[configName]);
            }
        });
    }
    
    /**
     * 取得所有設定檔名稱
     */
    listConfigs() {
        if (!fs.existsSync(this.configPath)) return [];
        
        return fs.readdirSync(this.configPath)
            .filter(f => f.endsWith('.json') && !f.includes('.backup'))
            .map(f => f.replace('.json', ''));
    }
    
    /**
     * 匯出所有設定（用於下載或備份）
     */
    exportAll() {
        const configs = {};
        const configNames = this.listConfigs();
        
        configNames.forEach(name => {
            configs[name] = this.get(name);
        });
        
        return {
            _exportVersion: '2.0',
            _exportTime: new Date().toISOString(),
            _configCount: configNames.length,
            configs
        };
    }
    
    /**
     * 匯入所有設定（從備份還原）
     */
    importAll(exportData) {
        if (!exportData.configs) {
            throw new Error('無效的匯出資料格式');
        }
        
        const results = [];
        
        for (const [name, data] of Object.entries(exportData.configs)) {
            try {
                // 備份現有設定
                const current = this.get(name);
                if (current && Object.keys(current).length > 0) {
                    this.backup(name, current);
                }
                
                // 儲存新設定
                this.save(name, data);
                results.push({ name, success: true });
            } catch (error) {
                results.push({ name, success: false, error: error.message });
            }
        }
        
        return results;
    }
    
    /**
     * 取得所有備份列表
     */
    listBackups() {
        if (!fs.existsSync(this.backupPath)) return [];
        
        return fs.readdirSync(this.backupPath)
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                filename: f,
                configName: f.split('-')[0],
                timestamp: f.replace('.json', '').split('-').slice(1).join('-'),
                path: path.join(this.backupPath, f)
            }))
            .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    }
    
    /**
     * 從備份還原特定設定
     */
    restoreFromBackup(backupFilename) {
        const backupFile = path.join(this.backupPath, backupFilename);
        
        if (!fs.existsSync(backupFile)) {
            throw new Error(`備份檔案不存在: ${backupFilename}`);
        }
        
        const configName = backupFilename.split('-')[0];
        const data = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
        
        // 備份當前設定
        const current = this.get(configName);
        if (current) {
            this.backup(configName + '-before-restore', current);
        }
        
        // 還原
        this.save(configName, data);
        return { configName, success: true };
    }
}

// 單例模式
const configManager = new ConfigManager();

module.exports = configManager;
