/**
 * ============================================================================
 * 🚀 主伺服器 (index.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    這是程式的入口點，啟動網頁伺服器。
 *    執行 `node server/index.js` 或 `npm start` 就會啟動。
 * 
 * 🔌 API 端點列表：
 * 
 *    【設定】
 *    GET  /api/settings              - 取得所有設定
 *    GET  /api/settings/categories   - 取得所有設定分類
 *    GET  /api/settings/category/:cat - 取得特定分類的設定
 *    PUT  /api/settings/:key         - 更新單一設定
 *    POST /api/settings/batch        - 批量更新設定
 * 
 *    【工作】
 *    GET  /api/jobs                  - 取得所有工作
 *    GET  /api/jobs/:id              - 取得單一工作（含日誌）
 *    POST /api/jobs                  - 建立並執行工作
 *    POST /api/jobs/:id/pause        - 暫停工作
 *    POST /api/jobs/:id/resume       - 繼續工作
 *    POST /api/jobs/:id/cancel       - 取消工作
 * 
 *    【測試】
 *    POST /api/test/notification     - 測試通知
 *    POST /api/test/ragic-read       - 測試 Ragic 讀取
 * 
 * ============================================================================
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// 載入資料庫
const db = require('./database');

// 初始化資料庫（建立表格、載入預設設定）
db.initDatabase();

// 載入服務
const NotificationService = require('./services/notification');
const RagicService = require('./services/ragic');
const TranscriptionService = require('./services/transcription');
const AIMatchingService = require('./services/ai-matching');
const TextProcessorService = require('./services/text-processor');
const JobRunner = require('./services/job-runner');

// 建立服務實例
const services = {
    notification: new NotificationService(db),
    ragic: new RagicService(db),
    transcription: new TranscriptionService(db),
    aiMatching: new AIMatchingService(db),
    textProcessor: new TextProcessorService(db),
};

// JobRunner 需要其他服務
services.jobRunner = new JobRunner(db, services);

// 建立 Express 應用
const app = express();

// 中介軟體
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));


// ============================================================================
// ⚙️ 設定 API
// ============================================================================

/**
 * 取得所有設定分類
 */
app.get('/api/settings/categories', (req, res) => {
    try {
        const categories = db.settings.getCategories();
        
        // 中文名稱對照
        const categoryNames = {
            'api_keys': '🔑 API 金鑰',
            'webhooks': '🔗 Webhook',
            'notifications': '📱 通知設定',
            'retry': '🔄 重試規則',
            'split_rules': '✂️ 分行規則',
            'subtitle_style': '🎨 字幕樣式',
            'slideshow': '🖼️ 輪播設定',
            'background': '🎨 背景設定',
            'regions': '🌍 地區設定',
            'ragic_mv_input': '📊 Ragic MV 輸入欄位',
            'ragic_mv_output': '📊 Ragic MV 輸出欄位',
            'ragic_audio_input': '📊 Ragic 語音輸入欄位',
            'ragic_audio_output': '📊 Ragic 語音輸出欄位',
            'defaults': '⚙️ 預設選項',
            'prompts': '📝 提示詞',
        };

        const result = categories.map(cat => ({
            id: cat,
            name: categoryNames[cat] || cat
        }));

        res.json({ success: true, categories: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得所有設定
 */
app.get('/api/settings', (req, res) => {
    try {
        const settings = db.settings.getAll();
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得特定分類的設定
 */
app.get('/api/settings/category/:category', (req, res) => {
    try {
        const settings = db.settings.getByCategory(req.params.category);
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 更新單一設定
 */
app.put('/api/settings/:key', (req, res) => {
    try {
        const { value } = req.body;
        db.settings.update(req.params.key, value);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 批量更新設定
 */
app.post('/api/settings/batch', (req, res) => {
    try {
        const { updates } = req.body;
        db.settings.updateBatch(updates);
        res.json({ success: true, count: updates.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================================
// 📋 工作 API
// ============================================================================

/**
 * 取得所有工作
 */
app.get('/api/jobs', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const jobs = db.jobs.getAll(limit);
        res.json({ success: true, jobs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取得單一工作
 */
app.get('/api/jobs/:id', (req, res) => {
    try {
        const job = db.jobs.getById(req.params.id);
        if (!job) {
            return res.status(404).json({ success: false, error: '工作不存在' });
        }
        const logs = db.logs.getByJob(req.params.id);
        res.json({ success: true, job, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 建立並執行工作
 */
app.post('/api/jobs', async (req, res) => {
    try {
        const { name, type, ragicCode, data, overrides } = req.body;
        
        const job = await services.jobRunner.createAndRun({
            name,
            type: type || 'mv',
            ragicCode,
            data: data || {},
            overrides: overrides || {}
        });
        
        res.json({ success: true, job });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 暫停工作
 */
app.post('/api/jobs/:id/pause', (req, res) => {
    try {
        services.jobRunner.pause(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 繼續工作
 */
app.post('/api/jobs/:id/resume', async (req, res) => {
    try {
        await services.jobRunner.resume(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 取消工作
 */
app.post('/api/jobs/:id/cancel', (req, res) => {
    try {
        services.jobRunner.cancel(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================================
// 🧪 測試 API
// ============================================================================

/**
 * 測試通知
 */
app.post('/api/test/notification', async (req, res) => {
    try {
        const result = await services.notification.sendTest();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 測試 Ragic 讀取
 */
app.post('/api/test/ragic-read', async (req, res) => {
    try {
        const { code, mode } = req.body;
        const data = await services.ragic.read(code, mode || 'mv');
        res.json({ success: true, data });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * 檢查 API 狀態
 */
app.get('/api/test/api-status', (req, res) => {
    try {
        const status = {
            transcription: {
                whisper147: services.transcription.checkApi('whisper147'),
                whisperN1N: services.transcription.checkApi('whisperN1N'),
                assemblyai: services.transcription.checkApi('assemblyai'),
            }
        };
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// ============================================================================
// 📡 即時狀態 (SSE)
// ============================================================================

app.get('/api/jobs/:id/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const jobId = req.params.id;
    
    const interval = setInterval(() => {
        const job = db.jobs.getById(jobId);
        if (job) {
            res.write(`data: ${JSON.stringify(job)}\n\n`);
            
            if (['completed', 'failed', 'cancelled'].includes(job.status)) {
                clearInterval(interval);
                res.end();
            }
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
    });
});


// ============================================================================
// 🚀 啟動
// ============================================================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🎬 SoulTalk Tool v2.0 已啟動！                        ║
║                                                              ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   🌐 主頁面:     http://localhost:${PORT}/                      ║
║   ⚙️ 設定頁面:   http://localhost:${PORT}/settings.html         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
