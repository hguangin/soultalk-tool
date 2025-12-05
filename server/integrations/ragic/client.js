/**
 * Ragic 客戶端
 * 透過 N8N Webhook 取得 Ragic 資料
 */

const fetch = require('node-fetch');
const { fieldMappings, getFlatFieldIds } = require('./field-mappings');
const configManager = require('../../services/config-manager');

class RagicClient {
    constructor() {
        // N8N Webhook URLs
        this.webhookUrls = {
            fetch: 'https://app.notpro.cc/webhook/soultalk',
            upload: 'https://app.notpro.cc/webhook/up-mv-json'
        };
    }

    /**
     * 根據代碼取得 Ragic 資料
     * @param {string} code - Ragic 代碼
     * @param {string} mode - 'mv' 或 'audio'
     * @returns {Promise<object>} - 處理後的資料
     */
    async fetchByCode(code, mode = 'mv') {
        console.log(`\n🔍 正在透過 N8N 查詢 Ragic 資料...`);
        console.log(`  - 代碼: ${code}`);
        console.log(`  - 模式: ${mode}`);

        try {
            // 呼叫 N8N Webhook
            const url = `${this.webhookUrls.fetch}?id=${encodeURIComponent(code)}`;
            console.log(`  - URL: ${url}`);

            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const rawData = await response.json();
            console.log(`  - 原始回應類型: ${typeof rawData}`);

            // N8N Webhook 回傳格式: { "19": { "_ragicId": 19, "1005226": "姓名", ... } }
            // 需要先提取第一個 key 的值
            let recordData = rawData;
            if (typeof rawData === 'object' && !Array.isArray(rawData)) {
                const keys = Object.keys(rawData);
                if (keys.length > 0 && rawData[keys[0]] && typeof rawData[keys[0]] === 'object') {
                    recordData = rawData[keys[0]];
                    console.log(`  - 提取記錄 ID: ${keys[0]}`);
                }
            }

            // 除錯：顯示原始資料欄位
            this.debugRawData(recordData, mode);

            // 轉換為應用程式格式
            const result = this.transformData(recordData, mode);
            
            console.log(`\n✅ 資料載入成功`);
            console.log(`  - 姓名: ${result.name || '(空)'}`);
            console.log(`  - MBTI: ${result.mbti || '(空)'}`);
            console.log(`  - 性別: ${result.gender || '(空)'}`);

            return result;

        } catch (error) {
            console.error(`❌ 查詢失敗:`, error.message);
            throw error;
        }
    }

    /**
     * 除錯：顯示原始資料欄位
     */
    debugRawData(rawData, mode) {
        console.log('\n🔍 原始資料欄位檢查:');
        
        const common = fieldMappings.common;
        for (const [key, field] of Object.entries(common)) {
            const value = this.getFieldValue(rawData, field);
            const status = value ? `✅ ${value}` : '❌ 空';
            console.log(`  - ${field.name} (${field.id}): ${status}`);
        }

        const modeFields = fieldMappings[mode] || {};
        console.log(`\n🎵 ${mode.toUpperCase()} 模式欄位映射:`);
        
        for (const [key, field] of Object.entries(modeFields)) {
            if (field.id) {
                const value = this.getFieldValue(rawData, field);
                const status = value ? (value.length > 50 ? `有 (${value.length}字)` : value) : '❌ 空';
                console.log(`  - ${key} (${field.id}): ${status}`);
            }
        }
    }

    /**
     * 從原始資料取得欄位值
     * @param {object} rawData - 原始資料
     * @param {object} field - 欄位定義 { id, name }
     * @returns {string|null} - 欄位值
     */
    getFieldValue(rawData, field) {
        if (!rawData || !field) return null;
        
        // 優先用 ID 查詢
        if (field.id && rawData[field.id] !== undefined) {
            return rawData[field.id] || null;
        }
        
        // 備用：用名稱查詢
        if (field.name && rawData[field.name] !== undefined) {
            return rawData[field.name] || null;
        }
        
        return null;
    }

