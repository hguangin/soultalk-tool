/**
 * ============================================================================
 * 🎬 工作執行器 (job-runner.js)
 * ============================================================================
 * 
 * 🎯 這個檔案是什麼？
 *    這是整個系統的「大腦」！
 *    負責執行完整的處理流程：
 *    1. 讀取 Ragic（如果有代碼）
 *    2. 智能分行（語音模式）
 *    3. 語音識別
 *    4. AI 匹配
 *    5. AI 校正（可選）
 *    6. 生成 JSON
 *    7. 上傳 Ragic
 *    8. 發送通知
 * 
 *    支援：
 *    - ⏸️ 暫停/繼續
 *    - 🚫 取消
 *    - 🔄 自動重試
 * 
 * 📝 工作狀態：
 *    - pending: 等待中
 *    - running: 執行中
 *    - completed: 已完成
 *    - failed: 失敗
 *    - paused: 已暫停
 *    - cancelled: 已取消
 * 
 * ============================================================================
 */

const { v4: uuidv4 } = require('uuid');

class JobRunner {
    /**
     * @param {Object} db - 資料庫模組
     * @param {Object} services - 其他服務
     */
    constructor(db, services) {
        this.db = db;
        this.services = services;
        
        // 活動中的工作狀態
        // key: jobId, value: { paused: false, cancelled: false }
        this.activeJobs = new Map();
    }


    // ========================================================================
    // 🚀 建立並執行工作
    // ========================================================================

    /**
     * 建立並執行工作
     * 
     * @param {Object} options - 工作選項
     *   - name: 工作名稱（可選，預設自動生成）
     *   - type: 類型，'mv' 或 'audio'
     *   - ragicCode: Ragic 代碼（可選，如果有會從 Ragic 讀取資料）
     *   - data: 直接提供的資料（可選）
     *   - overrides: 覆蓋 Ragic 資料的欄位（可選）
     * 
     * @returns {Object} 工作物件
     * 
     * 使用範例：
     *   // 用 Ragic 代碼
     *   await jobRunner.createAndRun({ type: 'mv', ragicCode: 'Efji6e' });
     *   
     *   // 直接提供資料
     *   await jobRunner.createAndRun({ type: 'mv', data: { title: '...', audioUrl: '...' } });
     *   
     *   // Ragic + 覆蓋部分資料
     *   await jobRunner.createAndRun({ type: 'mv', ragicCode: 'Efji6e', overrides: { audioUrl: '...' } });
     */
    async createAndRun(options) {
        const { type = 'mv', ragicCode, data = {}, overrides = {} } = options;
        
        // 生成工作 ID 和名稱
        const jobId = uuidv4();
        const name = options.name || `${type.toUpperCase()}-${ragicCode || 'manual'}-${Date.now()}`;
        
        // 建立工作記錄
        const job = this.db.jobs.create(jobId, name, type, ragicCode, { data, overrides });
        console.log(`📋 工作已建立: ${name} (${jobId})`);

        // 非同步執行（不阻塞）
        this.runJob(jobId, type, ragicCode, data, overrides).catch(error => {
            console.error(`❌ 工作執行失敗: ${error.message}`);
        });

        return job;
    }


    // ========================================================================
    // 🎬 執行工作
    // ========================================================================

