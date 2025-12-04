/**
 * ============================================================================
 * 🎬 SoulTalk Tool 主頁面 JavaScript
 * ============================================================================
 */

// ========== DOM 元素 ==========
const jobType = document.getElementById('jobType');
const ragicCode = document.getElementById('ragicCode');
const inputTitle = document.getElementById('inputTitle');
const inputArtist = document.getElementById('inputArtist');
const inputAudioUrl = document.getElementById('inputAudioUrl');
const inputLyrics = document.getElementById('inputLyrics');
const inputImages = document.getElementById('inputImages');
const btnStart = document.getElementById('btnStart');

const runningSection = document.getElementById('runningSection');
const runningName = document.getElementById('runningName');
const runningStatus = document.getElementById('runningStatus');
const runningProgress = document.getElementById('runningProgress');
const runningStep = document.getElementById('runningStep');
const btnPause = document.getElementById('btnPause');
const btnCancel = document.getElementById('btnCancel');

const jobList = document.getElementById('jobList');
const toast = document.getElementById('toast');

// ========== 狀態 ==========
let currentJobId = null;
let eventSource = null;

// ========== 初始化 ==========
async function init() {
    // 載入工作歷史
    await loadJobs();
    
    // 綁定事件
    btnStart.addEventListener('click', startJob);
    btnPause.addEventListener('click', pauseJob);
    btnCancel.addEventListener('click', cancelJob);
    
    // 每 5 秒重新載入工作列表
    setInterval(loadJobs, 5000);
}

// ========== 開始工作 ==========
async function startJob() {
    const type = jobType.value;
    const code = ragicCode.value.trim();
    
    // 收集手動輸入的資料
    const data = {};
    if (inputTitle.value.trim()) data.title = inputTitle.value.trim();
    if (inputArtist.value.trim()) data.artist = inputArtist.value.trim();
    if (inputAudioUrl.value.trim()) data.audioUrl = inputAudioUrl.value.trim();
    if (inputLyrics.value.trim()) data.lyrics = inputLyrics.value.trim();
    if (inputImages.value.trim()) data.images = inputImages.value.trim();
    
    // 驗證
    if (!code && !data.audioUrl) {
        showToast('請輸入 Ragic 代碼或音頻 URL', 'error');
        return;
    }
    
    if (!code && !data.lyrics) {
        showToast('請輸入 Ragic 代碼或歌詞/字幕', 'error');
        return;
    }
    
    try {
        btnStart.disabled = true;
        btnStart.textContent = '建立中...';
        
        const res = await fetch('/api/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                ragicCode: code || null,
                data: Object.keys(data).length > 0 ? data : null
            })
        });
        
        const result = await res.json();
        
        if (result.success) {
            showToast('✅ 工作已建立', 'success');
            currentJobId = result.job.id;
            
            // 顯示執行中區塊
            showRunningJob(result.job);
            
            // 開始監聽狀態
            startStatusStream(result.job.id);
            
            // 清空表單
            ragicCode.value = '';
            inputTitle.value = '';
            inputArtist.value = '';
            inputAudioUrl.value = '';
            inputLyrics.value = '';
            inputImages.value = '';
            
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    } finally {
        btnStart.disabled = false;
        btnStart.textContent = '🚀 開始執行';
    }
}

// ========== 顯示執行中的工作 ==========
function showRunningJob(job) {
    runningSection.style.display = 'block';
    updateRunningJob(job);
}

function updateRunningJob(job) {
    runningName.textContent = job.name;
    runningStatus.textContent = getStatusText(job.status);
    runningStatus.className = `job-status ${job.status}`;
    runningProgress.style.width = `${job.progress || 0}%`;
    runningStep.textContent = job.current_step || '準備中...';
    
    // 更新按鈕狀態
    const isRunning = job.status === 'running';
    const isPaused = job.status === 'paused';
    
    btnPause.textContent = isPaused ? '▶️ 繼續' : '⏸️ 暫停';
    btnPause.disabled = !isRunning && !isPaused;
    btnCancel.disabled = !isRunning && !isPaused;
    
    // 如果完成或失敗，隱藏執行區塊
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
        setTimeout(() => {
            runningSection.style.display = 'none';
            loadJobs();
        }, 2000);
    }
}

