/**
 * Webhook 通知管道
 * 支援多個 Webhook 端點
 */

const fetch = require('node-fetch');

module.exports = {
    /**
     * 發送 Webhook 通知
     */
    async send(config, message) {
        const endpoints = config.endpoints || [];
        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                const response = await fetch(endpoint.url, {
                    method: endpoint.method || 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(endpoint.headers || {})
                    },
                    body: JSON.stringify(message)
                });
                
                if (!response.ok) {
                    const error = await response.text();
                    results.push({
                        name: endpoint.name,
                        success: false,
                        error: `HTTP ${response.status}: ${error}`
                    });
                } else {
                    results.push({
                        name: endpoint.name,
                        success: true
                    });
                }
                
            } catch (error) {
                results.push({
                    name: endpoint.name,
                    success: false,
                    error: error.message
                });
            }
        }
        
        // 如果有任何一個失敗，記錄警告
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            console.warn(`⚠️ 部分 Webhook 發送失敗:`, failed);
        }
        
        return results;
    }
};
