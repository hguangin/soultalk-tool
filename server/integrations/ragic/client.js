/**
 * Ragic 整合服務
 * 處理與 Ragic 的資料讀寫，透過 N8N Webhook 或直接 API
 */

const fetch = require('node-fetch');
const configManager = require('../services/config-manager');

class RagicClient {
    constructor() {
        this.config = configManager.get('ragic');
    }
    
    /**
     * 重新載入設定
     */
    reload() {
        this.config = configManager.get('ragic');
    }
    
    /**
     * 透過 N8N Webhook 取得資料
     */
    async fetchByCode(code, mode = 'mv') {
        this.reload();
        
        const webhookUrl = this.config.n8nWebhook.fetchData;
        const url = `${webhookUrl}?idtool=${encodeURIComponent(code)}`;
        
        console.log(`📡 Ragic 查詢: ${code}`);
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ragic 查詢失敗 (${response.status}): ${error}`);
            }
            
            const rawData = await response.json();
            
            // 解析並映射欄位
            return this.mapFields(rawData, mode);
            
        } catch (error) {
            console.error(`❌ Ragic 查詢失敗:`, error.message);
            throw error;
        }
    }
    
    /**
     * 上傳 JSON 到 Ragic
     */
    async uploadJson(options) {
        this.reload();
        
        const {
            queryCode,
            mvCode = '',
            audioCode = '',
            mode,
            jsonData
        } = options;
        
        const webhookUrl = this.config.n8nWebhook.uploadJson;
        
        const requestBody = {
            id: queryCode,
            'mv代碼': mvCode,
            'mv-json': mode === 'mv' ? JSON.stringify(jsonData) : '',
            'audio代碼': audioCode,
            'audio-json': mode === 'audio' ? JSON.stringify(jsonData) : ''
        };
        
        console.log(`📤 上傳到 Ragic...`);
        console.log(`   - 模式: ${mode}`);
        console.log(`   - 代碼: ${queryCode}`);
        
        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`上傳失敗 (${response.status}): ${error}`);
            }
            
            const result = await response.text();
            console.log(`✅ 上傳成功`);
            return { success: true, result };
            
        } catch (error) {
            console.error(`❌ 上傳失敗:`, error.message);
            throw error;
        }
    }
    
    /**
     * 欄位映射 - 將 Ragic 資料轉換為應用格式
     */
    mapFields(rawData, mode) {
        const fields = this.config.fields;
        const result = {};
        
        // 通用欄位
        result.code = this.getFieldValue(rawData, fields.code);
        result.name = this.getFieldValue(rawData, fields.name);
        result.region = this.getFieldValue(rawData, fields.region);
        
        if (mode === 'mv') {
            // MV 模式欄位
            result.audioUrl = this.getFieldValue(rawData, fields.minimaxMusicUrl);
            result.mvCode = this.getFieldValue(rawData, fields.mvCode);
            result.mvJson = this.getFieldValue(rawData, fields.mvJson);
            
            // MV 專用欄位（從 mvFields 設定）
            const mvFields = this.config.mvFields;
            result.fullImages = this.getFieldValue(rawData, { name: mvFields.fullImages });
            result.transparentImages = this.getFieldValue(rawData, { name: mvFields.transparentImages });
            result.wideImages = this.getFieldValue(rawData, { name: mvFields.wideImages });
            result.lyrics = this.getFieldValue(rawData, { name: mvFields.lyrics });
            result.songTitle = this.getFieldValue(rawData, { name: mvFields.songTitle });
            result.artist = this.getFieldValue(rawData, { name: mvFields.artist });
            
        } else {
            // 語音模式欄位
            result.audioUrl = this.getFieldValue(rawData, fields.mp3Link0);
            result.mergedAudioUrl = this.getFieldValue(rawData, fields.mp3Link1);
            result.audioCode = this.getFieldValue(rawData, fields.audioCode);
            result.audioJson = this.getFieldValue(rawData, fields.audioJson);
            result.backgroundImage = this.getFieldValue(rawData, fields.mainCharacterImg);
            result.transcript = this.getFieldValue(rawData, fields.soultalkTXT);
            
            // 語音專用欄位
            const audioFields = this.config.audioFields;
            result.title = audioFields.title;
            result.artistPrefix = audioFields.artistPrefix;
        }
        
        console.log(`📦 欄位映射完成:`, Object.keys(result).filter(k => result[k]).length, '個欄位有值');
        return result;
    }
    
    /**
     * 取得欄位值（支援 ID、名稱、別名）
     */
    getFieldValue(data, fieldConfig) {
        if (!fieldConfig) return null;
        
        // 嘗試欄位名稱
        if (fieldConfig.name && data[fieldConfig.name]) {
            return data[fieldConfig.name];
        }
        
        // 嘗試欄位 ID
        if (fieldConfig.id && data[fieldConfig.id]) {
            return data[fieldConfig.id];
        }
        
        // 嘗試別名
        if (fieldConfig.aliases) {
            for (const alias of fieldConfig.aliases) {
                if (data[alias]) {
                    return data[alias];
                }
            }
        }
        
        // 如果 fieldConfig 是字串，直接嘗試
        if (typeof fieldConfig === 'string' && data[fieldConfig]) {
            return data[fieldConfig];
        }
        
        return null;
    }
}

module.exports = new RagicClient();
