const { getProducts, getSettings, getEffectiveInterval, addLog } = require('./storage');

/**
 * Task Queue Engine for Product Stock Checks
 * 
 * Features:
 * - Priority Queue for user manual checks ("Check ngay", "Check tất cả", newly added products)
 * - Due Queue based on each product's individual effective interval (custom or default)
 * - Sequential execution (Concurrency = 1) with safe pacing delay (600ms) to avoid rate limits / anti-bot
 * - Real-time queue status & countdown calculation
 */

class StockQueueEngine {
    constructor() {
        this.priorityQueue = []; // Array of product IDs to be checked immediately
        this.runningJobs = new Set(); // Currently processing product IDs
        this.nextCheckMap = new Map(); // productId -> timestamp (ms)
        this.currentlyChecking = null; // { id, title, platform, startTime }
        this.isProcessing = false;
        this.timer = null;
        this.pacingDelayMs = 600; // Pacing delay between scrapings
        this.checkProductHandler = null; // Injected from monitor.js to avoid circular require
    }

    /**
     * Inject the execution function from monitor.js
     */
    setCheckHandler(fn) {
        this.checkProductHandler = fn;
    }

    /**
     * Enqueue a product for checking
     * @param {string} productId 
     * @param {boolean} isPriority If true, immediately check via priority queue
     */
    enqueue(productId, isPriority = false) {
        if (isPriority) {
            if (!this.priorityQueue.includes(productId) && !this.runningJobs.has(productId)) {
                this.priorityQueue.push(productId);
            }
        } else {
            this.nextCheckMap.set(productId, Date.now());
        }
    }

    /**
     * Enqueue all products
     */
    enqueueAll(isPriority = true) {
        const products = getProducts();
        for (const p of products) {
            this.enqueue(p.id, isPriority);
        }
        addLog('info', `[QUEUE] Đã thêm ${products.length} sản phẩm vào hàng đợi ưu tiên`);
    }

    /**
     * Initialize or update schedules for all products
     */
    initSchedules() {
        const products = getProducts();
        const settings = getSettings();
        const now = Date.now();

        for (const p of products) {
            if (!this.nextCheckMap.has(p.id)) {
                if (p.lastChecked) {
                    const intervalSec = getEffectiveInterval(p, settings);
                    const lastMs = new Date(p.lastChecked).getTime();
                    const nextTime = lastMs + (intervalSec * 1000);
                    this.nextCheckMap.set(p.id, Math.max(now, nextTime));
                } else {
                    // Not yet checked, schedule immediately
                    this.nextCheckMap.set(p.id, now);
                }
            }
        }
    }

    /**
     * Update product schedule when its interval setting is modified
     */
    updateProductInterval(productId, newIntervalSeconds) {
        const products = getProducts();
        const p = products.find(prod => prod.id === productId);
        if (!p) return;

        const settings = getSettings();
        const effectiveSec = (newIntervalSeconds && newIntervalSeconds > 0)
            ? Number(newIntervalSeconds)
            : getEffectiveInterval(p, settings);

        const now = Date.now();
        const lastMs = p.lastChecked ? new Date(p.lastChecked).getTime() : now;
        const nextTime = Math.max(now, lastMs + (effectiveSec * 1000));
        this.nextCheckMap.set(productId, nextTime);
    }

    /**
     * Run a product check immediately (used for on-demand manual check)
     * Waits if a job is currently scraping, marks running, executes, and reschedules.
     */
    async runJobNow(product) {
        const startWait = Date.now();
        while (this.isProcessing && (Date.now() - startWait < 30000)) {
            await new Promise(r => setTimeout(r, 250));
        }

        this.isProcessing = true;
        this.runningJobs.add(product.id);
        this.currentlyChecking = {
            id: product.id,
            title: product.title,
            platform: product.platform,
            startTime: Date.now(),
            isPriority: true
        };

        try {
            if (this.checkProductHandler) {
                return await this.checkProductHandler(product, true);
            }
        } finally {
            const refreshedSettings = getSettings();
            const effectiveSec = getEffectiveInterval(product, refreshedSettings);
            this.nextCheckMap.set(product.id, Date.now() + (effectiveSec * 1000));

            this.priorityQueue = this.priorityQueue.filter(id => id !== product.id);
            this.runningJobs.delete(product.id);
            this.currentlyChecking = null;

            await new Promise(resolve => setTimeout(resolve, this.pacingDelayMs));
            this.isProcessing = false;
        }
    }

    /**
     * Start worker loop
     */
    start() {
        if (this.timer) {
            clearInterval(this.timer);
        }

        this.initSchedules();

        // Worker ticks every 1000ms
        this.timer = setInterval(() => {
            this.tick();
        }, 1000);

        addLog('info', '[QUEUE] Bộ máy hàng đợi (Task Queue) đã khởi động');
    }

