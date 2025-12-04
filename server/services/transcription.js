/**
 * ============================================================================
 * 🎤 語音識別服務 (transcription.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    負責把音頻轉成文字和時間戳。
 *    支援多個 API：147 Whisper、N1N Whisper、AssemblyAI
 *    會自動重試，失敗時自動切換到備用 API。
 * 
 * 🔧 API 順序怎麼設定？
 *    在設定頁面的「重試規則」分類：
 *    - retry_transcription_order: 逗號分隔的 API ID
 *      例如：whisper147,whisperN1N,assemblyai
 * 
 * 📤 回傳格式：
 *    {
 *      success: true,
 *      api: '147 Whisper',      // 使用的 API 名稱
 *      data: {
 *        text: '完整文字',
 *        words: [
 *          { text: '你', start: 1000, end: 1200 },  // 時間是毫秒
 *          { text: '好', start: 1200, end: 1400 },
 *        ]
 *      }
 *    }
 * 
 * ============================================================================
 */

const fetch = require('node-fetch');
const FormData = require('form-data');

class TranscriptionService {
    constructor(db) {
        this.db = db;
    }

    // ========================================================================
    // 📖 讀取設定
    // ========================================================================

    /**
     * 取得所有語音識別 API 的設定
     */
    getApiConfigs() {
        return {
            whisper147: {
                id: 'whisper147',
                name: '147 Whisper',
                type: 'openai-whisper',
                endpoint: this.db.settings.get('api_whisper147_endpoint'),
                apiKey: this.db.settings.get('api_whisper147_key'),
            },
            whisperN1N: {
                id: 'whisperN1N',
                name: 'N1N Whisper',
                type: 'openai-whisper',
                endpoint: this.db.settings.get('api_whisperN1N_endpoint'),
                apiKey: this.db.settings.get('api_whisperN1N_key'),
            },
            assemblyai: {
                id: 'assemblyai',
                name: 'AssemblyAI',
                type: 'assemblyai',
                apiKey: this.db.settings.get('api_assemblyai_key'),
            }
        };
    }

    /**
     * 取得重試設定
     */
    getRetryConfig() {
        return {
            maxAttempts: parseInt(this.db.settings.get('retry_max_attempts')) || 3,
            delayMs: parseInt(this.db.settings.get('retry_delay_ms')) || 2000,
            apiOrder: (this.db.settings.get('retry_transcription_order') || 'whisper147,whisperN1N,assemblyai')
                .split(',')
                .map(s => s.trim())
        };
    }


    // ========================================================================
    // 🎤 主要函數：語音識別
    // ========================================================================

    /**
     * 執行語音識別
     * 
     * @param {string} audioUrl - 音頻網址
     * @param {Object} options - 選項
     *   - preferredApi: 優先使用的 API（可選）
     *   - language: 語言代碼，如 'zh', 'en', 'ja'（可選，預設自動偵測）
     *   - onProgress: 進度回報函數（可選）
     * 
     * @returns {Object} { success, api, data: { text, words } }
     * 
     * 使用範例：
     *   const result = await transcription.transcribe('https://example.com/audio.mp3');
     *   console.log(result.data.text);
     *   console.log(result.data.words);
     */
    async transcribe(audioUrl, options = {}) {
        const { preferredApi, language = 'auto', onProgress } = options;
        
        const apis = this.getApiConfigs();
        const retryConfig = this.getRetryConfig();
        
        // 決定 API 嘗試順序
        let apiOrder = [...retryConfig.apiOrder];
        if (preferredApi && apis[preferredApi]) {
            // 把偏好的 API 移到最前面
            apiOrder = [preferredApi, ...apiOrder.filter(id => id !== preferredApi)];
        }

        let lastError = null;
        let totalRetries = 0;

        // 依序嘗試每個 API
        for (const apiId of apiOrder) {
            const api = apis[apiId];
            
            // 檢查 API 是否可用
            if (!api || !api.apiKey) {
                console.log(`⏭️ ${apiId} 未設定 API Key，跳過`);
                continue;
            }

            console.log(`🎤 嘗試 ${api.name}...`);
            if (onProgress) onProgress({ step: 'transcription', api: api.name, status: 'started' });

            // 重試機制
            for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
                try {
                    console.log(`  第 ${attempt}/${retryConfig.maxAttempts} 次嘗試`);
                    
                    let result;
                    if (api.type === 'openai-whisper') {
                        result = await this.callWhisperApi(audioUrl, api, language);
                    } else if (api.type === 'assemblyai') {
                        result = await this.callAssemblyAI(audioUrl, api.apiKey, onProgress);
                    }

                    console.log(`✅ ${api.name} 成功！共 ${result.words.length} 個詞`);
                    
                    return {
                        success: true,
                        api: api.name,
                        apiId: api.id,
                        data: result,
                        retries: totalRetries
                    };

                } catch (error) {
                    lastError = error;
                    totalRetries++;
                    console.warn(`  ❌ 失敗: ${error.message}`);

                    if (attempt < retryConfig.maxAttempts) {
                        console.log(`  ⏳ ${retryConfig.delayMs}ms 後重試...`);
                        await this.delay(retryConfig.delayMs);
                    }
                }
            }

            console.log(`❌ ${api.name} 全部 ${retryConfig.maxAttempts} 次嘗試失敗`);
        }

