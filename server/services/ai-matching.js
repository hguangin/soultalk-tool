/**
 * AI 智能匹配服務
 * 將歌詞/字幕與語音識別時間戳進行匹配
 * MV 模式：逐字匹配
 * 語音模式：逐行匹配
 */

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const configManager = require('./config-manager');

class AIMatchingService {
    constructor() {
        this.config = configManager.get('ai-models');
        this.promptsPath = path.join(__dirname, '../prompts');
    }
    
    /**
     * 取得 AI 模型配置
     */
    getModelConfig(modelId = null) {
        this.config = configManager.get('ai-models');
        
        const id = modelId || this.config.defaults.matching;
        const model = this.config.models.find(m => m.id === id);
        
        if (!model) {
            throw new Error(`找不到模型配置: ${id}`);
        }
        
        return model;
    }
    
    /**
     * 載入提示詞模板
     */
    loadPromptTemplate(mode) {
        const filename = mode === 'mv' ? 'mv-matching.txt' : 'audio-matching.txt';
        const filePath = path.join(this.promptsPath, filename);
        
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf8');
        }
        
        throw new Error(`找不到提示詞檔案: ${filename}`);
    }
    
    /**
     * 執行智能匹配
     */
    async match(options) {
        const {
            mode = 'mv',
            lyrics,
            transcriptionResult,
            modelId = null
        } = options;
        
        const model = this.getModelConfig(modelId);
        const promptTemplate = this.loadPromptTemplate(mode);
        
        console.log(`🤖 開始 AI 匹配...`);
        console.log(`   - 模式: ${mode}`);
        console.log(`   - 模型: ${model.name}`);
        console.log(`   - 歌詞行數: ${lyrics.split('\n').length}`);
        
        // 準備提示詞
        const prompt = promptTemplate
            .replace('[USER_LYRICS]', lyrics)
            .replace('[ASSEMBLY_JSON]', JSON.stringify(transcriptionResult.words, null, 2));
        
        try {
            const result = await this.callAI(model, prompt);
            const lyricsData = this.parseResult(result);
            
            console.log(`✅ AI 匹配完成，共 ${lyricsData.length} 行`);
            return lyricsData;
            
        } catch (error) {
            console.error(`❌ AI 匹配失敗:`, error.message);
            throw error;
        }
    }
    
    /**
     * 執行字幕校正
     */
    async correct(options) {
        const {
            currentLyrics,
            originalLyrics,
            modelId = null
        } = options;
        
        const model = this.getModelConfig(modelId || this.config.defaults.correction);
        
        // 載入校正提示詞
        const promptPath = path.join(this.promptsPath, 'correction.txt');
        let promptTemplate = fs.existsSync(promptPath) 
            ? fs.readFileSync(promptPath, 'utf8')
            : '';
        
        if (!promptTemplate) {
            throw new Error('找不到校正提示詞檔案');
        }
        
        const prompt = promptTemplate
            .replace('[CURRENT_LYRICS]', currentLyrics)
            .replace('[ORIGINAL_LYRICS]', originalLyrics);
        
        console.log(`🔧 開始字幕校正...`);
        console.log(`   - 模型: ${model.name}`);
        
        try {
            const result = await this.callAI(model, prompt);
            const lyricsData = this.parseResult(result);
            
            console.log(`✅ 字幕校正完成，共 ${lyricsData.length} 行`);
            return lyricsData;
            
        } catch (error) {
            console.error(`❌ 字幕校正失敗:`, error.message);
            throw error;
        }
    }
    
    /**
     * 呼叫 AI API
     */
    async callAI(model, prompt) {
        const body = {
            model: model.modelId || model.id,
            messages: [
                { role: 'user', content: prompt }
            ]
        };
        
        // 只在有設定時加入參數
        if (model.maxTokens) {
            body.max_tokens = model.maxTokens;
        }
        if (model.temperature !== null && model.temperature !== undefined) {
            body.temperature = model.temperature;
        }
        
        const response = await fetch(model.endpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${model.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`AI API 錯誤: ${response.status} - ${error}`);
        }
        
        const result = await response.json();
        return result.choices[0].message.content;
    }
    
    /**
     * 解析 AI 回傳的結果
     */
    parseResult(resultText) {
        try {
            // 清理回傳內容
            let cleaned = resultText
                .replace(/```javascript/g, '')
                .replace(/```json/g, '')
                .replace(/```/g, '')
                .trim();
            
            // 移除 const lyricsData = 開頭
            cleaned = cleaned.replace(/^const\s+lyricsData\s*=\s*/, '');
            
            // 移除結尾的分號
            cleaned = cleaned.replace(/;\s*$/, '');
            
            // 解析 JSON
            const data = JSON.parse(cleaned);
            
            if (!Array.isArray(data)) {
                throw new Error('結果不是陣列格式');
            }
            
            return data;
            
        } catch (error) {
            console.error('解析 AI 結果失敗:', error.message);
            console.error('原始內容:', resultText.substring(0, 500));
            throw new Error(`解析失敗: ${error.message}`);
        }
    }
}

module.exports = new AIMatchingService();
