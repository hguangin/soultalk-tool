/**
 * 錯誤處理模組 - 統一錯誤格式和處理
 * 提供詳細的錯誤資訊，方便除錯
 */

const logService = require('./log-service');

// ==================== 自訂錯誤類別 ====================

/**
 * 基礎應用錯誤
 */
class AppError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'AppError';
        this.code = options.code || 'UNKNOWN_ERROR';
        this.statusCode = options.statusCode || 500;
        this.category = options.category || 'system';
        this.details = options.details || {};
        this.timestamp = new Date().toISOString();
        this.suggestions = options.suggestions || [];
        
        // 保留原始錯誤堆疊
        if (options.cause) {
            this.cause = options.cause;
            this.originalMessage = options.cause.message;
            this.originalStack = options.cause.stack;
        }
        
        Error.captureStackTrace(this, this.constructor);
    }
    
    toJSON() {
        return {
            success: false,
            error: {
                code: this.code,
                message: this.message,
                category: this.category,
                details: this.details,
                suggestions: this.suggestions,
                timestamp: this.timestamp,
                ...(process.env.NODE_ENV === 'development' && {
                    stack: this.stack,
                    originalMessage: this.originalMessage
                })
            }
        };
    }
}

/**
 * API 錯誤（外部 API 呼叫失敗）
 */
class APIError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'API_ERROR',
            category: options.category || 'api'
        });
        this.name = 'APIError';
        this.apiName = options.apiName || 'Unknown API';
        this.endpoint = options.endpoint || '';
        this.httpStatus = options.httpStatus || null;
        this.responseBody = options.responseBody || null;
    }
}

/**
 * 語音識別錯誤
 */
class TranscriptionError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'TRANSCRIPTION_ERROR',
            category: 'transcription'
        });
        this.name = 'TranscriptionError';
        this.apiUsed = options.apiUsed || '';
        this.audioUrl = options.audioUrl || '';
        this.duration = options.duration || null;
    }
}

/**
 * AI 匹配錯誤
 */
class AIMatchingError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'AI_MATCHING_ERROR',
            category: 'ai-matching'
        });
        this.name = 'AIMatchingError';
        this.modelUsed = options.modelUsed || '';
        this.mode = options.mode || '';
        this.inputLength = options.inputLength || null;
    }
}

/**
 * Ragic 錯誤
 */
class RagicError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'RAGIC_ERROR',
            category: 'ragic'
        });
        this.name = 'RagicError';
        this.ragicCode = options.ragicCode || '';
        this.operation = options.operation || '';
    }
}

/**
 * 設定錯誤
 */
class ConfigError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'CONFIG_ERROR',
            category: 'config',
            statusCode: 400
        });
        this.name = 'ConfigError';
        this.configName = options.configName || '';
    }
}

/**
 * 驗證錯誤
 */
class ValidationError extends AppError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code || 'VALIDATION_ERROR',
            category: 'validation',
            statusCode: 400
        });
        this.name = 'ValidationError';
        this.field = options.field || '';
        this.value = options.value;
        this.expected = options.expected || '';
    }
}

// ==================== 錯誤處理函數 ====================

/**
 * 包裝 async 路由處理器，自動捕捉錯誤
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 解析外部 API 錯誤
 */
