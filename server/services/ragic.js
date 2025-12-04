/**
 * ============================================================================
 * 📊 Ragic 服務 (ragic.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    負責和 Ragic 溝通：
 *    1. 讀取資料（透過 N8N Webhook）
 *    2. 寫入資料（直接 API 或透過 N8N）
 * 
 * 🔧 欄位對應怎麼設定？
 *    在網頁設定頁面的以下分類：
 *    - ragic_mv_input: MV 模式的輸入欄位
 *    - ragic_mv_output: MV 模式的輸出欄位
 *    - ragic_audio_input: 語音模式的輸入欄位
 *    - ragic_audio_output: 語音模式的輸出欄位
 * 
 *    每個設定的 value 是 Ragic 的欄位 ID（例如 _ragic_field_1000001）
 * 
 * ============================================================================
 */

const fetch = require('node-fetch');

class RagicService {
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
     * 取得 Ragic 相關設定
     */
    getConfig() {
        return {
            apiKey: this.db.settings.get('api_ragic_key'),
            baseUrl: this.db.settings.get('api_ragic_base_url'),
            readWebhook: this.db.settings.get('webhook_n8n_ragic_read'),
            writeWebhook: this.db.settings.get('webhook_n8n_ragic_write'),
        };
    }

    /**
     * 取得欄位對應
     * 
     * @param {string} mode - 模式：mv 或 audio
     * @param {string} direction - 方向：input 或 output
     * @returns {Object} 欄位對應物件，例如 { title: '_ragic_field_1000001', ... }
     */
    getFieldMapping(mode, direction) {
        // 取得該分類的所有設定
        const category = `ragic_${mode}_${direction}`;
        const settings = this.db.settings.getByCategory(category);
        
        // 轉換成 { 欄位名: Ragic欄位ID } 格式
        const mapping = {};
        const prefix = `ragic_${mode}_field_`;
        
        for (const s of settings) {
            if (s.key.startsWith(prefix)) {
                // ragic_mv_field_title -> title
                const fieldName = s.key.replace(prefix, '');
                mapping[fieldName] = s.value;
            }
        }
        
        return mapping;
    }

    /**
     * 取得背景設定預設值
     */
    getBackgroundDefaults() {
        return {
            type: this.db.settings.get('background_default_type') || 'color',
            color: this.db.settings.get('background_default_color') || '#1a1a2e',
            gradient: this.db.settings.get('background_default_gradient') || '',
            image: this.db.settings.get('background_default_image') || '',
            opacity: parseFloat(this.db.settings.get('background_default_opacity')) || 1,
            blur: parseInt(this.db.settings.get('background_default_blur')) || 0,
            overlay: this.db.settings.get('background_default_overlay') || 'rgba(0,0,0,0.3)',
            overlayEnabled: this.db.settings.get('background_overlay_enabled') === 'true',
        };
    }


    // ========================================================================
    // 📥 從 Ragic 讀取資料
    // ========================================================================

