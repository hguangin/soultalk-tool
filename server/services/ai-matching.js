/**
 * ============================================================================
 * 🤖 AI 匹配服務 (ai-matching.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    用 AI (Gemini) 把歌詞/字幕對到正確的時間點。
 *    支援多個 API：147 Gemini、N1N Gemini、Google Gemini
 *    會自動重試，失敗時自動切換備用。
 * 
 * 🔧 提示詞怎麼改？
 *    在設定頁面的「提示詞」分類：
 *    - prompt_mv: MV 模式用的提示詞
 *    - prompt_audio: 語音模式用的提示詞
 *    - prompt_correction: 校正用的提示詞
 * 
 *    可用變數：
 *    - [USER_LYRICS]: 會被替換成用戶的歌詞
 *    - [ASSEMBLY_JSON]: 會被替換成語音識別的時間戳
 *    - [CURRENT_LYRICS]: 現有的字幕數據（校正用）
 *    - [ORIGINAL_LYRICS]: 原始歌詞（校正用）
 * 
 * ============================================================================
 */

const fetch = require('node-fetch');

class AIMatchingService {
    constructor(db) {
        this.db = db;
    }

    // ========================================================================
    // 📖 讀取設定
    // ========================================================================

    getApiConfigs() {
        return {
            gemini147: {
                id: 'gemini147',
                name: '147 Gemini',
                type: 'openai',  // OpenAI 相容格式
                endpoint: this.db.settings.get('api_gemini147_endpoint'),
                apiKey: this.db.settings.get('api_gemini147_key'),
                model: this.db.settings.get('api_gemini147_model') || 'gemini-2.5-pro',
                maxTokens: parseInt(this.db.settings.get('api_gemini147_max_tokens')) || 1000000,
            },
            geminiN1N: {
                id: 'geminiN1N',
                name: 'N1N Gemini',
                type: 'openai',
                endpoint: this.db.settings.get('api_geminiN1N_endpoint'),
                apiKey: this.db.settings.get('api_geminiN1N_key'),
                model: this.db.settings.get('api_geminiN1N_model') || 'gemini-2.5-pro',
                maxTokens: parseInt(this.db.settings.get('api_geminiN1N_max_tokens')) || 1000000,
            },
            geminiGoogle: {
                id: 'geminiGoogle',
                name: 'Google Gemini',
                type: 'google',  // Google 原生格式
                apiKey: this.db.settings.get('api_geminiGoogle_key'),
                model: this.db.settings.get('api_geminiGoogle_model') || 'gemini-2.0-flash-exp',
                maxTokens: 500000,
            }
        };
    }

    getRetryConfig() {
        return {
            maxAttempts: parseInt(this.db.settings.get('retry_max_attempts')) || 3,
            delayMs: parseInt(this.db.settings.get('retry_delay_ms')) || 2000,
            apiOrder: (this.db.settings.get('retry_ai_order') || 'gemini147,geminiN1N,geminiGoogle')
                .split(',').map(s => s.trim())
        };
    }

    getPrompt(type) {
        return this.db.settings.get(`prompt_${type}`) || '';
    }


    // ========================================================================
    // 🤖 主要函數：AI 匹配
    // ========================================================================

