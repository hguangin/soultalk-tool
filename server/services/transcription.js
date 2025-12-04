/**
 * 語音識別服務
 * 支援多個 API 提供者：AssemblyAI、OpenAI Whisper 等
 * MV 和語音模式分開處理
 */

const fetch = require('node-fetch');
const FormData = require('form-data');
const configManager = require('./config-manager');

class TranscriptionService {
    constructor() {
        this.config = configManager.get('transcription-apis');
        this.regionConfig = configManager.get('region-apis');
    }
    
    /**
     * 取得指定模式和地區的 API 配置
     */
    getApiConfig(mode, region = null) {
        // 重新載入設定
        this.config = configManager.get('transcription-apis');
        this.regionConfig = configManager.get('region-apis');
        
        // 根據地區決定使用哪個 API
        let apiId;
        if (region && this.regionConfig[mode]?.regions?.[region]) {
            apiId = this.regionConfig[mode].regions[region];
        } else {
            apiId = this.regionConfig[mode]?.default || this.config.defaults[mode];
        }
        
        // 找到對應的 API 配置
        const api = this.config.apis.find(a => a.id === apiId);
        if (!api) {
            throw new Error(`找不到 API 配置: ${apiId}`);
        }
        
        console.log(`🎤 使用 ${mode} 模式 API: ${api.name}${region ? ` (地區: ${region})` : ''}`);
        return api;
    }
    
    /**
     * 執行語音識別
     */
    async transcribe(audioUrl, options = {}) {
        const { mode = 'mv', region = null, language = null } = options;
        const api = this.getApiConfig(mode, region);
        
        console.log(`📡 開始語音識別...`);
        console.log(`   - 音頻: ${audioUrl.substring(0, 50)}...`);
        console.log(`   - API: ${api.name} (${api.type})`);
        
        try {
            let result;
            
            switch (api.type) {
                case 'assemblyai':
                    result = await this.transcribeWithAssemblyAI(audioUrl, api, language);
                    break;
                case 'openai-whisper':
                    result = await this.transcribeWithWhisper(audioUrl, api, language);
                    break;
                default:
                    throw new Error(`不支援的 API 類型: ${api.type}`);
            }
            
            console.log(`✅ 語音識別完成，共 ${result.words?.length || 0} 個詞`);
            return result;
            
        } catch (error) {
            console.error(`❌ 語音識別失敗:`, error.message);
            throw error;
        }
    }
    
    /**
     * AssemblyAI 語音識別
     */
    async transcribeWithAssemblyAI(audioUrl, api, language) {
        // 步驟 1: 提交轉錄任務
        const submitResponse = await fetch(`${api.endpoint}/transcript`, {
            method: 'POST',
            headers: {
                'Authorization': api.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                audio_url: audioUrl,
                language_code: language || 'zh',
                word_boost: [],
                boost_param: 'high'
            })
        });
        
        if (!submitResponse.ok) {
            const error = await submitResponse.text();
            throw new Error(`AssemblyAI 提交失敗: ${error}`);
        }
        
        const submitResult = await submitResponse.json();
        const transcriptId = submitResult.id;
        
        console.log(`   - 任務 ID: ${transcriptId}`);
        
        // 步驟 2: 輪詢等待完成
        let attempts = 0;
        const maxAttempts = 120; // 最多等待 10 分鐘
        
        while (attempts < maxAttempts) {
            await this.sleep(5000); // 每 5 秒檢查一次
            
            const statusResponse = await fetch(`${api.endpoint}/transcript/${transcriptId}`, {
                headers: { 'Authorization': api.apiKey }
            });
            
            const status = await statusResponse.json();
            
            if (status.status === 'completed') {
                return {
                    text: status.text,
                    words: status.words.map(w => ({
                        text: w.text,
                        start: w.start / 1000,
                        end: w.end / 1000,
                        confidence: w.confidence
                    })),
                    duration: status.audio_duration,
                    language: status.language_code
                };
            } else if (status.status === 'error') {
                throw new Error(`AssemblyAI 錯誤: ${status.error}`);
            }
            
            attempts++;
            console.log(`   - 等待中... (${attempts}/${maxAttempts})`);
        }
        
        throw new Error('AssemblyAI 超時');
    }
    
    /**
     * OpenAI Whisper 語音識別
     */
    async transcribeWithWhisper(audioUrl, api, language) {
        // 下載音頻檔案
        console.log(`   - 下載音頻檔案...`);
        const audioResponse = await fetch(audioUrl);
        const audioBuffer = await audioResponse.arrayBuffer();
        
        // 準備 FormData
        const formData = new FormData();
        formData.append('file', Buffer.from(audioBuffer), {
            filename: 'audio.mp3',
            contentType: 'audio/mpeg'
        });
        formData.append('model', api.model || 'whisper-1');
        formData.append('response_format', 'verbose_json');
        formData.append('timestamp_granularities[]', 'word');
        if (language) {
            formData.append('language', language);
        }
        
        // 發送請求
        const response = await fetch(api.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${api.apiKey}`
            },
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Whisper API 錯誤: ${error}`);
        }
        
        const result = await response.json();
        
        return {
            text: result.text,
            words: (result.words || []).map(w => ({
                text: w.word,
                start: w.start,
                end: w.end
            })),
            duration: result.duration,
            language: result.language
        };
    }
    
    /**
     * 輔助函數：等待
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new TranscriptionService();