    async runJob(jobId, type, ragicCode, inputData, overrides) {
        // 初始化狀態
        this.activeJobs.set(jobId, { paused: false, cancelled: false });
        
        // 標記開始
        this.db.jobs.start(jobId);
        const startTime = Date.now();
        
        console.log(`🚀 開始執行: ${jobId}`);
        console.log(`  類型: ${type}`);
        console.log(`  Ragic: ${ragicCode || '(無)'}`);

        try {
            let result;
            
            if (type === 'mv') {
                result = await this.runMVPipeline(jobId, ragicCode, inputData, overrides);
            } else {
                result = await this.runAudioPipeline(jobId, ragicCode, inputData, overrides);
            }

            // 完成
            this.db.jobs.complete(jobId, result);
            this.activeJobs.delete(jobId);

            // 發送成功通知
            const job = this.db.jobs.getById(jobId);
            const logs = this.db.logs.getByJob(jobId);
            await this.services.notification.notifySuccess(job, logs);

            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ 工作完成: ${jobId} (${duration}秒)`);
            
            return result;

        } catch (error) {
            const state = this.activeJobs.get(jobId);
            
            // 檢查是否是暫停
            if (state?.paused) {
                console.log(`⏸️ 工作已暫停: ${jobId}`);
                return;
            }
            
            // 檢查是否是取消
            if (state?.cancelled) {
                this.db.jobs.cancel(jobId);
                this.activeJobs.delete(jobId);
                console.log(`🚫 工作已取消: ${jobId}`);
                return;
            }

            // 真正的錯誤
            this.db.jobs.fail(jobId, error.message);
            this.activeJobs.delete(jobId);

            // 發送失敗通知
            const job = this.db.jobs.getById(jobId);
            const logs = this.db.logs.getByJob(jobId);
            await this.services.notification.notifyFailure(job, error.message, logs);

            console.error(`❌ 工作失敗: ${jobId} - ${error.message}`);
            throw error;
        }
    }


    // ========================================================================
    // 🎵 MV 處理流程
    // ========================================================================

    async runMVPipeline(jobId, ragicCode, inputData, overrides) {
        let data = { ...inputData };

        // ----- 步驟 1: 讀取 Ragic -----
        if (ragicCode) {
            data = await this.runStep(jobId, '讀取 Ragic', 5, async () => {
                const ragicData = await this.services.ragic.read(ragicCode, 'mv');
                // 合併：Ragic 資料 + 輸入資料 + 覆蓋資料
                return { ...ragicData, ...inputData, ...overrides };
            });
        } else {
            data = { ...inputData, ...overrides };
        }

        // 驗證必要資料
        if (!data.audioUrl) {
            throw new Error('缺少音頻 URL！請確認 Ragic 資料或手動提供。');
        }
        if (!data.lyrics) {
            throw new Error('缺少歌詞！請確認 Ragic 資料或手動提供。');
        }

        // ----- 步驟 2: 語音識別 -----
        const transcription = await this.runStep(jobId, '語音識別', 40, async () => {
            // 根據地區決定語言
            const language = this.getLanguageByRegion(data.region);
            const result = await this.services.transcription.transcribe(data.audioUrl, { language });
            return result.data;
        });

        // ----- 步驟 3: AI 匹配 -----
        const matchResult = await this.runStep(jobId, 'AI 匹配', 70, async () => {
            const result = await this.services.aiMatching.match(
                transcription.words,
                data.lyrics,
                'mv'
            );
            return result;
        });

        // ----- 步驟 4: AI 校正（可選） -----
        let lyricsData = matchResult.data;
        const autoCorrection = this.db.settings.get('default_auto_correction') === 'true';
        
        if (autoCorrection) {
            const correctionResult = await this.runStep(jobId, 'AI 校正', 85, async () => {
                return await this.services.aiMatching.correct(lyricsData, data.lyrics);
            });
            
            if (correctionResult.success) {
                lyricsData = correctionResult.data;
            }
        }

        // ----- 步驟 5: 生成 JSON -----
        const json = await this.runStep(jobId, '生成 JSON', 95, async () => {
            const images = this.services.textProcessor.parseImages(data.images);
            
            return this.services.textProcessor.generateJSON(lyricsData, {
                mode: 'mv',
                title: data.title,
                artist: data.artist,
                audioUrl: data.audioUrl,
                images: images,
                background: data.background,
                ragicCode: ragicCode,
                region: data.region,
            });
        });

        // ----- 步驟 6: 上傳 Ragic -----
        if (ragicCode && this.db.settings.get('default_auto_upload') === 'true') {
            await this.runStep(jobId, '上傳 Ragic', 100, async () => {
                await this.services.ragic.write(ragicCode, {
                    json: json,
                    status: '已完成',
                    processTime: this.getProcessTime(jobId)
                }, 'mv');
            });
        }

        return json;
    }


    // ========================================================================
    // 🎙️ 語音處理流程
    // ========================================================================

    async runAudioPipeline(jobId, ragicCode, inputData, overrides) {
        let data = { ...inputData };

        // ----- 步驟 1: 讀取 Ragic -----
        if (ragicCode) {
            data = await this.runStep(jobId, '讀取 Ragic', 5, async () => {
                const ragicData = await this.services.ragic.read(ragicCode, 'audio');
                return { ...ragicData, ...inputData, ...overrides };
            });
        } else {
            data = { ...inputData, ...overrides };
        }

        // 驗證
        if (!data.audioUrl && !data.finalAudioUrl) {
            throw new Error('缺少音頻 URL！');
        }
        if (!data.transcript) {
            throw new Error('缺少語音稿！');
        }

        // ----- 步驟 2: 智能分行 -----
        const processedText = await this.runStep(jobId, '智能分行', 15, async () => {
            const cleaned = this.services.textProcessor.cleanTranscript(data.transcript);
            return this.services.textProcessor.smartSplit(cleaned, 'audio');
        });

        // ----- 步驟 3: 語音識別 -----
        const audioUrl = data.audioUrl || data.finalAudioUrl;
        const transcription = await this.runStep(jobId, '語音識別', 50, async () => {
            const language = this.getLanguageByRegion(data.region);
            const result = await this.services.transcription.transcribe(audioUrl, { language });
            return result.data;
        });

        // ----- 步驟 4: AI 匹配 -----
        const matchResult = await this.runStep(jobId, 'AI 匹配', 80, async () => {
            const result = await this.services.aiMatching.match(
                transcription.words,
                processedText,
                'audio'
            );
            return result;
        });

        // ----- 步驟 5: AI 校正（可選） -----
        let lyricsData = matchResult.data;
        const autoCorrection = this.db.settings.get('default_auto_correction') === 'true';
        
        if (autoCorrection) {
            const correctionResult = await this.runStep(jobId, 'AI 校正', 90, async () => {
                return await this.services.aiMatching.correct(lyricsData, processedText);
            });
            
            if (correctionResult.success) {
                lyricsData = correctionResult.data;
            }
        }

        // ----- 步驟 6: 生成 JSON -----
        const json = await this.runStep(jobId, '生成 JSON', 95, async () => {
            return this.services.textProcessor.generateJSON(lyricsData, {
                mode: 'audio',
                title: data.title,
                speaker: data.speaker,
                audioUrl: data.finalAudioUrl || data.audioUrl,
                mergedAudioUrl: data.mergedAudioUrl,
                images: { full: data.imageUrl ? [data.imageUrl] : [] },
                background: data.background,
                ragicCode: ragicCode,
                region: data.region,
            });
        });

        // ----- 步驟 7: 上傳 Ragic -----
        if (ragicCode && this.db.settings.get('default_auto_upload') === 'true') {
            await this.runStep(jobId, '上傳 Ragic', 100, async () => {
                await this.services.ragic.write(ragicCode, {
                    json: json,
                    status: '已完成',
                    processTime: this.getProcessTime(jobId)
                }, 'audio');
            });
        }

        return json;
    }


    // ========================================================================
    // 🔧 步驟執行器
    // ========================================================================

    /**
     * 執行單一步驟
     * 會自動記錄日誌、檢查暫停/取消
     */
    async runStep(jobId, stepName, progress, fn) {
        // 檢查是否暫停或取消
        const state = this.activeJobs.get(jobId);
        if (state?.paused) {
            throw new Error('已暫停');
        }
        if (state?.cancelled) {
            throw new Error('已取消');
        }

        // 更新狀態
        this.db.jobs.updateStatus(jobId, 'running', stepName, progress);
        
        // 記錄開始
        const startTime = Date.now();
        this.db.logs.add(jobId, stepName, 'started', `開始執行: ${stepName}`);
        console.log(`  📍 ${stepName}...`);

        try {
            // 執行步驟
            const result = await fn();
            
            // 記錄完成
            const duration = Date.now() - startTime;
            this.db.logs.add(jobId, stepName, 'completed', `完成: ${stepName}`, null, 0, duration);
            console.log(`  ✅ ${stepName} 完成 (${(duration/1000).toFixed(1)}秒)`);
            
            return result;

        } catch (error) {
            // 記錄失敗
            const duration = Date.now() - startTime;
            this.db.logs.add(jobId, stepName, 'failed', error.message, null, 0, duration);
            throw error;
        }
    }


    // ========================================================================
    // ⏸️ 暫停/繼續/取消
    // ========================================================================

    /**
     * 暫停工作
     */
    pause(jobId) {
        const state = this.activeJobs.get(jobId);
        if (state) {
            state.paused = true;
            this.db.jobs.pause(jobId);
            console.log(`⏸️ 工作已標記為暫停: ${jobId}`);
            
            // 發送暫停通知
            const job = this.db.jobs.getById(jobId);
            this.services.notification.notifyPause(job);
        }
    }

    /**
     * 繼續工作
     */
    async resume(jobId) {
        const job = this.db.jobs.getById(jobId);
        if (!job || job.status !== 'paused') {
            throw new Error('工作不存在或不是暫停狀態');
        }

        // 重新開始整個流程
        const inputData = JSON.parse(job.input_data || '{}');
        this.runJob(jobId, job.type, job.ragic_code, inputData.data || {}, inputData.overrides || {});
    }

    /**
     * 取消工作
     */
    cancel(jobId) {
        const state = this.activeJobs.get(jobId);
        if (state) {
            state.cancelled = true;
            console.log(`🚫 工作已標記為取消: ${jobId}`);
        }
    }


    // ========================================================================
    // 🛠️ 工具函數
    // ========================================================================

    /**
     * 根據地區取得語言代碼
     */
    getLanguageByRegion(region) {
        if (!region) return 'auto';
        
        try {
            const regionsList = JSON.parse(this.db.settings.get('regions_list') || '[]');
            const found = regionsList.find(r => r.id === region);
            return found?.language || 'auto';
        } catch {
            return 'auto';
        }
    }

    /**
     * 取得處理時間文字
     */
    getProcessTime(jobId) {
        const job = this.db.jobs.getById(jobId);
        if (!job || !job.started_at) return '未知';
        
        const start = new Date(job.started_at).getTime();
        const seconds = Math.round((Date.now() - start) / 1000);
        
        if (seconds < 60) return `${seconds}秒`;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}分${secs}秒`;
    }
}

module.exports = JobRunner;
