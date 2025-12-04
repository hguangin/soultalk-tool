/**
 * ============================================================================
 * 📦 資料庫模組 (database.js)
 * ============================================================================
 * 
 * 🎯 使用 JSON 檔案儲存，簡單可靠，無需額外安裝
 * 
 * 📁 資料儲存在：
 *    - data/settings.json  - 所有設定
 *    - data/jobs.json      - 工作紀錄
 *    - data/logs.json      - 執行日誌
 * 
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// 資料目錄
const dataDir = path.join(__dirname, '..', 'data');

// 確保目錄存在
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// ============================================================================
// 📁 JSON 檔案操作
// ============================================================================

function loadJSON(filename, defaultValue = {}) {
    const filepath = path.join(dataDir, filename);
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (error) {
        console.warn(`⚠️ 讀取 ${filename} 失敗:`, error.message);
    }
    return defaultValue;
}

function saveJSON(filename, data) {
    const filepath = path.join(dataDir, filename);
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error(`❌ 儲存 ${filename} 失敗:`, error.message);
    }
}

// ============================================================================
// 📊 資料存取
// ============================================================================

// 設定
let settingsData = loadJSON('settings.json', {});

// 工作
let jobsData = loadJSON('jobs.json', []);

// 日誌
let logsData = loadJSON('logs.json', []);


// ============================================================================
// ⚙️ 初始化
// ============================================================================

function initDatabase() {
    console.log('📦 正在初始化資料庫...');
    
    // 載入預設設定
    const defaults = getAllDefaultSettings();
    let newCount = 0;
    
    for (const s of defaults) {
        if (settingsData[s.key] === undefined) {
            settingsData[s.key] = {
                value: s.value,
                category: s.category,
                label: s.label || '',
                type: s.type || 'text',
                options: s.options || '',
                description: s.description || '',
                sort_order: s.sort_order || 0
            };
            newCount++;
        }
    }
    
    if (newCount > 0) {
        saveJSON('settings.json', settingsData);
        console.log(`  📝 新增了 ${newCount} 個設定`);
    }
    
    console.log('✅ 資料庫初始化完成');
}


// ============================================================================
// ⚙️ 所有預設設定
// ============================================================================

function getAllDefaultSettings() {
    return [
        // ===== API 金鑰 =====
        { key: 'api_assemblyai_key', value: '', category: 'api_keys', label: 'AssemblyAI API Key', type: 'password', description: '用於語音識別', sort_order: 1 },
        
        { key: 'api_whisper147_endpoint', value: 'https://api.147ai.com/v1/audio/transcriptions', category: 'api_keys', label: '147 Whisper Endpoint', type: 'text', sort_order: 10 },
        { key: 'api_whisper147_key', value: '', category: 'api_keys', label: '147 Whisper API Key', type: 'password', sort_order: 11 },
        
        { key: 'api_whisperN1N_endpoint', value: 'https://api.n1n.com/v1/audio/transcriptions', category: 'api_keys', label: 'N1N Whisper Endpoint', type: 'text', sort_order: 20 },
        { key: 'api_whisperN1N_key', value: '', category: 'api_keys', label: 'N1N Whisper API Key', type: 'password', sort_order: 21 },
        
        { key: 'api_gemini147_endpoint', value: 'https://api.147ai.com/v1/chat/completions', category: 'api_keys', label: '147 Gemini Endpoint', type: 'text', sort_order: 30 },
        { key: 'api_gemini147_key', value: '', category: 'api_keys', label: '147 Gemini API Key', type: 'password', sort_order: 31 },
        { key: 'api_gemini147_model', value: 'gemini-2.5-pro', category: 'api_keys', label: '147 Gemini 模型', type: 'text', sort_order: 32 },
        { key: 'api_gemini147_max_tokens', value: '1000000', category: 'api_keys', label: '147 Gemini Max Tokens', type: 'number', sort_order: 33 },
        
        { key: 'api_geminiN1N_endpoint', value: 'https://api.n1n.com/v1/chat/completions', category: 'api_keys', label: 'N1N Gemini Endpoint', type: 'text', sort_order: 40 },
        { key: 'api_geminiN1N_key', value: '', category: 'api_keys', label: 'N1N Gemini API Key', type: 'password', sort_order: 41 },
        { key: 'api_geminiN1N_model', value: 'gemini-2.5-pro', category: 'api_keys', label: 'N1N Gemini 模型', type: 'text', sort_order: 42 },
        { key: 'api_geminiN1N_max_tokens', value: '1000000', category: 'api_keys', label: 'N1N Gemini Max Tokens', type: 'number', sort_order: 43 },
        
        { key: 'api_geminiGoogle_key', value: '', category: 'api_keys', label: 'Google Gemini API Key', type: 'password', sort_order: 50 },
        { key: 'api_geminiGoogle_model', value: 'gemini-2.0-flash-exp', category: 'api_keys', label: 'Google Gemini 模型', type: 'text', sort_order: 51 },
        
        { key: 'api_ragic_key', value: '', category: 'api_keys', label: 'Ragic API Key', type: 'password', sort_order: 60 },
        { key: 'api_ragic_base_url', value: 'https://ap13.ragic.com/comeonn/mbti/5', category: 'api_keys', label: 'Ragic Base URL', type: 'text', sort_order: 61 },

        // ===== Webhook =====
        { key: 'webhook_n8n_ragic_read', value: '', category: 'webhooks', label: 'N8N Ragic 讀取 Webhook', type: 'text', sort_order: 1 },
        { key: 'webhook_n8n_ragic_write', value: '', category: 'webhooks', label: 'N8N Ragic 寫入 Webhook', type: 'text', sort_order: 2 },
        { key: 'webhook_n8n_notification', value: '', category: 'webhooks', label: 'N8N 通知 Webhook', type: 'text', sort_order: 3 },
        { key: 'webhook_project_manager', value: '', category: 'webhooks', label: '專案管理平台 URL', type: 'text', sort_order: 10 },

        // ===== 通知設定 =====
        { key: 'notify_via_n8n', value: 'true', category: 'notifications', label: '透過 N8N 通知', type: 'boolean', description: '預設開啟', sort_order: 1 },
        { key: 'notify_via_telegram_direct', value: 'false', category: 'notifications', label: '直接 Telegram 通知', type: 'boolean', description: '可與 N8N 同時啟用', sort_order: 2 },
        { key: 'telegram_bot_token', value: '', category: 'notifications', label: 'Telegram Bot Token', type: 'password', sort_order: 10 },
        { key: 'telegram_chat_id', value: '', category: 'notifications', label: 'Telegram Chat ID', type: 'text', sort_order: 11 },
        { key: 'notify_on_success', value: 'true', category: 'notifications', label: '成功時通知', type: 'boolean', sort_order: 20 },
        { key: 'notify_on_failure', value: 'true', category: 'notifications', label: '失敗時通知', type: 'boolean', sort_order: 21 },
        { key: 'notify_on_pause', value: 'false', category: 'notifications', label: '暫停時通知', type: 'boolean', sort_order: 22 },
        { key: 'notify_template_success', value: '✅ <b>完成</b>\\n📌 專案: {name}\\n⏱️ 耗時: {duration}', category: 'notifications', label: '成功通知模板', type: 'textarea', sort_order: 30 },
        { key: 'notify_template_failure', value: '❌ <b>失敗</b>\\n📌 專案: {name}\\n❗ 錯誤: {error}', category: 'notifications', label: '失敗通知模板', type: 'textarea', sort_order: 31 },

        // ===== 重試規則 =====
        { key: 'retry_max_attempts', value: '3', category: 'retry', label: '最大重試次數', type: 'number', sort_order: 1 },
        { key: 'retry_delay_ms', value: '2000', category: 'retry', label: '重試延遲 (ms)', type: 'number', sort_order: 2 },
        { key: 'retry_transcription_order', value: 'whisper147,whisperN1N,assemblyai', category: 'retry', label: '語音識別 API 順序', type: 'text', sort_order: 10 },
        { key: 'retry_ai_order', value: 'gemini147,geminiN1N,geminiGoogle', category: 'retry', label: 'AI 模型 API 順序', type: 'text', sort_order: 11 },

        // ===== 分行規則 =====
        { key: 'split_min_chars', value: '6', category: 'split_rules', label: '最小字數', type: 'number', sort_order: 1 },
        { key: 'split_max_chars_mv', value: '20', category: 'split_rules', label: 'MV 模式最大字數', type: 'number', sort_order: 2 },
        { key: 'split_max_chars_audio', value: '12', category: 'split_rules', label: '語音模式最大字數', type: 'number', sort_order: 3 },
        { key: 'split_punctuation', value: '。！？，、；', category: 'split_rules', label: '斷句標點', type: 'text', sort_order: 4 },
        { key: 'split_remove_trailing_punctuation', value: 'true', category: 'split_rules', label: '移除行尾標點', type: 'boolean', sort_order: 5 },

        // ===== 字幕樣式 =====
        { key: 'style_font_family', value: 'Noto Sans TC, Microsoft JhengHei, sans-serif', category: 'subtitle_style', label: '字型', type: 'text', sort_order: 1 },
        { key: 'style_font_size', value: '28', category: 'subtitle_style', label: '字體大小 (px)', type: 'number', sort_order: 2 },
        { key: 'style_font_weight', value: 'bold', category: 'subtitle_style', label: '字體粗細', type: 'select', options: 'normal,bold,lighter', sort_order: 3 },
        { key: 'style_color_current', value: '#FFEB3B', category: 'subtitle_style', label: '當前行顏色', type: 'color', sort_order: 10 },
        { key: 'style_color_other', value: '#FFFFFF', category: 'subtitle_style', label: '其他行顏色', type: 'color', sort_order: 11 },
        { key: 'style_color_highlight', value: '#FF5722', category: 'subtitle_style', label: '高亮顏色', type: 'color', sort_order: 12 },
        { key: 'style_stroke_enabled', value: 'true', category: 'subtitle_style', label: '啟用描邊', type: 'boolean', sort_order: 20 },
        { key: 'style_stroke_color', value: '#000000', category: 'subtitle_style', label: '描邊顏色', type: 'color', sort_order: 21 },
        { key: 'style_stroke_width', value: '2', category: 'subtitle_style', label: '描邊寬度', type: 'number', sort_order: 22 },
        { key: 'style_shadow_enabled', value: 'true', category: 'subtitle_style', label: '啟用陰影', type: 'boolean', sort_order: 30 },
        { key: 'style_shadow_color', value: 'rgba(0,0,0,0.5)', category: 'subtitle_style', label: '陰影顏色', type: 'text', sort_order: 31 },
        { key: 'style_shadow_blur', value: '4', category: 'subtitle_style', label: '陰影模糊', type: 'number', sort_order: 32 },
        { key: 'style_position', value: 'bottom', category: 'subtitle_style', label: '字幕位置', type: 'select', options: 'top,center,bottom', sort_order: 40 },
        { key: 'style_margin_bottom', value: '10', category: 'subtitle_style', label: '底部邊距 (%)', type: 'number', sort_order: 41 },
        { key: 'style_line_height', value: '1.5', category: 'subtitle_style', label: '行高', type: 'number', sort_order: 42 },
        { key: 'style_max_lines', value: '3', category: 'subtitle_style', label: '最大顯示行數', type: 'number', sort_order: 43 },

        // ===== 輪播設定 =====
        { key: 'slideshow_base_duration', value: '5', category: 'slideshow', label: '基礎時長 (秒)', type: 'number', sort_order: 1 },
        { key: 'slideshow_weight_full', value: '2.0', category: 'slideshow', label: 'Full 圖片權重', type: 'number', sort_order: 10 },
        { key: 'slideshow_weight_transparent', value: '2.0', category: 'slideshow', label: 'Transparent 權重', type: 'number', sort_order: 11 },
        { key: 'slideshow_weight_wide', value: '2.5', category: 'slideshow', label: 'Wide 圖片權重', type: 'number', sort_order: 12 },
        { key: 'slideshow_weight_carousel', value: '3.3', category: 'slideshow', label: 'Carousel 權重', type: 'number', sort_order: 13 },
        { key: 'slideshow_transition', value: 'fade', category: 'slideshow', label: '轉場效果', type: 'select', options: 'fade,slide,zoom,none', sort_order: 20 },
        { key: 'slideshow_transition_duration', value: '0.5', category: 'slideshow', label: '轉場時間 (秒)', type: 'number', sort_order: 21 },
        { key: 'slideshow_bg_color_1', value: '#1a1a2e', category: 'slideshow', label: '背景色 1', type: 'color', sort_order: 30 },
        { key: 'slideshow_bg_color_2', value: '#16213e', category: 'slideshow', label: '背景色 2', type: 'color', sort_order: 31 },
        { key: 'slideshow_bg_color_3', value: '#0f3460', category: 'slideshow', label: '背景色 3', type: 'color', sort_order: 32 },

        // ===== 背景設定 =====
        { key: 'background_default_type', value: 'color', category: 'background', label: '預設背景類型', type: 'select', options: 'color,image,gradient,video', sort_order: 1 },
        { key: 'background_default_color', value: '#1a1a2e', category: 'background', label: '預設背景顏色', type: 'color', sort_order: 2 },
        { key: 'background_default_gradient', value: 'linear-gradient(135deg, #1a1a2e, #16213e)', category: 'background', label: '預設漸層', type: 'text', sort_order: 3 },
        { key: 'background_default_image', value: '', category: 'background', label: '預設背景圖片 URL', type: 'text', sort_order: 4 },
        { key: 'background_default_opacity', value: '1', category: 'background', label: '背景透明度', type: 'number', sort_order: 5 },
        { key: 'background_default_blur', value: '0', category: 'background', label: '背景模糊度 (px)', type: 'number', sort_order: 6 },
        { key: 'background_default_overlay', value: 'rgba(0,0,0,0.3)', category: 'background', label: '覆蓋層顏色', type: 'text', sort_order: 7 },
        { key: 'background_overlay_enabled', value: 'true', category: 'background', label: '啟用覆蓋層', type: 'boolean', sort_order: 8 },

        // ===== 地區設定 =====
        { key: 'regions_list', value: JSON.stringify([
            { id: 'TW', name: '台灣', language: 'zh' },
            { id: 'HK', name: '香港', language: 'zh' },
            { id: 'CN', name: '中國', language: 'zh' },
            { id: 'JP', name: '日本', language: 'ja' },
            { id: 'KR', name: '韓國', language: 'ko' },
            { id: 'US', name: '美國', language: 'en' },
        ]), category: 'regions', label: '地區列表', type: 'json', sort_order: 1 },

        // ===== Ragic MV 輸入欄位 =====
        { key: 'ragic_mv_field_title', value: '_ragic_field_1000001', category: 'ragic_mv_input', label: '歌曲標題', type: 'text', sort_order: 1 },
        { key: 'ragic_mv_field_artist', value: '_ragic_field_1000002', category: 'ragic_mv_input', label: '演唱者', type: 'text', sort_order: 2 },
        { key: 'ragic_mv_field_audio_url', value: '_ragic_field_1000003', category: 'ragic_mv_input', label: '音頻 URL', type: 'text', sort_order: 3 },
        { key: 'ragic_mv_field_r2_audio_url', value: '_ragic_field_1000007', category: 'ragic_mv_input', label: 'R2 音頻 URL', type: 'text', sort_order: 4 },
        { key: 'ragic_mv_field_lyrics', value: '_ragic_field_1000004', category: 'ragic_mv_input', label: '歌詞', type: 'text', sort_order: 5 },
        { key: 'ragic_mv_field_images', value: '_ragic_field_1000005', category: 'ragic_mv_input', label: '圖片列表', type: 'text', sort_order: 6 },
        { key: 'ragic_mv_field_background', value: '_ragic_field_1000008', category: 'ragic_mv_input', label: '背景設定', type: 'text', sort_order: 7 },
        { key: 'ragic_mv_field_region', value: '_ragic_field_1000006', category: 'ragic_mv_input', label: '地區', type: 'text', sort_order: 8 },

        // ===== Ragic MV 輸出欄位 =====
        { key: 'ragic_mv_field_output_json', value: '_ragic_field_1000010', category: 'ragic_mv_output', label: 'JSON 結果', type: 'text', sort_order: 1 },
        { key: 'ragic_mv_field_status', value: '_ragic_field_1000011', category: 'ragic_mv_output', label: '處理狀態', type: 'text', sort_order: 2 },
        { key: 'ragic_mv_field_process_time', value: '_ragic_field_1000012', category: 'ragic_mv_output', label: '處理時間', type: 'text', sort_order: 3 },
        { key: 'ragic_mv_field_error_msg', value: '_ragic_field_1000013', category: 'ragic_mv_output', label: '錯誤訊息', type: 'text', sort_order: 4 },

        // ===== Ragic 語音輸入欄位 =====
        { key: 'ragic_audio_field_title', value: '_ragic_field_2000001', category: 'ragic_audio_input', label: '標題', type: 'text', sort_order: 1 },
        { key: 'ragic_audio_field_speaker', value: '_ragic_field_2000002', category: 'ragic_audio_input', label: '演講者', type: 'text', sort_order: 2 },
        { key: 'ragic_audio_field_audio_url', value: '_ragic_field_2000003', category: 'ragic_audio_input', label: '原始音頻 URL', type: 'text', sort_order: 3 },
        { key: 'ragic_audio_field_merged_audio_url', value: '_ragic_field_2000006', category: 'ragic_audio_input', label: '合併音頻 URL', type: 'text', sort_order: 4 },
        { key: 'ragic_audio_field_transcript', value: '_ragic_field_2000004', category: 'ragic_audio_input', label: '語音稿', type: 'text', sort_order: 5 },
        { key: 'ragic_audio_field_image_url', value: '_ragic_field_2000005', category: 'ragic_audio_input', label: '背景圖片', type: 'text', sort_order: 6 },
        { key: 'ragic_audio_field_background', value: '_ragic_field_2000008', category: 'ragic_audio_input', label: '背景設定', type: 'text', sort_order: 7 },
        { key: 'ragic_audio_field_region', value: '_ragic_field_2000007', category: 'ragic_audio_input', label: '地區', type: 'text', sort_order: 8 },

        // ===== Ragic 語音輸出欄位 =====
        { key: 'ragic_audio_field_output_json', value: '_ragic_field_2000010', category: 'ragic_audio_output', label: 'JSON 結果', type: 'text', sort_order: 1 },
        { key: 'ragic_audio_field_status', value: '_ragic_field_2000011', category: 'ragic_audio_output', label: '處理狀態', type: 'text', sort_order: 2 },
        { key: 'ragic_audio_field_process_time', value: '_ragic_field_2000012', category: 'ragic_audio_output', label: '處理時間', type: 'text', sort_order: 3 },
        { key: 'ragic_audio_field_error_msg', value: '_ragic_field_2000013', category: 'ragic_audio_output', label: '錯誤訊息', type: 'text', sort_order: 4 },

        // ===== 預設選項 =====
        { key: 'default_mode', value: 'mv', category: 'defaults', label: '預設模式', type: 'select', options: 'mv,audio', sort_order: 1 },
        { key: 'default_transcription_api', value: 'whisper147', category: 'defaults', label: '預設語音識別 API', type: 'select', options: 'whisper147,whisperN1N,assemblyai', sort_order: 2 },
        { key: 'default_matching_api', value: 'gemini147', category: 'defaults', label: '預設匹配模型', type: 'select', options: 'gemini147,geminiN1N,geminiGoogle', sort_order: 3 },
        { key: 'default_correction_api', value: 'gemini147', category: 'defaults', label: '預設校正模型', type: 'select', options: 'gemini147,geminiN1N,geminiGoogle', sort_order: 4 },
        { key: 'default_auto_correction', value: 'true', category: 'defaults', label: '預設啟用自動校正', type: 'boolean', sort_order: 5 },
        { key: 'default_auto_upload', value: 'true', category: 'defaults', label: '預設自動上傳 Ragic', type: 'boolean', sort_order: 6 },

        // ===== 提示詞 =====
        { key: 'prompt_mv', value: getMVPrompt(), category: 'prompts', label: 'MV 模式提示詞', type: 'textarea', sort_order: 1 },
        { key: 'prompt_audio', value: getAudioPrompt(), category: 'prompts', label: '語音模式提示詞', type: 'textarea', sort_order: 2 },
        { key: 'prompt_correction', value: getCorrectionPrompt(), category: 'prompts', label: '校正模式提示詞', type: 'textarea', sort_order: 3 },
    ];
}

function getMVPrompt() {
    return `你是專業的字幕時間軸匹配專家。

【任務】
用戶提供了正確的歌詞，AssemblyAI 提供了語音的時間戳。
請智能匹配：把正確歌詞對應到時間戳。

⚠️ 規則：
1. 保持原始文字（不轉換簡繁體）
2. 輸出所有歌詞行，不能漏
3. 每行 6-20 字
4. 時間戳嚴格遞增

【歌詞】
[USER_LYRICS]

【時間戳】
[ASSEMBLY_JSON]

【輸出格式】
const lyricsData=[
{line:"歌詞",start:1.23,chars:[{char:"字",time:1.23}]},
];

直接輸出代碼：`;
}

function getAudioPrompt() {
    return `你是專業的字幕時間軸匹配專家。

【任務】
將字幕對應到語音識別的時間戳。

⚠️ 規則：
1. 保持原始文字
2. 每行 6-12 字
3. 移除行尾標點

【字幕】
[USER_LYRICS]

【時間戳】
[ASSEMBLY_JSON]

【輸出格式】
const lyricsData=[
{line:"文字",start:時間},
];

直接輸出代碼：`;
}

function getCorrectionPrompt() {
    return `你是字幕校正專家。

【任務】保守校正，只處理：
1. 漏掉的歌詞
2. 明顯時間錯誤
3. 錯字

【現有字幕】
[CURRENT_LYRICS]

【原始稿】
[ORIGINAL_LYRICS]

直接輸出校正後代碼：`;
}


// ============================================================================
// 📤 匯出
// ============================================================================

module.exports = {
    initDatabase,
    
    settings: {
        get: (key) => settingsData[key]?.value ?? null,
        
        getWithInfo: (key) => settingsData[key] || null,
        
        getAll: () => {
            return Object.entries(settingsData)
                .map(([key, data]) => ({ key, ...data }))
                .sort((a, b) => {
                    if (a.category !== b.category) return a.category.localeCompare(b.category);
                    return (a.sort_order || 0) - (b.sort_order || 0);
                });
        },
        
        getByCategory: (category) => {
            return Object.entries(settingsData)
                .filter(([_, data]) => data.category === category)
                .map(([key, data]) => ({ key, ...data }))
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        },
        
        getCategories: () => {
            const cats = new Set();
            for (const data of Object.values(settingsData)) {
                cats.add(data.category);
            }
            return Array.from(cats).sort();
        },
        
        update: (key, value) => {
            if (settingsData[key]) {
                settingsData[key].value = value;
                saveJSON('settings.json', settingsData);
            }
        },
        
        updateBatch: (updates) => {
            for (const { key, value } of updates) {
                if (settingsData[key]) {
                    settingsData[key].value = value;
                }
            }
            saveJSON('settings.json', settingsData);
        }
    },
    
    jobs: {
        create: (id, name, type, ragicCode, inputData) => {
            const job = {
                id,
                name,
                type,
                ragic_code: ragicCode,
                status: 'pending',
                current_step: null,
                progress: 0,
                started_at: null,
                ended_at: null,
                duration_seconds: null,
                input_data: JSON.stringify(inputData || {}),
                output_data: null,
                error_message: null,
                created_at: new Date().toISOString()
            };
            jobsData.unshift(job);
            saveJSON('jobs.json', jobsData);
            return job;
        },
        
        getById: (id) => jobsData.find(j => j.id === id) || null,
        
        getAll: (limit = 100) => jobsData.slice(0, limit),
        
        getRunning: () => jobsData.filter(j => j.status === 'running'),
        
        updateStatus: (id, status, step, progress) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = status;
                job.current_step = step;
                job.progress = progress;
                saveJSON('jobs.json', jobsData);
            }
        },
        
        start: (id) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = 'running';
                job.started_at = new Date().toISOString();
                saveJSON('jobs.json', jobsData);
            }
        },
        
        complete: (id, outputData) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = 'completed';
                job.progress = 100;
                job.ended_at = new Date().toISOString();
                job.duration_seconds = Math.round((new Date(job.ended_at) - new Date(job.started_at)) / 1000);
                job.output_data = JSON.stringify(outputData || {});
                saveJSON('jobs.json', jobsData);
            }
        },
        
        fail: (id, error) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = 'failed';
                job.ended_at = new Date().toISOString();
                job.duration_seconds = job.started_at ? Math.round((new Date(job.ended_at) - new Date(job.started_at)) / 1000) : 0;
                job.error_message = error;
                saveJSON('jobs.json', jobsData);
            }
        },
        
        pause: (id) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = 'paused';
                saveJSON('jobs.json', jobsData);
            }
        },
        
        cancel: (id) => {
            const job = jobsData.find(j => j.id === id);
            if (job) {
                job.status = 'cancelled';
                saveJSON('jobs.json', jobsData);
            }
        }
    },
    
    logs: {
        add: (jobId, step, status, message, details = null, retryCount = 0, durationMs = null) => {
            logsData.push({
                id: logsData.length + 1,
                job_id: jobId,
                step,
                status,
                message,
                details: JSON.stringify(details),
                retry_count: retryCount,
                duration_ms: durationMs,
                created_at: new Date().toISOString()
            });
            saveJSON('logs.json', logsData);
        },
        
        getByJob: (jobId) => logsData.filter(l => l.job_id === jobId),
        
        getRecent: (limit = 100) => logsData.slice(-limit)
    }
};
