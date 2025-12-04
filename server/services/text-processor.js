/**
 * ============================================================================
 * ✂️ 文字處理服務 (text-processor.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    負責處理文字：
 *    1. 清理轉錄文字（移除時間標記等）
 *    2. 智能分行（把長文字拆成適當長度）
 *    3. 解析圖片列表
 *    4. 生成最終 JSON
 * 
 * 🔧 分行規則怎麼設定？
 *    在設定頁面的「分行規則」分類：
 *    - split_min_chars: 最小字數
 *    - split_max_chars_mv: MV 模式最大字數
 *    - split_max_chars_audio: 語音模式最大字數
 *    - split_punctuation: 斷句標點
 *    - split_remove_trailing_punctuation: 是否移除行尾標點
 * 
 * ============================================================================
 */

class TextProcessorService {
    constructor(db) {
        this.db = db;
    }

    // ========================================================================
    // 📖 讀取設定
    // ========================================================================

    /**
     * 取得分行規則設定
     */
    getSplitConfig(mode = 'mv') {
        return {
            minChars: parseInt(this.db.settings.get('split_min_chars')) || 6,
            maxChars: parseInt(this.db.settings.get(mode === 'audio' ? 'split_max_chars_audio' : 'split_max_chars_mv')) || (mode === 'audio' ? 12 : 20),
            punctuation: this.db.settings.get('split_punctuation') || '。！？，、；',
            removeTrailing: this.db.settings.get('split_remove_trailing_punctuation') === 'true'
        };
    }

    /**
     * 取得字幕樣式設定
     */
    getSubtitleStyles() {
        return {
            fontFamily: this.db.settings.get('style_font_family'),
            fontSize: this.db.settings.get('style_font_size'),
            fontWeight: this.db.settings.get('style_font_weight'),
            colorCurrent: this.db.settings.get('style_color_current'),
            colorOther: this.db.settings.get('style_color_other'),
            colorHighlight: this.db.settings.get('style_color_highlight'),
            strokeEnabled: this.db.settings.get('style_stroke_enabled') === 'true',
            strokeColor: this.db.settings.get('style_stroke_color'),
            strokeWidth: this.db.settings.get('style_stroke_width'),
            shadowEnabled: this.db.settings.get('style_shadow_enabled') === 'true',
            shadowColor: this.db.settings.get('style_shadow_color'),
            shadowBlur: this.db.settings.get('style_shadow_blur'),
            position: this.db.settings.get('style_position'),
            marginBottom: this.db.settings.get('style_margin_bottom'),
            lineHeight: this.db.settings.get('style_line_height'),
            maxLines: this.db.settings.get('style_max_lines'),
        };
    }

    /**
     * 取得輪播設定
     */
    getSlideshowSettings() {
        return {
            baseDuration: parseFloat(this.db.settings.get('slideshow_base_duration')) || 5,
            weightFull: parseFloat(this.db.settings.get('slideshow_weight_full')) || 2.0,
            weightTransparent: parseFloat(this.db.settings.get('slideshow_weight_transparent')) || 2.0,
            weightWide: parseFloat(this.db.settings.get('slideshow_weight_wide')) || 2.5,
            weightCarousel: parseFloat(this.db.settings.get('slideshow_weight_carousel')) || 3.3,
            transition: this.db.settings.get('slideshow_transition') || 'fade',
            transitionDuration: parseFloat(this.db.settings.get('slideshow_transition_duration')) || 0.5,
            bgColors: [
                this.db.settings.get('slideshow_bg_color_1') || '#1a1a2e',
                this.db.settings.get('slideshow_bg_color_2') || '#16213e',
                this.db.settings.get('slideshow_bg_color_3') || '#0f3460',
            ]
        };
    }


    // ========================================================================
    // 🧹 清理文字
    // ========================================================================