    /**
     * 轉換資料為應用程式格式
     */
    transformData(rawData, mode) {
        const common = fieldMappings.common;
        const modeFields = fieldMappings[mode] || {};

        // 基本資料
        const result = {
            // 通用欄位
            name: this.getFieldValue(rawData, common.name),
            gender: this.getFieldValue(rawData, common.gender),
            mbti: this.getFieldValue(rawData, common.mbti),
            region: this.getFieldValue(rawData, common.region),
            ragicCode: this.getFieldValue(rawData, common.ragicCode),
            mvCode: this.getFieldValue(rawData, common.mvCode),
            audioCode: this.getFieldValue(rawData, common.audioCode),
            
            // 模式
            mode: mode
        };

        if (mode === 'mv') {
            // MV 模式專用
            const minimaxUrl = this.getFieldValue(rawData, modeFields.minimaxMusicUrl);
            const mp3Link2 = this.getFieldValue(rawData, modeFields.mp3Link2);
            
            result.audioUrl = minimaxUrl || mp3Link2;
            result.minimaxUrl = minimaxUrl;  // 保留原始 minimax URL
            result.songTitle = this.getFieldValue(rawData, modeFields.songTitle);
            result.artist = this.getFieldValue(rawData, modeFields.artist);
            result.lyrics = this.getFieldValue(rawData, modeFields.lyrics);
            
            // 處理圖片
            result.images = this.extractImages(rawData, modeFields);
            
        } else if (mode === 'audio') {
            // 語音模式專用
            const audioUrl = this.getFieldValue(rawData, modeFields.audioUrl);
            const mp3Link = this.getFieldValue(rawData, modeFields.mp3Link);
            
            result.audioUrl = audioUrl || mp3Link;
            result.title = this.getFieldValue(rawData, modeFields.title);
            result.speaker = this.getFieldValue(rawData, modeFields.speaker);
            result.transcript = this.getFieldValue(rawData, modeFields.transcript);
            result.coverImage = this.getFieldValue(rawData, modeFields.coverImage);
        }

        // 取得 MBTI 對應的顏色
        if (result.gender && result.mbti) {
            const colorInfo = configManager.getColorsForMBTI(result.gender, result.mbti);
            result.bgColors = colorInfo.colors;
            result.bgDirection = colorInfo.direction;
            result.colorGroupName = colorInfo.groupName;
            
            // 取得視覺參數
            const visualParams = configManager.getVisualParamsForMBTI(result.mbti);
            result.visualParams = visualParams;
        }

        return result;
    }

    /**
     * 提取並分類圖片
     */
    extractImages(rawData, modeFields) {
        const images = {
            full: [],
            transparent: [],
            background: [],
            wide: [],
            all: []
        };

        const keywords = configManager.getImageKeywords();
        
        // 定義關鍵字陣列
        const keywordArrays = {
            full: (keywords.full || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k),
            transparent: (keywords.transparent || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k),
            background: (keywords.background || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k),
            static: (keywords.static || '').split(',').map(k => k.trim().toLowerCase()).filter(k => k)
        };

        // 遍歷圖片欄位
        for (let i = 1; i <= 10; i++) {
            const imageField = modeFields.images?.[`image${i}`];
            const titleField = modeFields.imageTitles?.[`title${i}`];
            
            const imageUrl = imageField ? this.getFieldValue(rawData, imageField) : null;
            const imageTitle = titleField ? this.getFieldValue(rawData, titleField) : '';
            
            if (imageUrl) {
                const titleLower = (imageTitle || '').toLowerCase();
                let type = 'full';  // 預設為 full
                
                // 根據標題關鍵字分類
                if (keywordArrays.transparent.some(k => titleLower.includes(k))) {
                    type = 'transparent';
                } else if (keywordArrays.background.some(k => titleLower.includes(k))) {
                    type = 'background';
                } else if (keywordArrays.static.some(k => titleLower.includes(k))) {
                    type = 'full';  // static 歸類為 full
                } else if (keywordArrays.full.some(k => titleLower.includes(k))) {
                    type = 'full';
                }
                
                const imageObj = {
                    url: imageUrl,
                    title: imageTitle,
                    type: type,
                    index: i
                };
                
                images[type].push(imageObj);
                images.all.push(imageObj);
            }
        }

        console.log(`\n📷 圖片分類結果:`);
        console.log(`  - Full: ${images.full.length} 張`);
        console.log(`  - Transparent: ${images.transparent.length} 張`);
        console.log(`  - Background: ${images.background.length} 張`);
        console.log(`  - 總計: ${images.all.length} 張`);

        return images;
    }

    /**
     * 上傳 JSON 到 Ragic
     */
    async uploadJSON(data) {
        console.log('\n📤 準備透過 N8N 上傳到 Ragic...');
        
        const { queryCode, mvCode, audioCode, mode, jsonData } = data;
        
        const requestBody = {
            id: queryCode,
            'mv代碼': mvCode || '',
            'mv-json': mode === 'mv' ? JSON.stringify(jsonData) : '',
            'audio代碼': audioCode || '',
            'audio-json': mode === 'audio' ? JSON.stringify(jsonData) : ''
        };

        console.log(`  - 查詢代碼: ${queryCode}`);
        console.log(`  - 模式: ${mode}`);
        console.log(`  - mv代碼: ${mvCode || '(空)'}`);
        console.log(`  - audio代碼: ${audioCode || '(空)'}`);
        console.log(`  - JSON 大小: ${JSON.stringify(jsonData).length} bytes`);

        try {
            const response = await fetch(this.webhookUrls.upload, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.text();
            console.log('✅ 上傳成功:', result);
            return { success: true, message: result };

        } catch (error) {
            console.error('❌ 上傳失敗:', error.message);
            throw error;
        }
    }
}

module.exports = new RagicClient();
