/**
 * SoulTalk V2 設定管理器
 * 管理所有設定：MBTI 顏色、通知、圖片分類關鍵字等
 */

const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../data/config');
        this.ensureConfigDir();
        this.loadAllConfigs();
    }

    ensureConfigDir() {
        if (!fs.existsSync(this.configPath)) {
            fs.mkdirSync(this.configPath, { recursive: true });
        }
    }

    // ========================================
    // 預設設定
    // ========================================
    getDefaultConfig() {
        return {
            // MBTI 背景顏色組別
            mbtiColorGroups: {
                male: [
                    {
                        id: 'male-1',
                        name: '理性藍',
                        colors: ['#1a1a2e', '#16213e', '#0f3460'],
                        direction: 'to-bottom-right',
                        assignedMBTI: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'ISTJ', 'ISTP']
                    },
                    {
                        id: 'male-2',
                        name: '穩重綠',
                        colors: ['#1b4332', '#2d6a4f', '#40916c'],
                        direction: 'to-bottom',
                        assignedMBTI: ['ISFJ', 'ESTJ', 'ESFJ', 'ISFP']
                    },
                    {
                        id: 'male-3',
                        name: '熱情紅',
                        colors: ['#2d132c', '#6b0f1a', '#c72c41'],
                        direction: 'to-right',
                        assignedMBTI: ['ESTP', 'ESFP', 'ENFP', 'ENFJ', 'INFJ', 'INFP']
                    }
                ],
                female: [
                    {
                        id: 'female-1',
                        name: '溫柔粉',
                        colors: ['#4a1942', '#7b2d5b', '#d4a5a5'],
                        direction: 'to-bottom-right',
                        assignedMBTI: ['INFP', 'INFJ', 'ENFP', 'ENFJ', 'ISFP', 'ESFP']
                    },
                    {
                        id: 'female-2',
                        name: '優雅紫',
                        colors: ['#2c003e', '#512b58', '#7b2cbf'],
                        direction: 'to-bottom',
                        assignedMBTI: ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'ISFJ', 'ISTJ']
                    },
                    {
                        id: 'female-3',
                        name: '清新藍',
                        colors: ['#023e8a', '#0077b6', '#48cae4'],
                        direction: 'to-right',
                        assignedMBTI: ['ESTJ', 'ESFJ', 'ESTP', 'ISTP']
                    }
                ]
            },

            // MBTI 視覺參數（根據字母自動調整）
            mbtiVisualParams: {
                enabled: true,
                // E/I 影響漸層方向
                gradientByEI: true,
                // T/F 影響星星數量
                starsByTF: true,
                starsT: 40,  // T 型較少星星
                starsF: 80,  // F 型較多星星
                // P/J 影響流星頻率
                shootingByPJ: true,
                shootingP: 5,  // P 型較多流星
                shootingJ: 2   // J 型較少流星
            },

            // 專屬結尾設定
            customEnding: {
                enabled: true,
                template: '這是屬於 {name} 的 {mbti} 專屬時刻',
                fontSize: 28,
                fontSizeMobile: 20,
                duration: 8,  // 最後 8 秒顯示
                fadeInDuration: 1.5,
                fadeOutDuration: 2
            },

            // 圖片分類關鍵字
            imageKeywords: {
                full: 'header,封面,cover,主視覺,漫畫圖',
                transparent: 'Q版,動作圖,人物,主人物,去背',
                background: '漫畫圖1,漫畫圖2,漫畫圖3,漫畫圖',
                static: '靜態,static,語音封面'
            },

            // 背景設定
            backgroundSettings: {
                mode: 'gradient',  // 'solid' 或 'gradient'
                starryBg: true,
                defaultColors: ['#1a1a2e', '#16213e', '#0f3460']
            },

            // 通知設定
            notifications: {
                telegram: {
                    enabled: false,
                    botToken: '',
                    chatId: ''
                },
                n8n: {
                    enabled: false,
                    webhookUrl: ''
                }
            },

            // 字幕設定
            subtitleStyles: {
                position: 'bottom',
                fontSize: 28,
                fontSizeMobile: 22,
                fontSizeFullscreen: 36,
                fontWeight: 700,
                letterSpacingMV: 0.05,
                letterSpacingAudio: 0.08,
                unsungColor: '#ffffff',
                sungColor: '#4d4d4d',
                borderColor: '#ffffff'
            },

            // 標題設定
            titleStyles: {
                positionMV: 'center',
                positionAudio: 'top',
                fontSizeMV: 32,
                fontSizeMVMobile: 24,
                fontSizeMVFullscreen: 42,
                fontSizeAudio: 34,
                fontSizeAudioMobile: 25,
                fontSizeAudioFullscreen: 43,
                artistFontSize: 18,
                offsetDesktopMV: 5,
                offsetMobileMV: 3,
                offsetFullscreenMV: 8,
                offsetDesktopAudio: 5,
                offsetMobileAudio: 3,
                offsetFullscreenAudio: 8,
                fadeOutDuration: 12
            },

            // 輪播設定
            slideshowSettings: {
                duration: 8,
                transitionDuration: 300,
                zoomMin: 1,
                zoomMax: 1.15
            }
        };
    }

    // ========================================
    // 載入/儲存設定
    // ========================================
    loadAllConfigs() {
        const configFile = path.join(this.configPath, 'settings.json');
        
        if (fs.existsSync(configFile)) {
            try {
                const saved = JSON.parse(fs.readFileSync(configFile, 'utf8'));
                this.config = this.mergeDeep(this.getDefaultConfig(), saved);
                console.log('✅ 設定已載入:', configFile);
            } catch (err) {
                console.error('❌ 載入設定失敗:', err.message);
                this.config = this.getDefaultConfig();
            }
        } else {
            this.config = this.getDefaultConfig();
            this.saveAllConfigs();
            console.log('✅ 已建立預設設定');
        }
    }

    saveAllConfigs() {
        const configFile = path.join(this.configPath, 'settings.json');
        try {
            fs.writeFileSync(configFile, JSON.stringify(this.config, null, 2), 'utf8');
            console.log('✅ 設定已儲存:', configFile);
            return true;
        } catch (err) {
            console.error('❌ 儲存設定失敗:', err.message);
            return false;
        }
    }

    // 深度合併物件
    mergeDeep(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }

    // ========================================
    // MBTI 顏色相關
    // ========================================
    getMBTIColorGroups() {
        return this.config.mbtiColorGroups;
    }

    setMBTIColorGroups(groups) {
        this.config.mbtiColorGroups = groups;
        return this.saveAllConfigs();
    }

    // 根據性別和 MBTI 取得對應的顏色組
    getColorsForMBTI(gender, mbti) {
        const genderKey = gender === '女性' || gender === 'female' ? 'female' : 'male';
        const groups = this.config.mbtiColorGroups[genderKey] || [];
        
        for (const group of groups) {
            if (group.assignedMBTI && group.assignedMBTI.includes(mbti)) {
                return {
                    colors: group.colors,
                    direction: group.direction,
                    groupName: group.name
                };
            }
        }
        
        // 如果沒找到，返回第一組或預設
        if (groups.length > 0) {
            return {
                colors: groups[0].colors,
                direction: groups[0].direction,
                groupName: groups[0].name
            };
        }
        
        return {
            colors: this.config.backgroundSettings.defaultColors,
            direction: 'to-bottom-right',
            groupName: '預設'
        };
    }

    // 根據 MBTI 字母取得視覺參數
    getVisualParamsForMBTI(mbti) {
        const params = this.config.mbtiVisualParams;
        if (!params.enabled || !mbti || mbti.length !== 4) {
            return {
                starCount: 60,
                shootingCount: 3,
                gradientDirection: 'to-bottom-right'
            };
        }

        const E_I = mbti[0];  // E 或 I
        const S_N = mbti[1];  // S 或 N
        const T_F = mbti[2];  // T 或 F
        const J_P = mbti[3];  // J 或 P

        let result = {
            starCount: 60,
            shootingCount: 3,
            gradientDirection: 'to-bottom-right'
        };

        // E/I 影響漸層方向
        if (params.gradientByEI) {
            result.gradientDirection = E_I === 'E' ? 'to-bottom-right' : 'to-bottom';
        }

        // T/F 影響星星數量
        if (params.starsByTF) {
            result.starCount = T_F === 'T' ? params.starsT : params.starsF;
        }

        // P/J 影響流星頻率
        if (params.shootingByPJ) {
            result.shootingCount = J_P === 'P' ? params.shootingP : params.shootingJ;
        }

        return result;
    }

    // ========================================
    // 其他設定 Getter/Setter
    // ========================================
    getCustomEnding() {
        return this.config.customEnding;
    }

    setCustomEnding(settings) {
        this.config.customEnding = { ...this.config.customEnding, ...settings };
        return this.saveAllConfigs();
    }

    getImageKeywords() {
        return this.config.imageKeywords;
    }

    setImageKeywords(keywords) {
        this.config.imageKeywords = { ...this.config.imageKeywords, ...keywords };
        return this.saveAllConfigs();
    }

    getBackgroundSettings() {
        return this.config.backgroundSettings;
    }

    setBackgroundSettings(settings) {
        this.config.backgroundSettings = { ...this.config.backgroundSettings, ...settings };
        return this.saveAllConfigs();
    }

    getNotifications() {
        return this.config.notifications;
    }

    setNotifications(settings) {
        this.config.notifications = this.mergeDeep(this.config.notifications, settings);
        return this.saveAllConfigs();
    }

    getSubtitleStyles() {
        return this.config.subtitleStyles;
    }

    setSubtitleStyles(styles) {
        this.config.subtitleStyles = { ...this.config.subtitleStyles, ...styles };
        return this.saveAllConfigs();
    }

    getTitleStyles() {
        return this.config.titleStyles;
    }

    setTitleStyles(styles) {
        this.config.titleStyles = { ...this.config.titleStyles, ...styles };
        return this.saveAllConfigs();
    }

    getSlideshowSettings() {
        return this.config.slideshowSettings;
    }

    setSlideshowSettings(settings) {
        this.config.slideshowSettings = { ...this.config.slideshowSettings, ...settings };
        return this.saveAllConfigs();
    }

    getMBTIVisualParams() {
        return this.config.mbtiVisualParams;
    }

    setMBTIVisualParams(params) {
        this.config.mbtiVisualParams = { ...this.config.mbtiVisualParams, ...params };
        return this.saveAllConfigs();
    }

    // 取得所有設定
    getAllConfig() {
        return this.config;
    }

    // 更新所有設定
    updateConfig(newConfig) {
        this.config = this.mergeDeep(this.config, newConfig);
        return this.saveAllConfigs();
    }
}

module.exports = new ConfigManager();
