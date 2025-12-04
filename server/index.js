/**
 * SoulTalk Tool v2.0 - 主伺服器
 * 模組化架構，支援 MV 和語音兩種模式
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 服務
const configManager = require('./services/config-manager');
const transcriptionService = require('./services/transcription');
const aiMatchingService = require('./services/ai-matching');
const ragicClient = require('./integrations/ragic/client');
const notificationManager = require('./notifications/manager');
const logService = require('./services/log-service');
const { 
    AppError, 
    APIError, 
    TranscriptionError, 
    AIMatchingError, 
    RagicError,
    ConfigError,
    ValidationError,
    asyncHandler, 
    parseAPIError, 
    errorHandler,
    formatErrorForDisplay 
} = require('./services/error-handler');

const app = express();
const PORT = process.env.PORT || 8080;

// 中間件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// 請求日誌中間件
app.use((req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'debug';
        
        logService.log(level, 'api', `${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ip: req.ip
        });
    });
    
    next();
});

// 啟動日誌
logService.info('system', '🚀 SoulTalk Tool v2.0 正在啟動...', {
    port: PORT,
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
});

// ==================== 設定 API ====================

/**
 * 取得所有設定
 */
app.get('/api/config', (req, res) => {
    try {
        const configs = {};
        const configNames = configManager.listConfigs();
        
        configNames.forEach(name => {
            configs[name] = configManager.get(name);
        });
        
        res.json({ success: true, configs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得單一設定
 */
app.get('/api/config/:name', (req, res) => {
    try {
        const config = configManager.get(req.params.name);
        res.json({ success: true, config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 更新設定
 */
app.post('/api/config/:name', (req, res) => {
    try {
        const success = configManager.save(req.params.name, req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 重新載入所有設定
 */
app.post('/api/config/reload', (req, res) => {
    try {
        configManager.reloadAll();
        res.json({ success: true, message: '所有設定已重新載入' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== MV 模式 API ====================

/**
 * MV 模式 - 從 Ragic 載入資料
 */
app.get('/api/mv/fetch/:code', async (req, res) => {
    const code = req.params.code;
    
    logService.info('ragic', `開始載入 MV 資料: ${code}`);
    
    try {
        const data = await ragicClient.fetchByCode(code, 'mv');
        
        logService.info('ragic', `MV 資料載入成功: ${code}`, {
            hasLyrics: !!data.lyrics,
            hasMusicUrl: !!data.musicUrl,
            imageCount: data.images?.length || 0
        });
        
        res.json({ success: true, data });
    } catch (error) {
        logService.error('ragic', `MV 資料載入失敗: ${code}`, {
            error: error.message,
            stack: error.stack,
            code
        });
        
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'RAGIC_FETCH_ERROR',
                message: `載入 MV 資料失敗: ${error.message}`,
                details: {
                    ragicCode: code,
                    originalError: error.message
                },
                suggestions: [
                    '檢查 Ragic 代碼是否正確',
                    '確認 Ragic 連線設定',
                    '檢查 N8N Webhook 是否正常'
                ]
            }
        });
    }
});

/**
 * MV 模式 - 語音識別
 */
app.post('/api/mv/transcribe', async (req, res) => {
    const { audioUrl, region } = req.body;
    
    logService.info('transcription', `開始 MV 語音識別`, { audioUrl, region });
    
    try {
        // 驗證輸入
        if (!audioUrl) {
            throw new ValidationError('缺少音頻 URL', {
                field: 'audioUrl',
                code: 'VALIDATION_REQUIRED'
            });
        }
        
        const result = await transcriptionService.transcribe(audioUrl, {
            mode: 'mv',
            region
        });
        
        logService.info('transcription', `MV 語音識別完成`, {
            wordCount: result.words?.length || 0,
            duration: result.duration
        });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logService.error('transcription', `MV 語音識別失敗`, {
            error: error.message,
            stack: error.stack,
            audioUrl,
            region
        });
        
        // 判斷錯誤類型並提供詳細資訊
        let errorResponse = {
            code: error.code || 'TRANSCRIPTION_ERROR',
            message: `語音識別失敗: ${error.message}`,
            details: {
                audioUrl,
                region,
                originalError: error.message
            },
            suggestions: []
        };
        
        // 根據錯誤類型添加建議
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorResponse.code = 'TRANSCRIPTION_AUTH_ERROR';
            errorResponse.suggestions = [
                'API Key 可能無效或已過期',
                '請在設定頁面檢查語音識別 API 設定',
                '確認 API Key 有正確的權限'
            ];
        } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
            errorResponse.code = 'TRANSCRIPTION_TIMEOUT';
            errorResponse.suggestions = [
                '音頻檔案可能太大',
                '網路連線可能不穩定',
                '請稍後再試'
            ];
        } else if (error.message.includes('404') || error.message.includes('not found')) {
            errorResponse.code = 'TRANSCRIPTION_AUDIO_NOT_FOUND';
            errorResponse.suggestions = [
                '音頻 URL 可能無效',
                '檢查音頻連結是否正確',
                '確認音頻檔案是否存在'
            ];
        } else {
            errorResponse.suggestions = [
                '檢查音頻格式是否支援 (MP3, WAV, M4A)',
                '確認網路連線正常',
                '嘗試使用其他語音識別 API'
            ];
        }
        
        res.status(500).json({ success: false, error: errorResponse });
    }
});

/**
 * MV 模式 - AI 匹配
 */
app.post('/api/mv/match', async (req, res) => {
    const { lyrics, transcription, modelId } = req.body;
    
    logService.info('ai-matching', `開始 MV AI 匹配`, { 
        modelId,
        lyricsLength: lyrics?.length,
        wordCount: transcription?.words?.length
    });
    
    try {
        // 驗證輸入
        if (!lyrics) {
            throw new ValidationError('缺少歌詞', {
                field: 'lyrics',
                code: 'VALIDATION_REQUIRED'
            });
        }
        
        if (!transcription || !transcription.words) {
            throw new ValidationError('缺少語音識別結果', {
                field: 'transcription',
                code: 'VALIDATION_REQUIRED',
                suggestions: ['請先執行語音識別']
            });
        }
        
        const result = await aiMatchingService.match({
            mode: 'mv',
            lyrics,
            transcription,
            modelId
        });
        
        logService.info('ai-matching', `MV AI 匹配完成`, {
            lineCount: result?.length || 0
        });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logService.error('ai-matching', `MV AI 匹配失敗`, {
            error: error.message,
            stack: error.stack,
            modelId
        });
        
        let errorResponse = {
            code: error.code || 'AI_MATCHING_ERROR',
            message: `AI 匹配失敗: ${error.message}`,
            details: {
                modelId,
                originalError: error.message
            },
            suggestions: []
        };
        
        if (error.message.includes('parse') || error.message.includes('JSON')) {
            errorResponse.code = 'AI_MATCHING_PARSE_ERROR';
            errorResponse.message = 'AI 回應格式解析失敗';
            errorResponse.suggestions = [
                'AI 模型回傳的格式可能有問題',
                '嘗試使用其他 AI 模型',
                '檢查歌詞格式是否正確'
            ];
        } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorResponse.code = 'AI_AUTH_ERROR';
            errorResponse.suggestions = [
                'AI 模型 API Key 可能無效',
                '請在設定頁面檢查 AI 模型設定'
            ];
        } else if (error.message.includes('rate') || error.message.includes('429')) {
            errorResponse.code = 'AI_RATE_LIMITED';
            errorResponse.suggestions = [
                'API 請求頻率超過限制',
                '請稍後再試',
                '考慮升級 API 方案'
            ];
        } else {
            errorResponse.suggestions = [
                '檢查 AI 模型設定',
                '嘗試使用其他模型',
                '檢查歌詞和識別結果是否正確'
            ];
        }
        
        res.status(500).json({ success: false, error: errorResponse });
    }
});

/**
 * MV 模式 - 上傳 JSON
 */
app.post('/api/mv/upload', async (req, res) => {
    const { code, json } = req.body;
    
    logService.info('ragic', `開始上傳 MV JSON: ${code}`);
    
    try {
        const result = await ragicClient.uploadJson({
            code,
            mode: 'mv',
            jsonData: json
        });
        
        // 發送通知
        try {
            await notificationManager.notifyJobComplete({
                title: json.title || '未命名',
                mode: 'mv',
                ragicCode: code
            });
        } catch (notifyError) {
            logService.warn('notification', '通知發送失敗', { error: notifyError.message });
        }
        
        logService.info('ragic', `MV JSON 上傳成功: ${code}`);
        
        res.json({ success: true, result });
    } catch (error) {
        logService.error('ragic', `MV JSON 上傳失敗: ${code}`, {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'RAGIC_UPLOAD_ERROR',
                message: `上傳失敗: ${error.message}`,
                details: { code },
                suggestions: [
                    '檢查 Ragic 連線設定',
                    '確認有寫入權限',
                    '檢查 N8N Webhook 是否正常'
                ]
            }
        });
    }
});

// ==================== 語音模式 API ====================

/**
 * 語音模式 - 從 Ragic 載入資料
 */
app.get('/api/audio/fetch/:code', async (req, res) => {
    const code = req.params.code;
    
    logService.info('ragic', `開始載入語音資料: ${code}`);
    
    try {
        const data = await ragicClient.fetchByCode(code, 'audio');
        
        logService.info('ragic', `語音資料載入成功: ${code}`, {
            hasTranscript: !!data.transcript,
            hasAudioUrl: !!data.audioUrl,
            imageCount: data.images?.length || 0
        });
        
        res.json({ success: true, data });
    } catch (error) {
        logService.error('ragic', `語音資料載入失敗: ${code}`, {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'RAGIC_FETCH_ERROR',
                message: `載入語音資料失敗: ${error.message}`,
                details: {
                    ragicCode: code,
                    originalError: error.message
                },
                suggestions: [
                    '檢查 Ragic 代碼是否正確',
                    '確認 Ragic 連線設定',
                    '檢查 N8N Webhook 是否正常'
                ]
            }
        });
    }
});

/**
 * 語音模式 - 語音識別
 */
app.post('/api/audio/transcribe', async (req, res) => {
    const { audioUrl, region } = req.body;
    
    logService.info('transcription', `開始語音識別`, { audioUrl, region });
    
    try {
        if (!audioUrl) {
            throw new ValidationError('缺少音頻 URL', {
                field: 'audioUrl',
                code: 'VALIDATION_REQUIRED'
            });
        }
        
        const result = await transcriptionService.transcribe(audioUrl, {
            mode: 'audio',
            region
        });
        
        logService.info('transcription', `語音識別完成`, {
            duration: result.duration,
            textLength: result.text?.length
        });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logService.error('transcription', `語音識別失敗`, {
            error: error.message,
            stack: error.stack,
            audioUrl,
            region
        });
        
        let errorResponse = {
            code: error.code || 'TRANSCRIPTION_ERROR',
            message: `語音識別失敗: ${error.message}`,
            details: {
                audioUrl,
                region,
                originalError: error.message
            },
            suggestions: []
        };
        
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorResponse.code = 'TRANSCRIPTION_AUTH_ERROR';
            errorResponse.suggestions = [
                'API Key 可能無效或已過期',
                '請在設定頁面檢查語音識別 API 設定'
            ];
        } else if (error.message.includes('timeout')) {
            errorResponse.code = 'TRANSCRIPTION_TIMEOUT';
            errorResponse.suggestions = [
                '音頻檔案可能太大',
                '網路連線可能不穩定',
                '請稍後再試'
            ];
        } else {
            errorResponse.suggestions = [
                '檢查音頻格式是否支援',
                '確認網路連線正常',
                '嘗試使用其他語音識別 API'
            ];
        }
        
        res.status(500).json({ success: false, error: errorResponse });
    }
});

/**
 * 語音模式 - AI 分行匹配
 */
app.post('/api/audio/match', async (req, res) => {
    const { text, transcription, modelId, minChars, maxChars } = req.body;
    
    logService.info('ai-matching', `開始語音 AI 分行`, { 
        modelId,
        textLength: text?.length,
        minChars,
        maxChars
    });
    
    try {
        if (!text) {
            throw new ValidationError('缺少文字稿', {
                field: 'text',
                code: 'VALIDATION_REQUIRED'
            });
        }
        
        if (!transcription) {
            throw new ValidationError('缺少語音識別結果', {
                field: 'transcription',
                code: 'VALIDATION_REQUIRED',
                suggestions: ['請先執行語音識別']
            });
        }
        
        const result = await aiMatchingService.match({
            mode: 'audio',
            text,
            transcription,
            modelId,
            options: { minChars, maxChars }
        });
        
        logService.info('ai-matching', `語音 AI 分行完成`, {
            lineCount: result?.length || 0
        });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logService.error('ai-matching', `語音 AI 分行失敗`, {
            error: error.message,
            stack: error.stack,
            modelId
        });
        
        let errorResponse = {
            code: error.code || 'AI_MATCHING_ERROR',
            message: `AI 分行失敗: ${error.message}`,
            details: {
                modelId,
                originalError: error.message
            },
            suggestions: []
        };
        
        if (error.message.includes('parse') || error.message.includes('JSON')) {
            errorResponse.code = 'AI_MATCHING_PARSE_ERROR';
            errorResponse.suggestions = [
                'AI 模型回傳的格式可能有問題',
                '嘗試使用其他 AI 模型'
            ];
        } else if (error.message.includes('401')) {
            errorResponse.code = 'AI_AUTH_ERROR';
            errorResponse.suggestions = [
                'AI 模型 API Key 可能無效',
                '請在設定頁面檢查 AI 模型設定'
            ];
        } else {
            errorResponse.suggestions = [
                '檢查 AI 模型設定',
                '嘗試使用其他模型',
                '檢查文字稿格式是否正確'
            ];
        }
        
        res.status(500).json({ success: false, error: errorResponse });
    }
});

/**
 * 語音模式 - 上傳 JSON
 */
app.post('/api/audio/upload', async (req, res) => {
    const { code, json } = req.body;
    
    logService.info('ragic', `開始上傳語音 JSON: ${code}`);
    
    try {
        const result = await ragicClient.uploadJson({
            code,
            mode: 'audio',
            jsonData: json
        });
        
        // 發送通知
        try {
            await notificationManager.notifyJobComplete({
                title: json.title || '未命名',
                mode: 'audio',
                ragicCode: code
            });
        } catch (notifyError) {
            logService.warn('notification', '通知發送失敗', { error: notifyError.message });
        }
        
        logService.info('ragic', `語音 JSON 上傳成功: ${code}`);
        
        res.json({ success: true, result });
    } catch (error) {
        logService.error('ragic', `語音 JSON 上傳失敗: ${code}`, {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({ 
            success: false, 
            error: {
                code: 'RAGIC_UPLOAD_ERROR',
                message: `上傳失敗: ${error.message}`,
                details: { code },
                suggestions: [
                    '檢查 Ragic 連線設定',
                    '確認有寫入權限'
                ]
            }
        });
    }
});

// ==================== 共用 API ====================

/**
 * 字幕校正
 */
app.post('/api/correct', async (req, res) => {
    const { subtitles, mode, modelId } = req.body;
    
    logService.info('ai-matching', `開始字幕校正`, { mode, modelId, lineCount: subtitles?.length });
    
    try {
        if (!subtitles || subtitles.length === 0) {
            throw new ValidationError('缺少字幕資料', {
                field: 'subtitles',
                code: 'VALIDATION_REQUIRED'
            });
        }
        
        const result = await aiMatchingService.correct({
            subtitles,
            mode,
            modelId
        });
        
        logService.info('ai-matching', `字幕校正完成`, { lineCount: result?.length });
        
        res.json({ success: true, data: result });
    } catch (error) {
        logService.error('ai-matching', `字幕校正失敗`, {
            error: error.message,
            stack: error.stack,
            mode,
            modelId
        });
        
        res.status(500).json({ 
            success: false, 
            error: {
                code: error.code || 'CORRECTION_ERROR',
                message: `校正失敗: ${error.message}`,
                details: { mode, modelId },
                suggestions: [
                    '檢查 AI 模型設定',
                    '嘗試使用其他模型'
                ]
            }
        });
    }
});

/**
 * 測試通知
 */
app.post('/api/notify/test', async (req, res) => {
    try {
        const { channel, message } = req.body;
        
        const results = await notificationManager.send('test', {
            message: message || '這是測試通知'
        });
        
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 健康檢查
 */
app.get('/api/health', (req, res) => {
    const stats = logService.getStats();
    
    res.json({
        success: true,
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        configs: configManager.listConfigs(),
        logs: {
            total: stats.total,
            errors: stats.byLevel?.error || 0,
            warnings: stats.byLevel?.warn || 0
        }
    });
});

// ==================== 日誌 API ====================

/**
 * 查詢日誌
 */
app.get('/api/logs', (req, res) => {
    try {
        const { level, category, keyword, since, until, limit, date } = req.query;
        
        let logs;
        
        // 如果指定日期，從檔案讀取
        if (date) {
            logs = logService.readHistoryLogs(date);
        } else {
            // 否則從記憶體查詢
            logs = logService.query({
                level: level ? level.split(',') : undefined,
                category: category ? category.split(',') : undefined,
                keyword,
                since,
                until,
                limit: parseInt(limit) || 100
            });
        }
        
        const stats = logService.getStats();
        
        res.json({ 
            success: true, 
            logs,
            stats,
            count: logs.length
        });
    } catch (error) {
        logService.error('api', '查詢日誌失敗', { error: error.message });
        res.status(500).json({ 
            success: false, 
            error: {
                message: error.message,
                code: 'LOG_QUERY_ERROR'
            }
        });
    }
});

/**
 * 取得可用的日誌日期
 */
app.get('/api/logs/dates', (req, res) => {
    try {
        const dates = logService.getAvailableDates();
        res.json({ success: true, dates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得日誌統計
 */
app.get('/api/logs/stats', (req, res) => {
    try {
        const stats = logService.getStats();
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 清理舊日誌
 */
app.post('/api/logs/clean', (req, res) => {
    try {
        logService.cleanOldLogs();
        logService.info('system', '日誌清理完成');
        res.json({ success: true, message: '舊日誌已清理' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== 匯出/匯入 API ====================

/**
 * 匯出所有設定為 JSON
 */
app.get('/api/export/json', (req, res) => {
    try {
        const exportData = configManager.exportAll();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="soultalk-settings-' + 
            new Date().toISOString().slice(0, 10) + '.json"');
        res.json(exportData);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 匯出所有設定為獨立 HTML 檔案（保留原版功能）
 */
app.get('/api/export/html', async (req, res) => {
    try {
        const exportData = configManager.exportAll();
        const html = generateStandaloneHtml(exportData);
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="SoulTalk-Tool-V2-' + 
            new Date().toISOString().slice(0, 10) + '.html"');
        res.send(html);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 匯入設定（從 JSON）
 */
app.post('/api/import/json', (req, res) => {
    try {
        const results = configManager.importAll(req.body);
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得備份列表
 */
app.get('/api/backups', (req, res) => {
    try {
        const backups = configManager.listBackups();
        res.json({ success: true, backups });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 從備份還原
 */
app.post('/api/backups/restore', (req, res) => {
    try {
        const { filename } = req.body;
        const result = configManager.restoreFromBackup(filename);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 生成獨立 HTML 檔案（包含所有設定和功能）
 */
function generateStandaloneHtml(exportData) {
    const configs = exportData.configs;
    
    // 提取各種設定
    const transcriptionApis = configs['transcription-apis']?.apis || [];
    const aiModels = configs['ai-models']?.models || [];
    const regionApis = configs['region-apis'] || {};
    const ragicConfig = configs['ragic'] || {};
    const subtitleStyles = configs['subtitle-styles']?.subtitle || {};
    const titleStylesMV = configs['subtitle-styles']?.titleMV || {};
    const titleStylesAudio = configs['subtitle-styles']?.titleAudio || {};
    const slideshowSettings = configs['slideshow-settings']?.slideshow || {};
    const imageWeights = configs['slideshow-settings']?.imageWeights || {};
    const imageClassify = configs['slideshow-settings']?.imageClassify || {};
    const background = configs['slideshow-settings']?.background || {};
    const customColorPresets = configs['slideshow-settings']?.customColorPresets || {};
    const subtitleRules = configs['subtitle-rules'] || {};
    
    // 讀取提示詞
    const fs = require('fs');
    const path = require('path');
    let mvPrompt = '', audioPrompt = '', correctionPrompt = '';
    try {
        mvPrompt = fs.readFileSync(path.join(__dirname, 'prompts/mv-matching.txt'), 'utf8');
        audioPrompt = fs.readFileSync(path.join(__dirname, 'prompts/audio-matching.txt'), 'utf8');
        correctionPrompt = fs.readFileSync(path.join(__dirname, 'prompts/correction.txt'), 'utf8');
    } catch (e) {}
    
    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SoulTalk Tool V2.0 - 設定備份</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Noto Sans TC', sans-serif; background: #1a1a2e; color: #fff; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { margin-bottom: 20px; }
        .section { background: rgba(255,255,255,0.05); border-radius: 10px; padding: 20px; margin-bottom: 20px; }
        .section h2 { margin-bottom: 15px; font-size: 18px; color: #667eea; }
        pre { background: #000; padding: 15px; border-radius: 5px; overflow: auto; font-size: 12px; }
        .btn { padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px; }
        .btn-primary { background: #667eea; color: #fff; }
        .btn-success { background: #4caf50; color: #fff; }
        .info { background: rgba(33,150,243,0.2); padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎵 SoulTalk Tool V2.0 - 設定備份</h1>
        
        <div class="info">
            <p><strong>匯出時間：</strong>${exportData._exportTime}</p>
            <p><strong>設定數量：</strong>${exportData._configCount} 個設定檔</p>
            <p><strong>用途：</strong>這個檔案包含你所有的設定，可用於備份或還原</p>
        </div>
        
        <div class="section">
            <h2>🔑 語音識別 API (${transcriptionApis.length} 個)</h2>
            <pre>${JSON.stringify(transcriptionApis.map(a => ({ id: a.id, name: a.name, type: a.type })), null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>🤖 AI 模型 (${aiModels.length} 個)</h2>
            <pre>${JSON.stringify(aiModels.map(m => ({ id: m.id, name: m.name, modelId: m.modelId })), null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>🌏 地區 API 設定</h2>
            <pre>${JSON.stringify(regionApis, null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>📊 Ragic 設定</h2>
            <pre>${JSON.stringify({
                baseUrl: ragicConfig.connection?.baseUrl,
                account: ragicConfig.connection?.account,
                n8nWebhook: ragicConfig.n8nWebhook
            }, null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>🎨 字幕樣式</h2>
            <pre>${JSON.stringify(subtitleStyles, null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>🖼️ 輪播設定</h2>
            <pre>${JSON.stringify({ slideshowSettings, imageWeights, background }, null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>🎨 自訂色組</h2>
            <pre>${JSON.stringify(customColorPresets, null, 2)}</pre>
        </div>
        
        <div class="section">
            <h2>📐 計算規則</h2>
            <pre>${JSON.stringify(subtitleRules, null, 2)}</pre>
        </div>
        
        <hr style="margin: 30px 0; border-color: rgba(255,255,255,0.1);">
        
        <h2 style="margin-bottom: 15px;">📦 完整設定 JSON（用於還原）</h2>
        <p style="margin-bottom: 10px; color: rgba(255,255,255,0.6);">複製以下內容，在設定頁面的「匯入設定」功能中貼上即可還原</p>
        <pre id="fullJson" style="max-height: 300px;">${JSON.stringify(exportData, null, 2)}</pre>
        
        <div style="margin-top: 20px;">
            <button class="btn btn-primary" onclick="copyJson()">📋 複製 JSON</button>
            <button class="btn btn-success" onclick="downloadJson()">💾 下載 JSON 檔案</button>
        </div>
    </div>
    
    <script>
        // 完整設定資料
        const EXPORT_DATA = ${JSON.stringify(exportData)};
        
        // 語音識別 API
        const DEFAULT_TRANSCRIPTION_APIS = ${JSON.stringify(transcriptionApis)};
        
        // AI 模型
        const DEFAULT_MODELS = ${JSON.stringify(aiModels)};
        
        // 地區設定
        const REGION_API_SETTINGS = ${JSON.stringify(regionApis)};
        
        // Ragic 設定
        const RAGIC_CONFIG = ${JSON.stringify(ragicConfig)};
        
        // 字幕樣式
        let subtitleStyles = ${JSON.stringify(subtitleStyles)};
        let titleStyles = ${JSON.stringify({ mv: titleStylesMV, audio: titleStylesAudio })};
        
        // 輪播設定
        let slideshowSettings = ${JSON.stringify(slideshowSettings)};
        let imageClassifySettings = ${JSON.stringify(imageClassify)};
        let customColorPresets = ${JSON.stringify(customColorPresets)};
        
        // 計算規則
        const SUBTITLE_RULES = ${JSON.stringify(subtitleRules)};
        
        // 提示詞
        const DEFAULT_MV_PROMPT = ${JSON.stringify(mvPrompt)};
        const DEFAULT_AUDIO_PROMPT = ${JSON.stringify(audioPrompt)};
        const DEFAULT_CORRECTION_PROMPT = ${JSON.stringify(correctionPrompt)};
        
        // 複製 JSON
        function copyJson() {
            const json = document.getElementById('fullJson').textContent;
            navigator.clipboard.writeText(json).then(() => {
                alert('✅ 已複製到剪貼簿！');
            });
        }
        
        // 下載 JSON
        function downloadJson() {
            const blob = new Blob([JSON.stringify(EXPORT_DATA, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'soultalk-settings-${new Date().toISOString().slice(0, 10)}.json';
            a.click();
            URL.revokeObjectURL(url);
        }
        
        console.log('✅ SoulTalk Tool V2.0 設定備份已載入');
        console.log('📊 設定數量:', Object.keys(EXPORT_DATA.configs).length);
    </script>
</body>
</html>`;
}

// ==================== 啟動伺服器 ====================

// 全域錯誤處理中間件
app.use((err, req, res, next) => {
    logService.error('system', `未捕捉的錯誤: ${err.message}`, {
        method: req.method,
        url: req.url,
        stack: err.stack,
        body: req.body
    });
    
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: '伺服器內部錯誤',
            details: {
                originalMessage: err.message,
                path: req.path
            },
            suggestions: [
                '請稍後再試',
                '如果問題持續，請查看日誌頁面了解詳情'
            ],
            timestamp: new Date().toISOString()
        }
    });
});

// 404 處理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `找不到路徑: ${req.path}`,
            suggestions: [
                '檢查 URL 是否正確',
                '查看 API 文件'
            ]
        }
    });
});

// 確保資料目錄存在
const dataPath = process.env.DATA_PATH || '/app/data';
const configPath = path.join(dataPath, 'config');
const logsPath = path.join(dataPath, 'logs');
const backupsPath = path.join(dataPath, 'backups');

[configPath, logsPath, backupsPath].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logService.info('system', `建立目錄: ${dir}`);
    }
});

// 複製預設設定檔（如果不存在）
const defaultConfigs = [
    'transcription-apis.json',
    'ai-models.json',
    'region-apis.json',
    'ragic.json',
    'subtitle-styles.json',
    'slideshow-settings.json',
    'subtitle-rules.json',
    'notifications.json'
];

defaultConfigs.forEach(filename => {
    const targetPath = path.join(configPath, filename);
    const sourcePath = path.join(__dirname, '../data/config', filename);
    
    if (!fs.existsSync(targetPath) && fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, targetPath);
        logService.info('system', `複製預設設定: ${filename}`);
    }
});

// 啟動
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════╗');
    console.log('║       🎵 SoulTalk Tool v2.0 已啟動         ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  🌐 Port: ${PORT}                               ║`);
    console.log(`║  📁 設定: /app/data/config/                ║`);
    console.log(`║  📋 日誌: /app/data/logs/                  ║`);
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  頁面:                                     ║');
    console.log('║    /             主頁                      ║');
    console.log('║    /mv.html      MV 模式                   ║');
    console.log('║    /audio.html   語音模式                  ║');
    console.log('║    /settings.html 設定                     ║');
    console.log('║    /logs.html    日誌查詢                  ║');
    console.log('║    /styles.html  字幕樣式                  ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log('║  API:                                      ║');
    console.log('║    /api/mv/*     MV 模式 API               ║');
    console.log('║    /api/audio/*  語音模式 API              ║');
    console.log('║    /api/config/* 設定 API                  ║');
    console.log('║    /api/logs     日誌 API                  ║');
    console.log('╚════════════════════════════════════════════╝');
    console.log('');
    
    logService.info('system', '✅ SoulTalk Tool v2.0 啟動完成', {
        port: PORT,
        configPath,
        logsPath
    });
});

// 處理未捕捉的 Promise 錯誤
process.on('unhandledRejection', (reason, promise) => {
    logService.fatal('system', '未處理的 Promise 拒絕', {
        reason: reason?.message || String(reason),
        stack: reason?.stack
    });
});

// 處理未捕捉的異常
process.on('uncaughtException', (error) => {
    logService.fatal('system', '未捕捉的異常', {
        error: error.message,
        stack: error.stack
    });
    console.error('💀 致命錯誤:', error);
    // 給日誌時間寫入後再退出
    setTimeout(() => process.exit(1), 1000);
});

module.exports = app;
