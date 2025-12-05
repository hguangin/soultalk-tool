/**
 * SoulTalk V2 後端伺服器
 * 提供 API 端點給前端使用
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

// 服務模組
const configManager = require('./services/config-manager');
const minimaxParser = require('./services/minimax-parser');
const ragicClient = require('./integrations/ragic/client');

const app = express();
const PORT = process.env.PORT || 8080;

// 中介軟體
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ========================================
// 健康檢查
// ========================================
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        version: '2.0.0',
        timestamp: new Date().toISOString()
    });
});

// ========================================
// 設定 API
// ========================================

// 取得所有設定
app.get('/api/config', (req, res) => {
    try {
        res.json(configManager.getAllConfig());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 更新設定
app.post('/api/config', (req, res) => {
    try {
        const success = configManager.updateConfig(req.body);
        res.json({ success, message: success ? '設定已儲存' : '儲存失敗' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MBTI 顏色組別
app.get('/api/config/mbti-colors', (req, res) => {
    try {
        res.json(configManager.getMBTIColorGroups());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/mbti-colors', (req, res) => {
    try {
        const success = configManager.setMBTIColorGroups(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// MBTI 視覺參數
app.get('/api/config/mbti-visual', (req, res) => {
    try {
        res.json(configManager.getMBTIVisualParams());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/mbti-visual', (req, res) => {
    try {
        const success = configManager.setMBTIVisualParams(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 專屬結尾設定
app.get('/api/config/custom-ending', (req, res) => {
    try {
        res.json(configManager.getCustomEnding());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/custom-ending', (req, res) => {
    try {
        const success = configManager.setCustomEnding(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 圖片分類關鍵字
app.get('/api/config/image-keywords', (req, res) => {
    try {
        res.json(configManager.getImageKeywords());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/image-keywords', (req, res) => {
    try {
        const success = configManager.setImageKeywords(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 通知設定
app.get('/api/config/notifications', (req, res) => {
    try {
        res.json(configManager.getNotifications());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/notifications', (req, res) => {
    try {
        const success = configManager.setNotifications(req.body);
        res.json({ success, message: success ? '通知設定已儲存' : '儲存失敗' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 測試 Telegram 通知
app.post('/api/config/notifications/test', async (req, res) => {
    try {
        const { telegram } = configManager.getNotifications();
        
        if (!telegram.enabled || !telegram.botToken || !telegram.chatId) {
            return res.status(400).json({ 
                success: false, 
                message: '請先設定並啟用 Telegram 通知' 
            });
        }

        const fetch = require('node-fetch');
        const url = `https://api.telegram.org/bot${telegram.botToken}/sendMessage`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: telegram.chatId,
                text: '🎉 SoulTalk V2 測試通知\n\n這是一則測試訊息，如果你看到這則訊息，表示 Telegram 通知設定成功！',
                parse_mode: 'HTML'
            })
        });

        const result = await response.json();
        
        if (result.ok) {
            res.json({ success: true, message: '測試通知已發送！' });
        } else {
            res.status(400).json({ 
                success: false, 
                message: `發送失敗: ${result.description}` 
            });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 字幕設定
app.get('/api/config/subtitle', (req, res) => {
    try {
        res.json(configManager.getSubtitleStyles());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/subtitle', (req, res) => {
    try {
        const success = configManager.setSubtitleStyles(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 標題設定
app.get('/api/config/title', (req, res) => {
    try {
        res.json(configManager.getTitleStyles());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/title', (req, res) => {
    try {
        const success = configManager.setTitleStyles(req.body);
        res.json({ success });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// Ragic 資料 API
// ========================================

// 取得 MV 資料
app.get('/api/mv/fetch/:code', async (req, res) => {
    try {
        const { code } = req.params;
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📥 API 請求: 載入 MV 資料`);
        console.log(`  - 代碼: ${code}`);
        console.log(`${'='.repeat(50)}`);

        let data = await ragicClient.fetchByCode(code, 'mv');

        // 檢查是否需要解析 Minimax URL
        if (data.audioUrl && minimaxParser.isMinimaxUrl(data.audioUrl)) {
            console.log('\n🎵 偵測到 Minimax URL，開始解析...');
            const minimaxData = await minimaxParser.parse(data.audioUrl);
            
            if (minimaxData.audioUrl) {
                data.audioUrl = minimaxData.audioUrl;
            }
            if (!data.lyrics && minimaxData.lyrics) {
                data.lyrics = minimaxData.lyrics;
            }
            if (!data.songTitle && minimaxData.songTitle) {
                data.songTitle = minimaxData.songTitle;
            }
            if (!data.artist && minimaxData.artist) {
                data.artist = minimaxData.artist;
            }
        }

        res.json({ success: true, data });

    } catch (error) {
        console.error('❌ API 錯誤:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 取得語音資料
app.get('/api/audio/fetch/:code', async (req, res) => {
    try {
        const { code } = req.params;
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📥 API 請求: 載入語音資料`);
        console.log(`  - 代碼: ${code}`);
        console.log(`${'='.repeat(50)}`);

        const data = await ragicClient.fetchByCode(code, 'audio');
        res.json({ success: true, data });

    } catch (error) {
        console.error('❌ API 錯誤:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 上傳 JSON 到 Ragic
app.post('/api/upload', async (req, res) => {
    try {
        const { queryCode, mvCode, audioCode, mode, jsonData } = req.body;
        
        console.log(`\n${'='.repeat(50)}`);
        console.log(`📤 API 請求: 上傳 JSON`);
        console.log(`  - 查詢代碼: ${queryCode}`);
        console.log(`  - 模式: ${mode}`);
        console.log(`${'='.repeat(50)}`);

        const result = await ragicClient.uploadJSON({
            queryCode,
            mvCode,
            audioCode,
            mode,
            jsonData
        });

        // 發送通知
        await sendNotification(`✅ ${mode.toUpperCase()} JSON 上傳成功\n代碼: ${queryCode}`);

        res.json(result);

    } catch (error) {
        console.error('❌ 上傳錯誤:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========================================
// 通知輔助函數
// ========================================
async function sendNotification(message) {
    const { telegram, n8n } = configManager.getNotifications();
    
    // Telegram 通知
    if (telegram.enabled && telegram.botToken && telegram.chatId) {
        try {
            const fetch = require('node-fetch');
            await fetch(`https://api.telegram.org/bot${telegram.botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: telegram.chatId,
                    text: `🎵 SoulTalk V2\n\n${message}`,
                    parse_mode: 'HTML'
                })
            });
        } catch (error) {
            console.error('Telegram 通知失敗:', error.message);
        }
    }

    // N8N Webhook 通知
    if (n8n.enabled && n8n.webhookUrl) {
        try {
            const fetch = require('node-fetch');
            await fetch(n8n.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source: 'soultalk-v2',
                    message,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (error) {
            console.error('N8N 通知失敗:', error.message);
        }
    }
}

// ========================================
// 頁面路由
// ========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/mv', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mv.html'));
});

app.get('/audio', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/audio.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/settings.html'));
});

app.get('/ending', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/ending-settings.html'));
});

// ========================================
// 啟動伺服器
// ========================================
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🎵 SoulTalk V2 伺服器啟動成功！`);
    console.log(`${'='.repeat(50)}`);
    console.log(`📍 本地網址: http://localhost:${PORT}`);
    console.log(`📍 MV 模式: http://localhost:${PORT}/mv`);
    console.log(`📍 語音模式: http://localhost:${PORT}/audio`);
    console.log(`📍 設定頁面: http://localhost:${PORT}/settings`);
    console.log(`${'='.repeat(50)}\n`);
});
