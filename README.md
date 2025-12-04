# 🎬 SoulTalk Tool v2.0

## 📋 這是什麼？

這是一個 **MV/語音字幕生成工具**，可以：
1. 輸入 Ragic 代碼 → 自動抓取資料
2. 語音識別 → 把音頻轉成文字和時間戳
3. AI 匹配 → 把歌詞/字幕對到正確的時間點
4. 生成 JSON → 可用於播放器
5. 上傳回 Ragic → 自動保存結果

---

## 🚀 部署到 Zeabur

### 步驟 1：上傳到 GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的帳號/soultalk-tool.git
git push -u origin main
```

### 步驟 2：在 Zeabur 建立專案
1. 登入 [Zeabur](https://zeabur.com)
2. 點擊「New Project」
3. 選擇「Deploy from GitHub」
4. 選擇 `soultalk-tool` 專案
5. 等待部署完成

### 步驟 3：設定 Volume（重要！）
⚠️ **沒有設定 Volume，重新部署後設定會消失！**

1. 在 Zeabur 專案頁面點擊你的服務
2. 點擊「Storage」→「Add Volume」
3. Mount Path 填入：`/app/data`
4. 點擊「Create」

### 步驟 4：設定 Port（通常自動偵測）
- 預設 Port：`8080`
- 如果沒有自動偵測到，手動在 Networking 設定

### 步驟 5：開始使用
1. 打開 `https://你的網址/settings.html`
2. 填入 API 金鑰（至少要填 AssemblyAI 或 Whisper）
3. 打開 `https://你的網址/`
4. 輸入 Ragic 代碼開始使用

---

## 📁 檔案結構說明

```
soultalk-tool/
│
├── 📄 README.md          ← 你現在看的這個檔案
├── 📄 package.json       ← Node.js 專案設定
├── 📄 zeabur.json        ← Zeabur 部署設定
├── 📄 .gitignore         ← Git 忽略檔案
│
├── 📁 server/            ← 後端程式碼
│   ├── 📄 index.js       ← 主程式入口（Port 8080）
│   ├── 📄 database.js    ← 資料庫（所有設定都存這裡）
│   │
│   └── 📁 services/      ← 各種服務
│       ├── 📄 notification.js  ← 通知（N8N + Telegram）
│       ├── 📄 ragic.js         ← Ragic 讀寫
│       ├── 📄 transcription.js ← 語音識別
│       ├── 📄 ai-matching.js   ← AI 時間軸匹配
│       ├── 📄 text-processor.js← 文字處理（分行等）
│       └── 📄 job-runner.js    ← 工作執行器
│
├── 📁 public/            ← 前端網頁
│   ├── 📄 index.html     ← 主頁面（執行工作）
│   ├── 📄 settings.html  ← 設定頁面（修改所有設定）
│   ├── 📁 css/style.css  ← 網頁樣式
│   └── 📁 js/app.js      ← 前端程式
│
└── 📁 data/              ← 資料目錄（自動生成）
    ├── 📄 settings.json  ← 所有設定
    ├── 📄 jobs.json      ← 工作紀錄
    └── 📄 logs.json      ← 執行日誌
```

---

## ⚙️ 設定分類說明（共 107 項設定）

| 分類 | 說明 | 項目數 |
|------|------|--------|
| 🔑 API 金鑰 | 各種服務的 Key 和 Endpoint | 17 |
| 🔗 Webhook | N8N 等外部服務的網址 | 4 |
| 📱 通知設定 | N8N、Telegram 通知開關和模板 | 9 |
| 🔄 重試規則 | 失敗時重試幾次、間隔多久 | 4 |
| ✂️ 分行規則 | 最小/最大字數、斷句標點 | 5 |
| 🎨 字幕樣式 | 顏色、字型、大小、位置 | 15 |
| 🖼️ 輪播設定 | 圖片時長、轉場效果 | 10 |
| 🎨 背景設定 | 預設背景顏色、圖片 | 8 |
| 🌍 地區設定 | 各地區的語言設定 | 1 |
| 📊 Ragic 欄位 | MV/語音的輸入輸出欄位對應 | 24 |
| ⚙️ 預設選項 | 預設使用哪個 API | 6 |
| 📝 提示詞 | AI 使用的提示詞模板 | 3 |

**全部都可以在網頁設定頁面修改！**

---

## 🔌 API 使用說明

### 方式 1：用 Ragic 代碼執行（最簡單）
```json
POST /api/jobs
{
    "ragicCode": "Efji6e",
    "type": "mv"
}
```

### 方式 2：手動帶入所有參數
```json
POST /api/jobs
{
    "type": "mv",
    "data": {
        "title": "歌曲名稱",
        "artist": "演唱者",
        "audioUrl": "https://...",
        "lyrics": "歌詞內容...",
        "images": "[full] https://...",
        "background": {
            "type": "color",
            "color": "#1a1a2e"
        }
    }
}
```

### 方式 3：Ragic + 覆蓋部分參數
```json
POST /api/jobs
{
    "ragicCode": "Efji6e",
    "type": "mv",
    "overrides": {
        "audioUrl": "https://r2.example.com/audio.mp3"
    }
}
```

---

## 🔧 給 AI 的修改指南

### 如何修改設定預設值？
打開 `server/database.js`，找到 `getAllDefaultSettings()` 函數，裡面有所有設定的預設值。

### 如何新增一個設定項目？
在 `getAllDefaultSettings()` 裡面加一個物件：
```javascript
{
    key: 'my_new_setting',        // 設定的 ID（唯一）
    value: 'default_value',       // 預設值
    category: 'api_keys',         // 分類
    label: '我的新設定',           // 顯示名稱
    type: 'text',                 // 類型
    options: '',                  // select 的選項
    description: '說明文字',       // 說明
    sort_order: 99                // 排序
}
```

**type 可用值**：text, password, number, boolean, color, select, textarea, json

### 如何修改提示詞？
1. 在網頁設定頁面修改（推薦）
2. 或在 `server/database.js` 找到 `getMVPrompt()` 等函數

### 如何修改 Ragic 欄位對應？
在設定頁面的「Ragic 欄位對應」分類下修改

---

## ❓ 常見問題

### Q: 設定存在哪裡？
A: 存在 `data/settings.json` 檔案裡（JSON 格式，可讀可編輯）

### Q: 重新部署後設定消失了？
A: 需要在 Zeabur 設定 Volume，Mount Path 設為 `/app/data`

### Q: 如何備份設定？
A: 下載 `data/` 資料夾內的所有 JSON 檔案

### Q: API 呼叫失敗怎麼辦？
A: 系統會自動重試（預設 3 次），還會自動切換到備用 API

---

## 📝 版本紀錄

- v2.0.0 (2025-01) - 全新重構版本
  - 所有設定都可在網頁修改（107 項）
  - 每個 Ragic 欄位都可獨立設定
  - 支援 N8N 和直接 Telegram 兩種通知
  - 背景設定可儲存預設值
  - 完整的錯誤處理和重試機制
  - 支援暫停/繼續/取消工作
  - Port 8080
