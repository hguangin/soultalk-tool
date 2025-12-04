/**
 * Ragic 整合服務
 * 處理與 Ragic 的資料讀寫，透過 N8N Webhook 或直接 API
 */

const fetch = require('node-fetch');
const configManager = require('../../services/config-manager');

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
        console.log(`📡 URL: ${url}`);
        
        try {
            const response = await fetch(url);
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Ragic 查詢失敗 (${response.status}): ${error}`);
            }
            
            const rawData = await response.json();
            
            console.log('📦 Ragic 原始回應:', JSON.stringify(rawData, null, 2).substring(0, 500));
            
            // ✅ 處理 Ragic 返回的數據結構
            // 格式: { "19": { "_ragicId": 19, "1005226": "姓名", ... } }
            const keys = Object.keys(rawData);
            if (keys.length === 0) {
                throw new Error('找不到該代碼的資料');
            }
            
            // 取第一個 key 的值作為記錄
            const firstKey = keys[0];
            const record = rawData[firstKey];
            
            console.log('🔑 記錄 Key:', firstKey);
            console.log('📄 記錄欄位:', Object.keys(record).slice(0, 10));
            
            // 解析並映射欄位
            return this.mapFields(record, mode);
            
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
        
        // 除錯：顯示原始資料的部分欄位
        console.log('🔍 原始資料欄位檢查:');
        console.log('  - 姓名 (1005226):', rawData['1005226'] || rawData['姓名']);
        console.log('  - 地區 (1005230):', rawData['1005230'] || rawData['地區']);
        console.log('  - minimax音樂連結 (1005414):', rawData['1005414'] || rawData['minimax音樂連結']);
        
        // 通用欄位
        result.code = this.getFieldValue(rawData, fields.code);
        result.name = this.getFieldValue(rawData, fields.name);
        result.region = this.getFieldValue(rawData, fields.region);
        
        if (mode === 'mv') {
            // MV 模式欄位
            result.audioUrl = this.getFieldValue(rawData, fields.minimaxMusicUrl);
            result.mvCode = this.getFieldValue(rawData, fields.mvCode);
            result.mvJson = this.getFieldValue(rawData, fields.mvJson);
            
            // MV 專用欄位（直接用名稱取值）
            const mvFields = this.config.mvFields;
            const fullImages = rawData[mvFields.fullImages] || '';
            const transparentImages = rawData[mvFields.transparentImages] || '';
            const wideImages = rawData[mvFields.wideImages] || '';
            result.lyrics = rawData[mvFields.lyrics] || '';
            result.songTitle = rawData[mvFields.songTitle] || '';
            result.artist = rawData[mvFields.artist] || '';
            
            console.log('🎵 MV 欄位:');
            console.log('  - 歌詞欄位名:', mvFields.lyrics, '值:', result.lyrics ? '有' : '無');
            console.log('  - 封面圖欄位名:', mvFields.fullImages, '值:', fullImages ? '有' : '無');
            
            // 整合所有圖片到 images 陣列
            result.images = [];
            if (fullImages) {
                const urls = fullImages.split(',').map(u => u.trim()).filter(u => u);
                urls.forEach(url => result.images.push({ url, type: 'full' }));
            }
            if (transparentImages) {
                const urls = transparentImages.split(',').map(u => u.trim()).filter(u => u);
                urls.forEach(url => result.images.push({ url, type: 'transparent' }));
            }
            if (wideImages) {
                const urls = wideImages.split(',').map(u => u.trim()).filter(u => u);
                urls.forEach(url => result.images.push({ url, type: 'wide' }));
            }
            
            // 保留原始欄位供其他用途
            result.fullImages = fullImages;
            result.transparentImages = transparentImages;
            result.wideImages = wideImages;
            
        } else {
            // 語音模式欄位
            result.audioUrl = this.getFieldValue(rawData, fields.mp3Link0);
            result.mergedAudioUrl = this.getFieldValue(rawData, fields.mp3Link1);
            result.audioCode = this.getFieldValue(rawData, fields.audioCode);
            result.audioJson = this.getFieldValue(rawData, fields.audioJson);
            result.backgroundImage = this.getFieldValue(rawData, fields.mainCharacterImg);
            result.transcript = this.getFieldValue(rawData, fields.soultalkTXT);
            
            console.log('🎙️ 語音欄位:');
            console.log('  - 音頻 URL:', result.audioUrl ? '有' : '無');
            console.log('  - 逐字稿:', result.transcript ? '有' : '無');
            console.log('  - 背景圖:', result.backgroundImage ? '有' : '無');
            
            // 語音專用欄位
            const audioFields = this.config.audioFields;
            result.title = audioFields.title;
            result.artistPrefix = audioFields.artistPrefix;
            
            // 整合圖片
            result.images = [];
            if (result.backgroundImage) {
                const urls = result.backgroundImage.split(',').map(u => u.trim()).filter(u => u);
                urls.forEach(url => result.images.push({ url, type: 'background' }));
            }
        }
        
        console.log(`📦 欄位映射完成:`, Object.keys(result).filter(k => result[k]).length, '個欄位有值');
        console.log(`📷 圖片數量: ${result.images?.length || 0}`);
        return result;
    }
    
    /**
     * 取得欄位值（支援 ID、名稱、別名）
     */
    getFieldValue(data, fieldConfig) {
        if (!fieldConfig) return null;
        
        // 優先嘗試欄位 ID（Ragic 原始格式用 ID）
        if (fieldConfig.id && data[fieldConfig.id]) {
            return data[fieldConfig.id];
        }
        
        // 嘗試欄位名稱
        if (fieldConfig.name && data[fieldConfig.name]) {
            return data[fieldConfig.name];
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
