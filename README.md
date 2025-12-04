# SoulTalk Tool v2.0

模組化字幕生成工具，支援 MV 和語音兩種模式。

---

## 🔒 設定保護機制（重新部署不會清空！）

### 原理說明

```
/app/                     ← 程式碼目錄（重新部署會更新）
├── server/               ← 後端程式
├── public/               ← 前端程式
└── package.json

/app/data/                ← Volume 掛載（重新部署不會清空！）
├── config/               ← 所有設定檔
│   ├── transcription-apis.json
│   ├── ai-models.json
│   └── ...
└── backups/              ← 自動備份
```

### 運作流程

1. **首次部署**
   - 程式啟動時檢查 `/app/data/config/` 是否有設定檔
   - 如果沒有 → 從程式碼內的預設值複製
   
2. **後續修改**
   - 你在網頁上修改設定 → 儲存到 `/app/data/config/`
   - 設定檔在 Volume 中，不會被覆蓋

3. **重新部署**
   - 程式碼更新 → `/app/server/` 和 `/app/public/` 被覆蓋
   - 設定檔保留 → `/app/data/config/` 不受影響
   - 如果新版本有新增設定項目 → 自動補充，但不改現有值

4. **自動備份**
   - 每次修改設定前，自動備份到 `/app/data/backups/`
   - 保留最近 10 個備份
   - 可從備份還原

---

## 🚀 部署步驟

### 1. Zeabur 設定

**必須正確設定 Volume！**

| 設定項目 | 值 |
|---------|-----|
| Volume ID | `data` |
| Mount Path | `/app/data` |
| Port | `8080` |

### 2. 環境變數（可選）

```bash
PORT=8080
DATA_PATH=/app/data
CONFIG_PATH=/app/data/config
BACKUP_PATH=/app/data/backups
```

---

## 💾 匯出/匯入設定

### 匯出設定（備份）

1. 開啟設定頁面：`/settings.html`
2. 點擊右上角「💾 匯出設定」
3. 選擇格式：
   - **HTML 檔案**：包含所有設定，可離線查看
   - **JSON 檔案**：用於匯入還原

### 匯入設定（還原）

1. 開啟設定頁面：`/settings.html`
2. 點擊「📥 匯入設定」
3. 貼上 JSON 或選擇檔案
4. 確認匯入（現有設定會自動備份）

### API 端點

```
GET  /api/export/html    # 下載 HTML 設定備份
GET  /api/export/json    # 下載 JSON 設定備份
POST /api/import/json    # 匯入設定
GET  /api/backups        # 取得備份列表
POST /api/backups/restore  # 從備份還原
```

---

## 📁 設定檔說明

| 檔案 | 用途 | 修改頻率 |
|-----|------|---------|
| `transcription-apis.json` | 語音識別 API (147 Whisper、AssemblyAI 等) | 低 |
| `ai-models.json` | AI 模型 (Gemini、GPT-4o 等) | 低 |
| `region-apis.json` | 地區對應 (台灣→147, 香港→N1N) | 低 |
| `ragic.json` | Ragic 連線、N8N Webhook | 低 |
| `subtitle-styles.json` | 字幕樣式 (字體、顏色、位置) | 中 |
| `slideshow-settings.json` | 輪播設定 (時間、背景、色組) | 中 |
| `subtitle-rules.json` | 計算規則 (每字時間、分行規則) | 低 |
| `notifications.json` | 通知設定 (Telegram、Webhook) | 低 |

---

## 🎯 API 端點

### MV 模式
```
GET  /api/mv/fetch/:code    # 從 Ragic 載入資料
POST /api/mv/transcribe     # 語音識別
POST /api/mv/match          # AI 匹配
POST /api/mv/upload         # 上傳 JSON 到 Ragic
```

### 語音模式
```
GET  /api/audio/fetch/:code
POST /api/audio/transcribe
POST /api/audio/match
POST /api/audio/upload
```

### 設定管理
```
GET  /api/config              # 取得所有設定
GET  /api/config/:name        # 取得單一設定
POST /api/config/:name        # 更新設定
POST /api/config/reload       # 重新載入設定
```

---

## 📝 提示詞修改

提示詞檔案位置：`/app/server/prompts/`

| 檔案 | 用途 |
|-----|------|
| `mv-matching.txt` | MV 模式 AI 匹配提示詞 |
| `audio-matching.txt` | 語音模式 AI 匹配提示詞 |
| `correction.txt` | 字幕校正提示詞 |

**注意**：這些檔案在程式碼目錄內，重新部署會覆蓋。如需保留自訂提示詞，請使用匯出功能備份。

---

## ❓ 常見問題

### Q: 重新部署後設定消失了？

**A**: Volume 可能未正確掛載。請檢查：
1. Zeabur Volume ID 是否為 `data`
2. Mount Path 是否為 `/app/data`

### Q: 如何恢復預設設定？

**A**: 刪除 `/app/data/config/` 中的對應檔案，重新啟動服務即可。

### Q: 如何查看備份？

**A**: 呼叫 `GET /api/backups` 或檢查 `/app/data/backups/` 目錄。

---

## 📦 版本

- **v2.0.0** - 模組化架構，設定與程式分離
