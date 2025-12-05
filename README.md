# SoulTalk V2 - MBTI 客製化 MV/語音生成工具

## 🌟 新功能

### ✨ 專屬結尾（重點功能！）
在影片最後 8 秒顯示專屬文字，慢慢淡入淡出。

**設定方式超簡單：**
1. 打開 `/ending` 頁面
2. 選一個喜歡的模板（或自己打字）
3. 調整字體大小（拉滑桿就好）
4. 設定顯示時間和淡入淡出
5. 點儲存

**可用變數：**
- `{name}` = 這個人的名字
- `{mbti}` = 這個人的 MBTI

**例如：**
- 「這是屬於 {name} 的 {mbti} 專屬時刻」
- → 「這是屬於 小明 的 INFP 專屬時刻」

---

## 📁 專案結構

```
soultalk-v2/
├── public/                    # 前端頁面
│   ├── index.html            # 首頁（選擇模式）
│   ├── mv.html               # MV 模式主頁面
│   ├── audio.html            # 語音模式主頁面
│   ├── settings.html         # 設定頁面
│   └── ending-settings.html  # 專屬結尾設定（傻瓜版）
│
├── server/                    # 後端
│   ├── index.js              # Express API 伺服器
│   ├── services/
│   │   ├── config-manager.js # 設定管理器
│   │   └── minimax-parser.js # Minimax 連結解析
│   └── integrations/
│       └── ragic/
│           ├── client.js     # Ragic API 客戶端
│           └── field-mappings.js # 欄位對照表
│
├── data/                      # 設定檔儲存
│   └── config/
│       └── settings.json     # 所有設定
│
└── package.json
```

---

## 🚀 啟動方式

```bash
# 安裝依賴
npm install

# 啟動伺服器
npm start
```

伺服器會在 `http://localhost:8080` 啟動

---

## 📍 頁面路徑

| 路徑 | 說明 |
|------|------|
| `/` | 首頁 - 選擇模式 |
| `/mv` | MV 模式 |
| `/audio` | 語音模式 |
| `/settings` | 設定頁面 |
| `/ending` | 專屬結尾設定（超簡單版！）|

---

## 📤 API 端點

### 載入資料
- `GET /api/mv/fetch/:code` - 載入 MV 資料
- `GET /api/audio/fetch/:code` - 載入語音資料

### 設定
- `GET /api/config` - 取得所有設定
- `POST /api/config` - 更新設定
- `GET /api/config/custom-ending` - 取得專屬結尾設定
- `POST /api/config/custom-ending` - 更新專屬結尾設定
- `GET /api/config/mbti-colors` - 取得 MBTI 顏色
- `POST /api/config/mbti-colors` - 更新 MBTI 顏色

### 上傳
- `POST /api/upload` - 上傳 JSON 到 Ragic

---

## 🎨 JSON 輸出格式

### 專屬結尾區塊
```javascript
{
  // ... 其他設定 ...
  
  customEnding: {
    enabled: true,                    // 是否啟用
    text: "這是屬於 小明 的 INFP 專屬時刻",  // 已替換變數的文字
    fontSize: 28,                     // 電腦版字體大小
    fontSizeMobile: 20,               // 手機版字體大小
    duration: 8,                      // 顯示時長（秒）
    fadeInDuration: 1.5,              // 淡入時間（秒）
    fadeOutDuration: 2                // 淡出時間（秒）
  }
}
```

### WordPress 播放器實作建議
```javascript
// 影片結束前 duration 秒開始顯示
const showEndingAt = videoDuration - customEnding.duration;

// 淡入動畫
element.style.transition = `opacity ${customEnding.fadeInDuration}s`;
element.style.opacity = 1;

// 在 (duration - fadeOutDuration) 秒後開始淡出
setTimeout(() => {
  element.style.transition = `opacity ${customEnding.fadeOutDuration}s`;
  element.style.opacity = 0;
}, (customEnding.duration - customEnding.fadeOutDuration) * 1000);
```

---

## ⚠️ 注意事項

1. **預覽畫面都是 1:1 正方形**（MV 和語音模式）
2. **專屬結尾文字置中顯示**（上下左右都置中）
3. **Ragic 欄位**：`MBTI`、`性別` 用於自動配色
4. **JSON 格式不變**：配合現有 WordPress 播放器

---

## 🔧 環境變數（可選）

```
PORT=8080          # 伺服器埠號
CONFIG_PATH=/path  # 設定檔路徑
```

---

## 📞 N8N Webhook

- 資料查詢：`https://app.notpro.cc/webhook/soultalk`
- JSON 上傳：`https://app.notpro.cc/webhook/up-mv-json`