    /**
     * 清理轉錄文字
     * 移除時間標記、整理空行等
     * 
     * @param {string} text - 原始文字
     * @returns {string} 清理後的文字
     */
    cleanTranscript(text) {
        console.log('🧹 清理文字...');
        console.log(`  原始長度: ${text.length} 字`);
        
        let result = text;

        // 移除開頭前綴（如「轉錄文字：」）
        result = result.replace(/^(轉錄文字|Transcript|字幕|Subtitle|文字稿)[：:]\s*/i, '');

        // 移除時間標記
        result = result
            .replace(/（<#[0-9.]+#>）/g, '')
            .replace(/\(<#[0-9.]+#>\)/g, '')
            .replace(/<#[0-9.]+#>/g, '');

        // 整理空行
        const lines = result.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);

        result = lines.join('\n');
        console.log(`  清理後長度: ${result.length} 字`);

        return result;
    }


    // ========================================================================
    // ✂️ 智能分行
    // ========================================================================

    /**
     * 智能分行
     * 把長文字拆成適當長度的行
     * 
     * @param {string} text - 要分行的文字
     * @param {string} mode - 模式：mv 或 audio
     * @returns {string} 分行後的文字（用換行符分隔）
     * 
     * 使用範例：
     *   const result = textProcessor.smartSplit('很長的一段文字...', 'audio');
     *   const lines = result.split('\n');
     */
    smartSplit(text, mode = 'mv') {
        const config = this.getSplitConfig(mode);
        console.log(`✂️ 智能分行 (${config.minChars}-${config.maxChars}字)...`);

        // 清理換行
        text = text.trim()
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n{3,}/g, '\n\n');

        // 按段落分割
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
        const result = [];

        // 計算字數的函數
        // 中文算 1 字，英文單詞算 1 字，標點不算
        const getLength = (str) => {
            const cleaned = str.replace(/[，。、；：！？,.;:!?"'\"「」『』（）()【】《》〈〉]/g, '');
            const chinese = (cleaned.match(/[\u4e00-\u9fa5]/g) || []).length;
            const english = (cleaned.match(/[a-zA-Z]+/g) || []).length;
            return chinese + english;
        };

        // 移除行尾標點
        const removePunctuation = (str) => {
            if (!config.removeTrailing) return str.trim();
            return str.replace(/[。！？，、；,.;:!?"'\"]+$/g, '').trim();
        };

        for (const paragraph of paragraphs) {
            let cleaned = paragraph.replace(/\n/g, '').trim();

            // 先按大標點分句（。！？）
            const bigSentences = cleaned.split(/([。！？]+)/).filter(s => s.trim());

            // 把標點合併回前一句
            const fullSentences = [];
            for (let i = 0; i < bigSentences.length; i++) {
                if (/^[。！？]+$/.test(bigSentences[i])) {
                    if (fullSentences.length > 0) {
                        fullSentences[fullSentences.length - 1] += bigSentences[i];
                    }
                } else {
                    fullSentences.push(bigSentences[i]);
                }
            }

            // 處理每個句子
            for (let sentence of fullSentences) {
                sentence = sentence.trim();
                if (!sentence) continue;

                const len = getLength(sentence);

                if (len <= config.maxChars) {
                    // 長度合適，直接加入
                    result.push(removePunctuation(sentence));
                } else {
                    // 太長，按小標點拆分（，、；）
                    const parts = sentence.split(/([，、；]+)/).filter(p => p.trim());
                    let currentLine = '';

                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];

                        if (/^[，、；]+$/.test(part)) {
                            // 是標點，加到當前行
                            currentLine += part;
                        } else {
                            // 是文字
                            const testLine = currentLine + part;
                            const testLen = getLength(testLine);

                            if (testLen <= config.maxChars) {
                                // 加上去不會超長
                                currentLine = testLine;
                            } else {
                                // 會超長，先存當前行
                                if (currentLine) {
                                    result.push(removePunctuation(currentLine));
                                }
                                currentLine = part;

                                // 如果單個部分就超長，強制切
                                if (getLength(part) > config.maxChars) {
                                    const chars = part.split('');
                                    let tempLine = '';

                                    for (const char of chars) {
                                        if (getLength(tempLine + char) <= config.maxChars) {
                                            tempLine += char;
                                        } else {
                                            if (tempLine) {
                                                result.push(removePunctuation(tempLine));
                                            }
                                            tempLine = char;
                                        }
                                    }
                                    currentLine = tempLine;
                                }
                            }
                        }
                    }

                    // 存最後一行
                    if (currentLine) {
                        result.push(removePunctuation(currentLine));
                    }
                }
            }
        }

        console.log(`  分行結果: ${result.length} 行`);
        return result.join('\n');
    }


    // ========================================================================
    // 🖼️ 解析圖片
    // ========================================================================

    /**
     * 解析圖片列表
     * 支援格式：
     *   [full] https://example.com/image.jpg
     *   [transparent] https://example.com/image.png
     *   [wide] https://example.com/image.jpg
     *   https://example.com/image.jpg  (無標籤視為 full)
     * 
     * @param {string} imagesText - 圖片列表文字
     * @returns {Object} { full: [], transparent: [], normal: [], wide: [], wideCenter: [] }
     */
    parseImages(imagesText) {
        if (!imagesText) {
            return { full: [], transparent: [], normal: [], wide: [], wideCenter: [] };
        }

        const images = { full: [], transparent: [], normal: [], wide: [], wideCenter: [] };
        const lines = imagesText.split('\n').filter(line => line.trim());

        for (const line of lines) {
            const trimmed = line.trim();
            
            // 嘗試匹配 [類型] URL 格式
            const match = trimmed.match(/^\[([^\]]+)\]\s*(.+)$/);
            
            if (match) {
                const type = match[1].toLowerCase();
                const url = match[2].trim();

                if (type.includes('full') || type.includes('滿版')) {
                    images.full.push(url);
                } else if (type.includes('transparent') || type.includes('透明')) {
                    images.transparent.push(url);
                } else if (type.includes('wide') && (type.includes('center') || type.includes('中'))) {
                    images.wideCenter.push(url);
                } else if (type.includes('wide') || type.includes('寬')) {
                    images.wide.push(url);
                } else if (type.includes('normal') || type.includes('普通')) {
                    images.normal.push(url);
                } else {
                    // 無法識別的類型，視為 full
                    images.full.push(url);
                }
            } else if (trimmed.startsWith('http')) {
                // 沒有標籤的 URL，視為 full
                images.full.push(trimmed);
            }
        }

        console.log(`🖼️ 圖片解析: full=${images.full.length}, transparent=${images.transparent.length}, wide=${images.wide.length}`);
        return images;
    }


    // ========================================================================
    // 📦 生成 JSON
    // ========================================================================

    /**
     * 生成最終 JSON
     * 
     * @param {Array} lyricsData - 字幕數據
     * @param {Object} options - 選項
     * @returns {Object} 完整的 JSON 結構
     */
    generateJSON(lyricsData, options = {}) {
        const subtitleStyles = this.getSubtitleStyles();
        const slideshowSettings = this.getSlideshowSettings();

        return {
            version: '2.0',
            mode: options.mode || 'mv',
            generatedAt: new Date().toISOString(),
            
            metadata: {
                title: options.title || 'Soul Talk',
                artist: options.artist || options.speaker || 'Unknown',
                ragicCode: options.ragicCode || null,
                region: options.region || null,
            },
            
            audio: {
                url: options.audioUrl || '',
                mergedUrl: options.mergedAudioUrl || null,
            },
            
            images: options.images || {},
            background: options.background || {},
            
            lyrics: lyricsData,
            
            styles: subtitleStyles,
            slideshow: slideshowSettings,
        };
    }
}

module.exports = TextProcessorService;