    /**
     * Stop worker loop
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Worker Tick: Process jobs sequentially
     */
    async tick() {
        if (this.isProcessing) {
            return; // Busy with current job
        }

        const settings = getSettings();
        const products = getProducts();
        const now = Date.now();

        // Clean up deleted products from nextCheckMap
        const validIds = new Set(products.map(p => p.id));
        for (const id of this.nextCheckMap.keys()) {
            if (!validIds.has(id)) {
                this.nextCheckMap.delete(id);
            }
        }

        let targetProduct = null;
        let isPriority = false;

        // 1. First priority: Check Priority Queue (Manual triggers, check all, new products)
        while (this.priorityQueue.length > 0 && !targetProduct) {
            const candidateId = this.priorityQueue.shift();
            const found = products.find(p => p.id === candidateId);
            if (found && !this.runningJobs.has(found.id)) {
                targetProduct = found;
                isPriority = true;
                break;
            }
        }

        // 2. Second priority: Due Queue (Products whose nextCheckTimestamp <= now)
        if (!targetProduct && settings.autoCheckEnabled) {
            let earliestDue = null;
            let earliestTime = Infinity;

            for (const p of products) {
                if (this.runningJobs.has(p.id)) continue;

                let dueTime = this.nextCheckMap.get(p.id);
                if (dueTime === undefined) {
                    const intervalSec = getEffectiveInterval(p, settings);
                    dueTime = p.lastChecked ? (new Date(p.lastChecked).getTime() + (intervalSec * 1000)) : now;
                    this.nextCheckMap.set(p.id, dueTime);
                }

                if (dueTime <= now && dueTime < earliestTime) {
                    earliestTime = dueTime;
                    earliestDue = p;
                }
            }

            if (earliestDue) {
                targetProduct = earliestDue;
                isPriority = false;
            }
        }

        // If no product needs checking, idle
        if (!targetProduct) {
            return;
        }

        // Execute task
        this.isProcessing = true;
        this.runningJobs.add(targetProduct.id);
        this.currentlyChecking = {
            id: targetProduct.id,
            title: targetProduct.title,
            platform: targetProduct.platform,
            startTime: Date.now(),
            isPriority
        };

        try {
            if (this.checkProductHandler) {
                await this.checkProductHandler(targetProduct, isPriority);
            }
        } catch (err) {
            addLog('error', `[QUEUE] Lỗi khi xử lý hàng đợi cho ${targetProduct.title}: ${err.message}`);
        } finally {
            // Recalculate next check time
            const refreshedSettings = getSettings();
            const effectiveSec = getEffectiveInterval(targetProduct, refreshedSettings);
            this.nextCheckMap.set(targetProduct.id, Date.now() + (effectiveSec * 1000));

            this.runningJobs.delete(targetProduct.id);
            this.currentlyChecking = null;

            // Safe pacing delay before unlocking worker to next item
            await new Promise(resolve => setTimeout(resolve, this.pacingDelayMs));
            this.isProcessing = false;
        }
    }

    /**
     * Get detailed status of the queue for frontend UI
     */
    getStatus() {
        const products = getProducts();
        const settings = getSettings();
        const now = Date.now();

        const productStatuses = products.map(p => {
            const effectiveInterval = getEffectiveInterval(p, settings);
            const isCustom = Boolean(p.checkIntervalSeconds && Number(p.checkIntervalSeconds) > 0);
            const nextTimestamp = this.nextCheckMap.get(p.id) || null;
            const secondsUntil = nextTimestamp ? Math.max(0, Math.round((nextTimestamp - now) / 1000)) : 0;
            const isRunning = this.runningJobs.has(p.id);
            const isPriority = this.priorityQueue.includes(p.id);

            return {
                id: p.id,
                title: p.title,
                platform: p.platform,
                effectiveInterval,
                isCustomInterval: isCustom,
                checkIntervalSeconds: p.checkIntervalSeconds || null,
                lastChecked: p.lastChecked,
                nextCheckTimestamp: nextTimestamp,
                secondsUntilNextCheck: isRunning ? 0 : secondsUntil,
                isPendingPriority: isPriority,
                isRunning
            };
        });

        return {
            isProcessing: this.isProcessing,
            currentlyChecking: this.currentlyChecking,
            priorityQueueLength: this.priorityQueue.length,
            runningCount: this.runningJobs.size,
            globalIntervalSeconds: settings.checkIntervalSeconds || ((settings.checkIntervalMinutes || 5) * 60),
            autoCheckEnabled: settings.autoCheckEnabled,
            products: productStatuses
        };
    }
}

// Singleton Queue Instance
const stockQueue = new StockQueueEngine();

module.exports = {
    stockQueue,
    StockQueueEngine
};