    /**
     * 從 Ragic 讀取資料
     * 
     * @param {string} ragicCode - Ragic 代碼（例如 Efji6e）
     * @param {string} mode - 模式：mv 或 audio
     * @returns {Object} 解析後的資料
     * 
     * 使用範例：
     *   const data = await ragic.read('Efji6e', 'mv');
     *   console.log(data.title, data.audioUrl);
     */
    async read(ragicCode, mode = 'mv') {
        const config = this.getConfig();
        
        // 檢查 Webhook 是否設定
        if (!config.readWebhook) {
            throw new Error('N8N Ragic 讀取 Webhook 未設定！請到設定頁面填寫。');
        }

        console.log(`📥 從 Ragic 讀取: ${ragicCode} (${mode})`);

        try {
            // 呼叫 N8N Webhook
            const response = await fetch(config.readWebhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: ragicCode,
                    mode: mode
                })
            });

            if (!response.ok) {
                throw new Error(`N8N 回應錯誤: ${response.status}`);
            }

            const rawData = await response.json();
            console.log('✅ Ragic 資料讀取成功');

            // 解析資料（用欄位對應）
            return this.parseRagicData(rawData, mode);

        } catch (error) {
            console.error('❌ Ragic 讀取失敗:', error.message);
            throw error;
        }
    }

    /**
     * 解析 Ragic 回傳的資料
     * 根據欄位對應設定，把 Ragic 的欄位轉成好用的格式
     */
    parseRagicData(rawData, mode) {
        const fields = this.getFieldMapping(mode, 'input');
        const bgDefaults = this.getBackgroundDefaults();

        // 輔助函數：從 rawData 取值
        const getValue = (fieldId) => {
            if (!fieldId) return null;
            // 嘗試直接用欄位 ID
            if (rawData[fieldId] !== undefined) return rawData[fieldId];
            // 嘗試不帶前綴的名稱
            const simpleName = fieldId.replace('_ragic_field_', '');
            if (rawData[simpleName] !== undefined) return rawData[simpleName];
            return null;
        };

        // 解析背景設定
        const parseBackground = (bgField) => {
            if (!bgField) return bgDefaults;
            
            try {
                // 嘗試解析為 JSON
                return { ...bgDefaults, ...JSON.parse(bgField) };
            } catch {
                // 不是 JSON，判斷是顏色還是圖片
                if (bgField.startsWith('http')) {
                    return { ...bgDefaults, type: 'image', image: bgField };
                } else if (bgField.startsWith('#') || bgField.startsWith('rgb')) {
                    return { ...bgDefaults, type: 'color', color: bgField };
                }
                return bgDefaults;
            }
        };

        // 根據模式解析
        if (mode === 'mv') {
            const r2Audio = getValue(fields.r2_audio_url);
            const originalAudio = getValue(fields.audio_url);

            return {
                // 基本資訊
                title: getValue(fields.title) || '',
                artist: getValue(fields.artist) || '',
                
                // 音頻（R2 優先）
                audioUrl: r2Audio || originalAudio || '',
                originalAudioUrl: originalAudio || '',
                
                // 內容
                lyrics: getValue(fields.lyrics) || '',
                images: getValue(fields.images) || '',
                
                // 設定
                background: parseBackground(getValue(fields.background)),
                region: getValue(fields.region) || '',
                
                // 原始資料（除錯用）
                _raw: rawData
            };
        } else {
            // 語音模式
            const mergedAudio = getValue(fields.merged_audio_url);
            const originalAudio = getValue(fields.audio_url);

            return {
                title: getValue(fields.title) || '',
                speaker: getValue(fields.speaker) || '',
                
                audioUrl: originalAudio || '',
                mergedAudioUrl: mergedAudio || '',
                finalAudioUrl: mergedAudio || originalAudio || '',
                
                transcript: getValue(fields.transcript) || '',
                imageUrl: getValue(fields.image_url) || '',
                
                background: parseBackground(getValue(fields.background)),
                region: getValue(fields.region) || '',
                
                _raw: rawData
            };
        }
    }


    // ========================================================================
    // 📤 寫入資料到 Ragic
    // ========================================================================

    /**
     * 寫入資料到 Ragic
     * 
     * @param {string} ragicCode - Ragic 代碼
     * @param {Object} data - 要寫入的資料，例如 { json: {...}, status: '完成' }
     * @param {string} mode - 模式：mv 或 audio
     * 
     * 使用範例：
     *   await ragic.write('Efji6e', { 
     *     json: lyricsData, 
     *     status: '已完成',
     *     processTime: '5分30秒'
     *   }, 'mv');
     */
    async write(ragicCode, data, mode = 'mv') {
        const config = this.getConfig();
        const fields = this.getFieldMapping(mode, 'output');

        // 準備要更新的資料
        const updateData = {};
        
        if (data.json !== undefined) {
            const jsonStr = typeof data.json === 'string' ? data.json : JSON.stringify(data.json);
            updateData[fields.output_json] = jsonStr;
        }
        if (data.status !== undefined) {
            updateData[fields.status] = data.status;
        }
        if (data.processTime !== undefined) {
            updateData[fields.process_time] = data.processTime;
        }
        if (data.error !== undefined) {
            updateData[fields.error_msg] = data.error;
        }

        console.log(`📤 寫入 Ragic: ${ragicCode}`);

        // 優先使用直接 API
        if (config.apiKey && config.baseUrl) {
            try {
                await this.writeDirectApi(ragicCode, updateData, config);
                return true;
            } catch (error) {
                console.warn('⚠️ 直接 API 失敗，嘗試 N8N...', error.message);
            }
        }

        // 備用：透過 N8N
        if (config.writeWebhook) {
            await this.writeViaN8N(ragicCode, updateData, mode, config);
            return true;
        }

        throw new Error('無法寫入 Ragic：直接 API 和 N8N Webhook 都沒有設定');
    }

    /**
     * 直接呼叫 Ragic API 寫入
     */
    async writeDirectApi(ragicCode, updateData, config) {
        const url = `${config.baseUrl}?where=${encodeURIComponent(`code,eq,${ragicCode}`)}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${Buffer.from(config.apiKey + ':').toString('base64')}`
            },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Ragic API 錯誤: ${response.status} - ${errorText.substring(0, 200)}`);
        }

        console.log('✅ Ragic 直接 API 寫入成功');
    }

    /**
     * 透過 N8N Webhook 寫入
     */
    async writeViaN8N(ragicCode, updateData, mode, config) {
        const response = await fetch(config.writeWebhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: ragicCode,
                mode: mode,
                data: updateData
            })
        });

        if (!response.ok) {
            throw new Error(`N8N Webhook 錯誤: ${response.status}`);
        }

        console.log('✅ N8N Webhook 寫入成功');
    }

    /**
     * 快速更新狀態
     */
    async updateStatus(ragicCode, status, mode = 'mv') {
        try {
            await this.write(ragicCode, { status }, mode);
        } catch (error) {
            console.warn('⚠️ 狀態更新失敗:', error.message);
        }
    }
}

module.exports = RagicService;