    /**
     * 執行 AI 時間軸匹配
     * 
     * @param {Array} words - 語音識別的詞列表 [{ text, start, end }, ...]
     * @param {string} lyrics - 用戶的歌詞/字幕
     * @param {string} mode - 模式：mv 或 audio
     * @param {Object} options - 選項
     *   - preferredApi: 優先使用的 API
     *   - onProgress: 進度回報
     * 
     * @returns {Object} { success, api, code, data }
     *   - code: AI 回傳的原始代碼
     *   - data: 解析後的陣列
     */
    async match(words, lyrics, mode = 'mv', options = {}) {
        const { preferredApi, onProgress } = options;
        
        const apis = this.getApiConfigs();
        const retryConfig = this.getRetryConfig();
        
        // 決定 API 順序
        let apiOrder = [...retryConfig.apiOrder];
        if (preferredApi && apis[preferredApi]) {
            apiOrder = [preferredApi, ...apiOrder.filter(id => id !== preferredApi)];
        }

        // 建立提示詞
        const promptTemplate = this.getPrompt(mode);
        const prompt = this.buildPrompt(promptTemplate, words, lyrics);

        let lastError = null;
        let totalRetries = 0;

        for (const apiId of apiOrder) {
            const api = apis[apiId];
            
            if (!api || !api.apiKey) {
                console.log(`⏭️ ${apiId} 未設定，跳過`);
                continue;
            }

            console.log(`🤖 嘗試 ${api.name}...`);
            if (onProgress) onProgress({ step: 'ai-matching', api: api.name, status: 'started' });

            for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
                try {
                    console.log(`  第 ${attempt}/${retryConfig.maxAttempts} 次嘗試`);
                    
                    // 呼叫 API
                    let rawCode;
                    if (api.type === 'google') {
                        rawCode = await this.callGoogleGemini(prompt, api);
                    } else {
                        rawCode = await this.callOpenAIFormat(prompt, api);
                    }

                    // 解析並驗證
                    const parsed = this.parseAndValidate(rawCode, mode);
                    
                    console.log(`✅ ${api.name} 成功！共 ${parsed.length} 行`);
                    
                    return {
                        success: true,
                        api: api.name,
                        apiId: api.id,
                        code: rawCode,
                        data: parsed,
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

            console.log(`❌ ${api.name} 全部嘗試失敗`);
        }

        throw new Error(`所有 AI API 均失敗（共 ${totalRetries} 次）。最後錯誤: ${lastError?.message || '未知'}`);
    }


    // ========================================================================
    // 🔧 AI 校正
    // ========================================================================

    /**
     * AI 校正字幕時間
     * 
     * @param {Array|string} lyricsData - 現有字幕數據
     * @param {string} originalLyrics - 原始歌詞
     */
    async correct(lyricsData, originalLyrics, options = {}) {
        const { preferredApi } = options;
        
        const apis = this.getApiConfigs();
        const defaultApi = preferredApi || this.db.settings.get('default_correction_api') || 'gemini147';
        const api = apis[defaultApi];

        if (!api || !api.apiKey) {
            console.warn('⚠️ 校正 API 未設定，跳過校正');
            return { success: false, reason: 'API 未設定', data: lyricsData };
        }

        // 建立校正提示詞
        const promptTemplate = this.getPrompt('correction');
        const currentCode = Array.isArray(lyricsData) 
            ? `const lyricsData = ${JSON.stringify(lyricsData, null, 2)};`
            : lyricsData;
        
        const prompt = promptTemplate
            .replace('[CURRENT_LYRICS]', currentCode)
            .replace('[ORIGINAL_LYRICS]', originalLyrics);

        try {
            console.log(`🔧 使用 ${api.name} 進行校正...`);
            
            let rawCode;
            if (api.type === 'google') {
                rawCode = await this.callGoogleGemini(prompt, api);
            } else {
                rawCode = await this.callOpenAIFormat(prompt, api);
            }

            const parsed = this.parseAndValidate(rawCode, 'mv');
            console.log(`✅ 校正成功！`);
            
            return { success: true, api: api.name, code: rawCode, data: parsed };

        } catch (error) {
            console.warn('⚠️ 校正失敗，使用原始數據:', error.message);
            return { 
                success: false, 
                reason: error.message, 
                data: Array.isArray(lyricsData) ? lyricsData : null 
            };
        }
    }


    // ========================================================================
    // 🔌 API 呼叫
    // ========================================================================

    /**
     * 呼叫 OpenAI 相容格式的 API (147/N1N)
     */
    async callOpenAIFormat(prompt, api) {
        const response = await fetch(api.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${api.apiKey}`
            },
            body: JSON.stringify({
                model: api.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: api.maxTokens,
                temperature: 0.3
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`${api.name} 錯誤 ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        if (!data.choices?.[0]?.message?.content) {
            throw new Error('API 返回空結果');
        }

        if (data.choices[0].finish_reason === 'length') {
            throw new Error('輸出被截斷（超過 token 限制）');
        }

        return data.choices[0].message.content;
    }

    /**
     * 呼叫 Google Gemini API
     */
    async callGoogleGemini(prompt, api) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${api.model}:generateContent?key=${api.apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: api.maxTokens,
                    temperature: 0.3
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Google Gemini 錯誤 ${response.status}: ${errorText.substring(0, 200)}`);
        }

        const data = await response.json();
        
        if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Google Gemini 返回空結果');
        }

        return data.candidates[0].content.parts[0].text;
    }


    // ========================================================================
    // 🛠️ 工具函數
    // ========================================================================

    /**
     * 建立提示詞
     */
    buildPrompt(template, words, lyrics) {
        // 限制 words 數量避免太長
        const wordsJson = JSON.stringify(words.slice(0, 500), null, 0);
        
        return template
            .replace('[USER_LYRICS]', lyrics)
            .replace('[ASSEMBLY_JSON]', wordsJson);
    }

    /**
     * 解析並驗證 AI 回傳的代碼
     */
    parseAndValidate(code, mode) {
        // 清理 markdown 標記
        let cleanCode = code
            .replace(/```(?:javascript)?\s*/g, '')
            .replace(/```\s*/g, '')
            .trim();

        // 提取 lyricsData
        const match = cleanCode.match(/const\s+lyricsData\s*=\s*(\[[\s\S]*?\]);?\s*$/);
        if (!match) {
            throw new Error('無法解析 lyricsData 格式');
        }

        // 解析為陣列
        let data;
        try {
            data = JSON.parse(match[1]);
        } catch {
            try {
                // eslint-disable-next-line no-eval
                data = eval(match[1]);
            } catch (e) {
                throw new Error(`代碼解析失敗: ${e.message}`);
            }
        }

        // 驗證格式
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('結果不是有效的陣列');
        }

        for (const item of data) {
            if (!item.line || item.start === undefined) {
                throw new Error('格式錯誤：缺少 line 或 start');
            }
        }

        return data;
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AIMatchingService;
