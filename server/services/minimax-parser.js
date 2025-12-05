/**
 * Minimax 解析器
 * 解析 Minimax 網頁取得真正的音頻 URL、歌詞、標題等
 */

const fetch = require('node-fetch');

class MinimaxParser {
    constructor() {
        // N8N Webhook URL for fetching HTML
        this.htmlFetchUrl = 'https://app.notpro.cc/webhook/html';
    }

    /**
     * 檢查是否為 Minimax URL
     */
    isMinimaxUrl(url) {
        if (!url) return false;
        return url.includes('suno.cn') || 
               url.includes('minimax') || 
               url.includes('hailuoai');
    }

    /**
     * 解析 Minimax 網頁
     * @param {string} url - Minimax 網頁 URL
     * @returns {Promise<object>} - { audioUrl, lyrics, songTitle, artist }
     */
    async parse(url) {
        console.log('\n🎵 開始解析 Minimax 連結...');
        console.log(`  - URL: ${url}`);

        try {
            // 透過 N8N Webhook 取得網頁原始碼
            const html = await this.fetchWebSource(url);
            
            if (!html) {
                throw new Error('無法取得網頁內容');
            }

            // 解析 HTML 取得資料
            const data = this.parseHtml(html);
            
            console.log('✅ Minimax 解析完成:');
            console.log(`  - 音頻 URL: ${data.audioUrl ? '有' : '無'}`);
            console.log(`  - 歌詞: ${data.lyrics ? `有 (${data.lyrics.length}字)` : '無'}`);
            console.log(`  - 標題: ${data.songTitle || '無'}`);
            console.log(`  - 演唱者: ${data.artist || '無'}`);

            return data;

        } catch (error) {
            console.error('❌ Minimax 解析失敗:', error.message);
            return {
                audioUrl: null,
                lyrics: null,
                songTitle: null,
                artist: null,
                error: error.message
            };
        }
    }

    /**
     * 透過 N8N Webhook 取得網頁原始碼
     */
    async fetchWebSource(url) {
        console.log('  - 正在取得網頁原始碼...');
        
        const response = await fetch(this.htmlFetchUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        // N8N 回傳格式可能是 { html: "..." } 或直接是字串
        if (typeof data === 'string') {
            return data;
        } else if (data.html) {
            return data.html;
        } else if (data.body) {
            return data.body;
        }
        
        return JSON.stringify(data);
    }

    /**
     * 解析 HTML 取得音頻資料
     */
    parseHtml(html) {
        const result = {
            audioUrl: null,
            lyrics: null,
            songTitle: null,
            artist: null
        };

        try {
            // 嘗試找 JSON 資料（通常在 script 標籤中）
            // 方法 1: 找 window.__INITIAL_STATE__ 或類似的全域變數
            const jsonPatterns = [
                /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/,
                /window\.__NUXT__\s*=\s*({[\s\S]*?});/,
                /"audio_url"\s*:\s*"([^"]+)"/,
                /"audioUrl"\s*:\s*"([^"]+)"/,
                /"song_url"\s*:\s*"([^"]+)"/,
                /"mp3_url"\s*:\s*"([^"]+)"/,
                /"url"\s*:\s*"(https?:\/\/[^"]*\.mp3[^"]*)"/
            ];

            // 嘗試提取音頻 URL
            for (const pattern of jsonPatterns) {
                const match = html.match(pattern);
                if (match) {
                    if (match[1].startsWith('{')) {
                        // 是 JSON 物件
                        try {
                            const jsonData = JSON.parse(match[1]);
                            if (jsonData.audio_url) result.audioUrl = jsonData.audio_url;
                            if (jsonData.audioUrl) result.audioUrl = jsonData.audioUrl;
                            if (jsonData.lyrics) result.lyrics = this.decodeLyrics(jsonData.lyrics);
                            if (jsonData.title) result.songTitle = jsonData.title;
                        } catch (e) {
                            // JSON 解析失敗，繼續嘗試其他模式
                        }
                    } else if (match[1].includes('http')) {
                        // 直接是 URL
                        result.audioUrl = match[1];
                    }
                }
                
                if (result.audioUrl) break;
            }

            // 嘗試提取歌詞
            const lyricsPatterns = [
                /"lyrics"\s*:\s*"([^"]+)"/,
                /"lyric"\s*:\s*"([^"]+)"/,
                /class="lyrics[^"]*"[^>]*>([^<]+)</
            ];

            if (!result.lyrics) {
                for (const pattern of lyricsPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        result.lyrics = this.decodeLyrics(match[1]);
                        break;
                    }
                }
            }

            // 嘗試提取標題
            const titlePatterns = [
                /"title"\s*:\s*"([^"]+)"/,
                /<title>([^<]+)<\/title>/,
                /"song_name"\s*:\s*"([^"]+)"/
            ];

            if (!result.songTitle) {
                for (const pattern of titlePatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        // 解析標題格式: "歌名（演唱者）" 或 "歌名 - 演唱者"
                        const title = match[1].trim();
                        const titleMatch = title.match(/^(.+?)(?:（|【|\(|-)(.+?)(?:）|】|\))?$/);
                        
                        if (titleMatch) {
                            result.songTitle = titleMatch[1].trim();
                            if (titleMatch[2]) {
                                result.artist = titleMatch[2].trim();
                            }
                        } else {
                            result.songTitle = title;
                        }
                        break;
                    }
                }
            }

            // 嘗試提取演唱者
            const artistPatterns = [
                /"user_name"\s*:\s*"([^"]+)"/,
                /"artist"\s*:\s*"([^"]+)"/,
                /"singer"\s*:\s*"([^"]+)"/
            ];

            if (!result.artist) {
                for (const pattern of artistPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        result.artist = match[1].trim();
                        break;
                    }
                }
            }

        } catch (error) {
            console.error('  - HTML 解析錯誤:', error.message);
        }

        return result;
    }

    /**
     * 解碼歌詞中的轉義字符
     */
    decodeLyrics(lyrics) {
        if (!lyrics) return null;
        
        return lyrics
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '')
            .replace(/\\t/g, '\t')
            .replace(/\\u0026/g, '&')
            .replace(/\\u003c/g, '<')
            .replace(/\\u003e/g, '>')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .trim();
    }
}

module.exports = new MinimaxParser();