function parseAPIError(error, apiName, endpoint) {
    const details = {
        apiName,
        endpoint,
        originalError: error.message
    };
    
    // HTTP 錯誤
    if (error.response) {
        details.httpStatus = error.response.status;
        details.statusText = error.response.statusText;
        
        try {
            details.responseBody = error.response.data || error.response.body;
        } catch {}
    }
    
    // 網路錯誤
    if (error.code === 'ECONNREFUSED') {
        return new APIError(`無法連接到 ${apiName}：服務可能暫時不可用`, {
            ...details,
            code: 'API_CONNECTION_REFUSED',
            suggestions: [
                '檢查網路連線',
                '確認 API 服務是否正常運作',
                '稍後再試'
            ],
            cause: error
        });
    }
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
        return new APIError(`${apiName} 請求超時`, {
            ...details,
            code: 'API_TIMEOUT',
            suggestions: [
                '網路速度可能較慢',
                '檔案可能太大',
                '稍後再試'
            ],
            cause: error
        });
    }
    
    if (error.code === 'ENOTFOUND') {
        return new APIError(`無法解析 ${apiName} 的網址`, {
            ...details,
            code: 'API_DNS_ERROR',
            suggestions: [
                '檢查 API 網址是否正確',
                '檢查網路連線'
            ],
            cause: error
        });
    }
    
    // HTTP 狀態碼
    if (details.httpStatus) {
        switch (details.httpStatus) {
            case 400:
                return new APIError(`${apiName} 請求格式錯誤`, {
                    ...details,
                    code: 'API_BAD_REQUEST',
                    suggestions: ['檢查輸入資料格式'],
                    cause: error
                });
            case 401:
                return new APIError(`${apiName} 認證失敗：API Key 可能無效或已過期`, {
                    ...details,
                    code: 'API_UNAUTHORIZED',
                    suggestions: [
                        '檢查 API Key 是否正確',
                        '確認 API Key 是否已過期',
                        '在設定頁面更新 API Key'
                    ],
                    cause: error
                });
            case 403:
                return new APIError(`${apiName} 拒絕存取：權限不足`, {
                    ...details,
                    code: 'API_FORBIDDEN',
                    suggestions: [
                        '檢查 API Key 權限',
                        '確認帳號是否有足夠的配額'
                    ],
                    cause: error
                });
            case 404:
                return new APIError(`${apiName} 找不到資源`, {
                    ...details,
                    code: 'API_NOT_FOUND',
                    suggestions: ['檢查 API 端點是否正確'],
                    cause: error
                });
            case 429:
                return new APIError(`${apiName} 請求頻率超過限制`, {
                    ...details,
                    code: 'API_RATE_LIMITED',
                    suggestions: [
                        '請稍後再試',
                        '考慮升級 API 方案'
                    ],
                    cause: error
                });
            case 500:
            case 502:
            case 503:
            case 504:
                return new APIError(`${apiName} 服務暫時不可用`, {
                    ...details,
                    code: 'API_SERVER_ERROR',
                    suggestions: [
                        'API 服務可能正在維護',
                        '請稍後再試'
                    ],
                    cause: error
                });
        }
    }
    
    // 一般錯誤
    return new APIError(`${apiName} 發生錯誤: ${error.message}`, {
        ...details,
        cause: error
    });
}

/**
 * Express 錯誤處理中介軟體
 */
function errorHandler(err, req, res, next) {
    // 記錄錯誤
    const logDetails = {
        method: req.method,
        url: req.url,
        body: req.body,
        query: req.query,
        params: req.params,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    };
    
    if (err instanceof AppError) {
        logService.error(err.category, err.message, {
            ...logDetails,
            code: err.code,
            details: err.details,
            stack: err.stack
        });
        
        return res.status(err.statusCode).json(err.toJSON());
    }
    
    // 未知錯誤
    logService.fatal('system', `未預期的錯誤: ${err.message}`, {
        ...logDetails,
        stack: err.stack
    });
    
    res.status(500).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: '伺服器內部錯誤',
            details: {
                originalMessage: err.message,
                ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
            },
            suggestions: [
                '請稍後再試',
                '如果問題持續，請聯繫技術支援'
            ],
            timestamp: new Date().toISOString()
        }
    });
}

/**
 * 格式化錯誤給前端顯示
 */
function formatErrorForDisplay(error) {
    if (error instanceof AppError) {
        let message = `❌ ${error.message}`;
        
        if (error.suggestions && error.suggestions.length > 0) {
            message += '\n\n💡 建議：\n' + error.suggestions.map(s => `• ${s}`).join('\n');
        }
        
        if (error.details && Object.keys(error.details).length > 0) {
            message += '\n\n📋 詳細資訊：\n';
            for (const [key, value] of Object.entries(error.details)) {
                if (typeof value === 'string' || typeof value === 'number') {
                    message += `• ${key}: ${value}\n`;
                }
            }
        }
        
        return message;
    }
    
    return `❌ ${error.message || '發生未知錯誤'}`;
}

