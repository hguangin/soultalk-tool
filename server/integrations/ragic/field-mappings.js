/**
 * Ragic 欄位映射配置
 * 定義 Ragic 資料庫欄位 ID 與應用程式欄位的對應關係
 * 
 * 重要：這裡的欄位 ID 來自 Ragic 資料庫
 * 如果 Ragic 欄位有變動，需要更新這裡
 */

const fieldMappings = {
    // ========================================
    // 通用欄位（MV 和語音都會用到）
    // ========================================
    common: {
        // 基本資訊
        name: { id: '1005226', name: '姓名' },
        gender: { id: '1005229', name: '性別' },
        mbti: { id: '1005231', name: 'MBTI' },
        region: { id: '1005230', name: '地區' },
        
        // 代碼
        ragicCode: { id: '1000748', name: '代碼' },
        mvCode: { id: '1005411', name: 'mv代碼' },
        audioCode: { id: '1005412', name: 'audio代碼' }
    },

    // ========================================
    // MV 模式專用欄位
    // ========================================
    mv: {
        // 音頻來源
        minimaxMusicUrl: { id: '1005414', name: 'minimax音樂連結' },
        mp3Link2: { id: '1005409', name: 'mp3連結2' },
        
        // 歌曲資訊
        songTitle: { id: '1005415', name: '歌曲名稱' },
        artist: { id: '1005416', name: '演唱者' },
        lyrics: { id: '1005417', name: '歌詞' },
        
        // 圖片（多個圖片欄位）
        images: {
            image1: { id: '1005301', name: '圖片1' },
            image2: { id: '1005302', name: '圖片2' },
            image3: { id: '1005303', name: '圖片3' },
            image4: { id: '1005304', name: '圖片4' },
            image5: { id: '1005305', name: '圖片5' },
            image6: { id: '1005306', name: '圖片6' },
            image7: { id: '1005307', name: '圖片7' },
            image8: { id: '1005308', name: '圖片8' },
            image9: { id: '1005309', name: '圖片9' },
            image10: { id: '1005310', name: '圖片10' }
        },
        
        // 圖片標題（用於自動分類）
        imageTitles: {
            title1: { id: '1005311', name: '圖片1標題' },
            title2: { id: '1005312', name: '圖片2標題' },
            title3: { id: '1005313', name: '圖片3標題' },
            title4: { id: '1005314', name: '圖片4標題' },
            title5: { id: '1005315', name: '圖片5標題' },
            title6: { id: '1005316', name: '圖片6標題' },
            title7: { id: '1005317', name: '圖片7標題' },
            title8: { id: '1005318', name: '圖片8標題' },
            title9: { id: '1005319', name: '圖片9標題' },
            title10: { id: '1005320', name: '圖片10標題' }
        },
        
        // JSON 資料
        mvJson: { id: '1005418', name: 'mv-json' }
    },

    // ========================================
    // 語音模式專用欄位
    // ========================================
    audio: {
        // 音頻來源
        audioUrl: { id: '1005401', name: '語音連結' },
        mp3Link: { id: '1005402', name: 'mp3連結' },
        
        // 資訊
        title: { id: '1005403', name: '標題' },
        speaker: { id: '1005404', name: '演講者' },
        transcript: { id: '1005405', name: '逐字稿' },
        
        // 圖片（語音模式只用一張）
        coverImage: { id: '1005406', name: '封面圖片' },
        
        // JSON 資料
        audioJson: { id: '1005419', name: 'audio-json' }
    }
};

/**
 * 取得欄位 ID
 * @param {string} category - 類別 ('common', 'mv', 'audio')
 * @param {string} fieldName - 欄位名稱
 * @returns {string|null} - 欄位 ID
 */
function getFieldId(category, fieldName) {
    const categoryFields = fieldMappings[category];
    if (!categoryFields) return null;
    
    const field = categoryFields[fieldName];
    if (!field) return null;
    
    return field.id || null;
}

/**
 * 取得欄位名稱
 * @param {string} category - 類別
 * @param {string} fieldName - 欄位名稱
 * @returns {string|null} - Ragic 欄位名稱
 */
function getFieldName(category, fieldName) {
    const categoryFields = fieldMappings[category];
    if (!categoryFields) return null;
    
    const field = categoryFields[fieldName];
    if (!field) return null;
    
    return field.name || null;
}

/**
 * 取得整個類別的欄位映射
 * @param {string} category - 類別
 * @returns {object} - 欄位映射物件
 */
function getCategoryFields(category) {
    return fieldMappings[category] || {};
}

/**
 * 建立平面化的 ID 對照表（方便快速查詢）
 * @param {string} mode - 'mv' 或 'audio'
 * @returns {object} - { fieldName: fieldId }
 */
function getFlatFieldIds(mode) {
    const result = {};
    
    // 加入通用欄位
    const common = fieldMappings.common;
    for (const [key, value] of Object.entries(common)) {
        result[key] = value.id;
    }
    
    // 加入模式專用欄位
    const modeFields = fieldMappings[mode] || {};
    for (const [key, value] of Object.entries(modeFields)) {
        if (value.id) {
            result[key] = value.id;
        } else if (typeof value === 'object') {
            // 處理巢狀物件（如 images, imageTitles）
            for (const [subKey, subValue] of Object.entries(value)) {
                result[`${key}_${subKey}`] = subValue.id;
            }
        }
    }
    
    return result;
}

module.exports = {
    fieldMappings,
    getFieldId,
    getFieldName,
    getCategoryFields,
    getFlatFieldIds
};