        // 所有 API 都失敗
        throw new Error(`所有語音識別 API 均失敗（共 ${totalRetries} 次嘗試）。最後錯誤: ${lastError?.message || '未知'}`);
    }


    // ========================================================================
    // 🔌 Whisper API (147/N1N)
    // ========================================================================

    async callWhisperApi(audioUrl, api, language) {
        // 1. 下載音頻
        console.log('  📥 下載音頻...');
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok) {
            throw new Error(`音頻下載失敗: ${audioResponse.status}`);
        }
        const audioBuffer = await audioResponse.buffer();

        // 2. 準備表單
        const formData = new FormData();
        formData.append('file', audioBuffer, {
            filename: 'audio.mp3',
            contentType: 'audio/mpeg'
        });
        formData.append('model', 'whisper-1');
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        
        if (language && language !== 'auto') {
            formData.append('language', language);
        }

        // 3. 發送請求
        console.log(`  🔄 發送到 ${api.name}...`);
        const response = await fetch(api.endpoint, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${api.apiKey}` },
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${api.name} 錯誤 ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const result = await response.json();

        // 4. 轉換格式
        return {
            text: result.text || '',
            words: (result.words || []).map(w => ({
                text: w.word,
                start: Math.round(w.start * 1000),  // 轉成毫秒
                end: Math.round(w.end * 1000)
            }))
        };
    }


    // ========================================================================
    // 🔌 AssemblyAI
    // ========================================================================

    async callAssemblyAI(audioUrl, apiKey, onProgress) {
        // 1. 提交轉錄任務
        console.log('  📤 提交到 AssemblyAI...');
        const submitResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio_url: audioUrl,
                language_detection: true
            })
        });

        if (!submitResponse.ok) {
            throw new Error(`AssemblyAI 提交失敗: ${submitResponse.status}`);
        }

        const { id: transcriptId } = await submitResponse.json();

        // 2. 輪詢等待結果
        console.log('  ⏳ 等待處理...');
        let result;
        let pollCount = 0;
        const maxPolls = 120; // 最多等 10 分鐘

        while (pollCount < maxPolls) {
            await this.delay(5000); // 每 5 秒查詢一次
            pollCount++;

            const pollResponse = await fetch(
                `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
                { headers: { 'Authorization': apiKey } }
            );

            result = await pollResponse.json();

            if (result.status === 'completed') {
                console.log('  ✅ AssemblyAI 處理完成');
                break;
            } else if (result.status === 'error') {
                throw new Error(`AssemblyAI 處理失敗: ${result.error}`);
            }

            // 每 30 秒回報一次進度
            if (pollCount % 6 === 0) {
                console.log(`  ⏳ 處理中... (${pollCount * 5}秒)`);
                if (onProgress) {
                    onProgress({ step: 'transcription', status: 'processing', seconds: pollCount * 5 });
                }
            }
        }

        if (!result || result.status !== 'completed') {
            throw new Error('AssemblyAI 處理超時（超過 10 分鐘）');
        }

        // 3. 回傳結果
        return {
            text: result.text || '',
            words: (result.words || []).map(w => ({
                text: w.text,
                start: w.start,  // AssemblyAI 已經是毫秒
                end: w.end
            }))
        };
    }


    // ========================================================================
    // 🛠️ 工具函數
    // ========================================================================

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 檢查 API 是否可用
     */
    checkApi(apiId) {
        const apis = this.getApiConfigs();
        const api = apis[apiId];
        
        if (!api) return { available: false, reason: 'API 不存在' };
        if (!api.apiKey) return { available: false, reason: 'API Key 未設定' };
        if (api.type === 'openai-whisper' && !api.endpoint) {
            return { available: false, reason: 'Endpoint 未設定' };
        }
        
        return { available: true, name: api.name };
    }
}

module.exports = TranscriptionService;