// ==================== 錯誤碼對照表 ====================

const ERROR_CODES = {
    // 系統錯誤
    UNKNOWN_ERROR: { message: '未知錯誤', category: 'system' },
    INTERNAL_ERROR: { message: '內部錯誤', category: 'system' },
    
    // API 錯誤
    API_ERROR: { message: 'API 呼叫失敗', category: 'api' },
    API_CONNECTION_REFUSED: { message: '無法連接到 API', category: 'api' },
    API_TIMEOUT: { message: 'API 請求超時', category: 'api' },
    API_DNS_ERROR: { message: '無法解析 API 網址', category: 'api' },
    API_BAD_REQUEST: { message: 'API 請求格式錯誤', category: 'api' },
    API_UNAUTHORIZED: { message: 'API 認證失敗', category: 'api' },
    API_FORBIDDEN: { message: 'API 拒絕存取', category: 'api' },
    API_NOT_FOUND: { message: 'API 資源不存在', category: 'api' },
    API_RATE_LIMITED: { message: 'API 請求頻率超限', category: 'api' },
    API_SERVER_ERROR: { message: 'API 服務錯誤', category: 'api' },
    
    // 語音識別錯誤
    TRANSCRIPTION_ERROR: { message: '語音識別失敗', category: 'transcription' },
    TRANSCRIPTION_AUDIO_NOT_FOUND: { message: '找不到音頻檔案', category: 'transcription' },
    TRANSCRIPTION_AUDIO_INVALID: { message: '音頻格式無效', category: 'transcription' },
    TRANSCRIPTION_AUDIO_TOO_LONG: { message: '音頻時間過長', category: 'transcription' },
    TRANSCRIPTION_NO_SPEECH: { message: '未偵測到語音', category: 'transcription' },
    TRANSCRIPTION_LANGUAGE_ERROR: { message: '語言識別錯誤', category: 'transcription' },
    
    // AI 匹配錯誤
    AI_MATCHING_ERROR: { message: 'AI 匹配失敗', category: 'ai-matching' },
    AI_MATCHING_PARSE_ERROR: { message: 'AI 回應解析失敗', category: 'ai-matching' },
    AI_MATCHING_TIMEOUT: { message: 'AI 處理超時', category: 'ai-matching' },
    AI_MATCHING_EMPTY_RESULT: { message: 'AI 回傳空結果', category: 'ai-matching' },
    AI_MATCHING_INVALID_FORMAT: { message: 'AI 回傳格式錯誤', category: 'ai-matching' },
    
    // Ragic 錯誤
    RAGIC_ERROR: { message: 'Ragic 操作失敗', category: 'ragic' },
    RAGIC_NOT_FOUND: { message: '找不到 Ragic 記錄', category: 'ragic' },
    RAGIC_FIELD_MISSING: { message: 'Ragic 欄位缺失', category: 'ragic' },
    RAGIC_CONNECTION_ERROR: { message: '無法連接 Ragic', category: 'ragic' },
    RAGIC_AUTH_ERROR: { message: 'Ragic 認證失敗', category: 'ragic' },
    
    // 設定錯誤
    CONFIG_ERROR: { message: '設定錯誤', category: 'config' },
    CONFIG_NOT_FOUND: { message: '找不到設定檔', category: 'config' },
    CONFIG_INVALID: { message: '設定格式無效', category: 'config' },
    CONFIG_SAVE_ERROR: { message: '設定儲存失敗', category: 'config' },
    
    // 驗證錯誤
    VALIDATION_ERROR: { message: '驗證失敗', category: 'validation' },
    VALIDATION_REQUIRED: { message: '必填欄位缺失', category: 'validation' },
    VALIDATION_FORMAT: { message: '格式錯誤', category: 'validation' },
    VALIDATION_RANGE: { message: '數值超出範圍', category: 'validation' }
};

module.exports = {
    AppError,
    APIError,
    TranscriptionError,
    AIMatchingError,
    RagicError,
    ConfigError,
    ValidationError,
    asyncHandler,
    parseAPIError,
    errorHandler,
    formatErrorForDisplay,
    ERROR_CODES
};