// ========== 監聽工作狀態 ==========
function startStatusStream(jobId) {
    // 關閉舊的連線
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource(`/api/jobs/${jobId}/stream`);
    
    eventSource.onmessage = (event) => {
        const job = JSON.parse(event.data);
        updateRunningJob(job);
        
        // 如果結束，關閉連線
        if (['completed', 'failed', 'cancelled'].includes(job.status)) {
            eventSource.close();
            eventSource = null;
        }
    };
    
    eventSource.onerror = () => {
        eventSource.close();
        eventSource = null;
    };
}

// ========== 暫停/繼續工作 ==========
async function pauseJob() {
    if (!currentJobId) return;
    
    const job = await getJob(currentJobId);
    const isPaused = job?.status === 'paused';
    
    try {
        const endpoint = isPaused ? 'resume' : 'pause';
        const res = await fetch(`/api/jobs/${currentJobId}/${endpoint}`, { method: 'POST' });
        const result = await res.json();
        
        if (result.success) {
            showToast(isPaused ? '▶️ 已繼續' : '⏸️ 已暫停', 'success');
            if (isPaused) {
                startStatusStream(currentJobId);
            }
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// ========== 取消工作 ==========
async function cancelJob() {
    if (!currentJobId) return;
    
    if (!confirm('確定要取消這個工作嗎？')) return;
    
    try {
        const res = await fetch(`/api/jobs/${currentJobId}/cancel`, { method: 'POST' });
        const result = await res.json();
        
        if (result.success) {
            showToast('🚫 已取消', 'success');
        } else {
            showToast('❌ ' + result.error, 'error');
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// ========== 載入工作歷史 ==========
async function loadJobs() {
    try {
        const res = await fetch('/api/jobs?limit=20');
        const data = await res.json();
        
        if (data.success) {
            renderJobs(data.jobs);
        }
    } catch (error) {
        console.error('載入工作失敗:', error);
    }
}

function renderJobs(jobs) {
    if (jobs.length === 0) {
        jobList.innerHTML = '<p class="placeholder">還沒有工作紀錄</p>';
        return;
    }
    
    jobList.innerHTML = jobs.map(job => `
        <div class="job-item" onclick="viewJob('${job.id}')">
            <div class="job-item-info">
                <div class="job-item-name">${escapeHtml(job.name)}</div>
                <div class="job-item-meta">
                    ${job.type.toUpperCase()} · 
                    ${job.duration_seconds ? formatDuration(job.duration_seconds) : '-'} · 
                    ${formatTime(job.created_at)}
                </div>
            </div>
            <span class="job-item-status ${job.status}">${getStatusText(job.status)}</span>
        </div>
    `).join('');
}

// ========== 查看工作詳情 ==========
async function viewJob(jobId) {
    try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        
        if (data.success) {
            const job = data.job;
            const logs = data.logs;
            
            // 簡單顯示（之後可以做成 modal）
            let message = `工作: ${job.name}\n`;
            message += `狀態: ${getStatusText(job.status)}\n`;
            message += `耗時: ${job.duration_seconds ? formatDuration(job.duration_seconds) : '-'}\n\n`;
            
            if (job.error_message) {
                message += `錯誤: ${job.error_message}\n\n`;
            }
            
            message += `步驟:\n`;
            logs.forEach(log => {
                const icon = log.status === 'completed' ? '✅' : 
                            log.status === 'failed' ? '❌' : '🔄';
                message += `${icon} ${log.step}\n`;
            });
            
            alert(message);
        }
    } catch (error) {
        showToast('❌ ' + error.message, 'error');
    }
}

// ========== 工具函數 ==========
async function getJob(jobId) {
    try {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        return data.success ? data.job : null;
    } catch {
        return null;
    }
}

function getStatusText(status) {
    const texts = {
        pending: '等待中',
        running: '執行中',
        completed: '已完成',
        failed: '失敗',
        paused: '已暫停',
        cancelled: '已取消'
    };
    return texts[status] || status;
}

function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
}

function formatTime(timeStr) {
    if (!timeStr) return '-';
    const date = new Date(timeStr);
    return date.toLocaleString('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ========== 啟動 ==========
init();
