document.addEventListener('DOMContentLoaded', () => {
    // State
    let productsList = [];
    let currentSettings = {};
    let currentQueue = null;

    // DOM Elements
    const productsTableBody = document.getElementById('productsTableBody');
    const statTotal = document.getElementById('statTotal');
    const statInStock = document.getElementById('statInStock');
    const statOutOfStock = document.getElementById('statOutOfStock');
    const statTelegramStatus = document.getElementById('statTelegramStatus');
    const productCountBadge = document.getElementById('productCountBadge');
    const autoCheckStatus = document.getElementById('autoCheckStatus');
    const autoCheckText = document.getElementById('autoCheckText');
    const queueStatusIndicator = document.getElementById('queueStatusIndicator');
    const queueStatusText = document.getElementById('queueStatusText');
    const logConsole = document.getElementById('logConsole');

    // Tab Management
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const target = btn.getAttribute('data-tab');
            document.getElementById(target).classList.add('active');
        });
    });

    // Helper: Toast notification
    function showToast(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-circle-check text-success' : 'fa-circle-info text-primary';
        toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(12px) scale(0.95)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // Helper: Format Duration (seconds to human string)
    function formatDuration(seconds) {
        if (seconds <= 0) return 'ngay bây giờ';
        if (seconds < 60) return `${seconds}s`;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return s > 0 ? `${m}m ${s}s` : `${m}m`;
    }

    // Helper: Format Price
    function formatVND(price) {
        if (!price || isNaN(price)) return '---';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    }

    // Helper: Format Date
    function formatDate(isoString) {
        if (!isoString) return 'Chưa check';
        const date = new Date(isoString);
        return date.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) + ' ' + date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    }

    // Fetch Overview Status & Queue
    async function loadStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            
            statTotal.textContent = data.totalProducts;
            statInStock.textContent = data.inStockCount;
            statOutOfStock.textContent = data.outOfStockCount;
            
            if (data.telegramConfigured) {
                statTelegramStatus.textContent = 'Đã Kết Nối';
                statTelegramStatus.className = 'stat-value text-success';
            } else {
                statTelegramStatus.textContent = 'Chưa cấu hình';
                statTelegramStatus.className = 'stat-value text-danger';
            }

            if (data.autoCheckEnabled) {
                const sec = currentSettings.checkIntervalSeconds || ((data.checkIntervalMinutes || 5) * 60);
                const label = sec < 60 ? `${sec} giây/lần` : `${Math.round(sec / 60)} phút/lần`;
                autoCheckText.textContent = `Tự động check: ${label}`;
                autoCheckStatus.style.display = 'inline-flex';
            } else {
                autoCheckStatus.style.display = 'none';
            }

            // Update Queue Status Widget
            if (data.queue) {
                currentQueue = data.queue;
                if (queueStatusIndicator && queueStatusText) {
                    if (data.queue.isProcessing && data.queue.currentlyChecking) {
                        queueStatusIndicator.className = 'queue-badge busy';
                        const shortTitle = data.queue.currentlyChecking.title.length > 22
                            ? data.queue.currentlyChecking.title.substring(0, 20) + '...'
                            : data.queue.currentlyChecking.title;
                        queueStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang check: ${shortTitle}`;
                    } else if (data.queue.priorityQueueLength > 0) {
                        queueStatusIndicator.className = 'queue-badge busy';
                        queueStatusText.innerHTML = `<i class="fa-solid fa-layer-group"></i> Hàng đợi: ${data.queue.priorityQueueLength} đang chờ`;
                    } else {
                        queueStatusIndicator.className = 'queue-badge';
                        queueStatusText.innerHTML = `<i class="fa-solid fa-layer-group"></i> Hàng đợi: Sẵn sàng`;
                    }
                }
            }
        } catch (err) {
            console.error('Lỗi khi tải trạng thái:', err);
        }
    }

    // Fetch Monitored Products
    async function loadProducts() {
        try {
            const res = await fetch('/api/products');
            productsList = await res.json();
            renderProductsTable(productsList);
        } catch (err) {
            console.error('Lỗi khi tải danh sách sản phẩm:', err);
        }
    }

    // Helper: Build row inner HTML
    function buildRowInnerHtml(p, globalSec, qItem) {
        const platformClass = `platform-${p.platform}`;
        const platformNames = { tiki: 'Tiki', azvietnam: 'AZ Vietnam', fahasa: 'Fahasa', nobita: 'Nobita.vn', shopee: 'Shopee' };
        const platformLabel = platformNames[p.platform] || p.platform.toUpperCase();

        // Status Pill
        let statusPill = `<span class="pill pill-warning"><i class="fa-solid fa-clock"></i> Chờ check</span>`;
        if (p.lastStatus === 'in_stock') {
            statusPill = `<span class="pill pill-success"><i class="fa-solid fa-check"></i> CÒN HÀNG</span>`;
        } else if (p.lastStatus === 'out_of_stock') {
            statusPill = `<span class="pill pill-danger"><i class="fa-solid fa-xmark"></i> HẾT HÀNG</span>`;
        } else if (p.lastStatus === 'error') {
            statusPill = `<span class="pill pill-danger" title="${p.lastError || ''}"><i class="fa-solid fa-triangle-exclamation"></i> LỖI CÀO</span>`;
        }

        // Image
        const DEFAULT_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'><rect width='60' height='60' fill='%23334155' rx='6'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='12' font-family='sans-serif'>Book</text></svg>";
        const imgUrl = (p.lastData && p.lastData.image) ? p.lastData.image : DEFAULT_IMG;

        // Target variant badge
        const targetVarBadge = (p.targetVariant && p.targetVariant !== 'all') 
            ? `<br><small class="text-primary">🎯 Lọc: ${p.targetVariant}</small>`
            : '';

        // Variants Render
        let variantsHtml = '<span class="text-muted">Mặc định</span>';
        if (p.lastData && p.lastData.variants && p.lastData.variants.length > 0) {
            variantsHtml = `<div class="variant-list">` + 
                p.lastData.variants.map(v => {
                    const vClass = v.available ? 'available' : 'unavailable';
                    const qtyText = (v.available && typeof v.stockQty === 'number' && v.stockQty > 0) ? ` ${v.stockQty}` : '';
                    const vStatus = v.available ? `✓ Còn${qtyText}` : '✗ Hết';
                    return `<span class="variant-pill ${vClass}">${v.title}: ${formatVND(v.price)} (${vStatus})</span>`;
                }).join('') + 
                `</div>`;
        }

        const speed = (p.lastData && p.lastData.responseTimeMs) ? `${p.lastData.responseTimeMs}ms` : '---';
        const isCustom = Boolean(p.checkIntervalSeconds && Number(p.checkIntervalSeconds) > 0);
        const currentIntervalSec = isCustom ? Number(p.checkIntervalSeconds) : globalSec;

        // Next check pill
        let nextCheckPill = '';
        if (qItem && qItem.isRunning) {
            nextCheckPill = `<span class="pill-countdown running"><i class="fa-solid fa-spinner fa-spin"></i> Đang check...</span>`;
        } else if (qItem && qItem.isPendingPriority) {
            nextCheckPill = `<span class="pill-countdown priority"><i class="fa-solid fa-bolt"></i> Trong hàng đợi</span>`;
        } else if (qItem && qItem.secondsUntilNextCheck !== undefined) {
            nextCheckPill = `<span class="pill-countdown" data-countdown-id="${p.id}" data-seconds="${qItem.secondsUntilNextCheck}"><i class="fa-regular fa-clock"></i> Sau <b class="cnt-val">${formatDuration(qItem.secondsUntilNextCheck)}</b></span>`;
        } else {
            nextCheckPill = `<span class="pill-countdown" data-countdown-id="${p.id}" data-seconds="${currentIntervalSec}"><i class="fa-regular fa-clock"></i> Sau <b class="cnt-val">${currentIntervalSec}s</b></span>`;
        }

        return `
            <td>
                <span class="badge-platform ${platformClass}">
                    ${platformLabel}
                </span>
            </td>
            <td>
                <div class="product-cell">
                    <img src="${imgUrl}" alt="cover" class="product-img" onerror="this.src='${DEFAULT_IMG}'">
                    <div>
                        <a href="${p.url}" target="_blank" class="product-title" title="${p.title}">${p.title}</a>
                        <small class="text-muted product-price">${formatVND(p.lastData ? p.lastData.price : 0)}</small>
                        ${targetVarBadge}
                    </div>
                </div>
            </td>
            <td>${variantsHtml}</td>
            <td class="cell-status">${statusPill}</td>
            <td>
                <div class="interval-select-wrapper">
                    <select class="interval-select ${isCustom ? 'is-custom' : ''}" data-id="${p.id}" title="Đổi tần suất check cho sản phẩm này">
                        <option value="0" ${!isCustom ? 'selected' : ''}>⚙️ Mặc định (${globalSec}s)</option>
                        <option value="20" ${p.checkIntervalSeconds === 20 ? 'selected' : ''}>⚡ 20s (Cực nhanh)</option>
                        <option value="30" ${p.checkIntervalSeconds === 30 ? 'selected' : ''}>🚀 30s</option>
                        <option value="60" ${p.checkIntervalSeconds === 60 ? 'selected' : ''}>⏱️ 1 phút</option>
                        <option value="120" ${p.checkIntervalSeconds === 120 ? 'selected' : ''}>⏱️ 2 phút</option>
                        <option value="300" ${p.checkIntervalSeconds === 300 ? 'selected' : ''}>⏱️ 5 phút</option>
                        <option value="600" ${p.checkIntervalSeconds === 600 ? 'selected' : ''}>⏱️ 10 phút</option>
                    </select>
                    <span class="interval-hint">${isCustom ? '⚡ Riêng biệt' : '⚙️ Dùng cài đặt chung'}</span>
                </div>
            </td>
            <td>
                <div class="schedule-cell">
                    <div class="schedule-next">${nextCheckPill}</div>
                    <div class="schedule-last">${formatDate(p.lastChecked)}</div>
                    <div class="schedule-meta"><i class="fa-solid fa-gauge-high"></i> ${speed}</div>
                </div>
            </td>
            <td class="text-right">
                <button class="btn btn-sm btn-secondary btn-check-item" data-id="${p.id}" title="Đưa vào đầu hàng đợi check ngay">
                    <i class="fa-solid fa-arrows-rotate"></i>
                </button>
                <button class="btn btn-sm btn-danger btn-delete-item" data-id="${p.id}" title="Xóa sản phẩm">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
    }

    // Render Products Table (In-place updates without DOM destruction to eliminate jitter)
    function renderProductsTable(products) {
        productCountBadge.textContent = `${products.length} sản phẩm`;
        
        if (products.length === 0) {
            productsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">
                        Chưa có sản phẩm nào trong danh sách theo dõi. Bấm "Thêm Sản Phẩm" để bắt đầu!
                    </td>
                </tr>`;
            return;
        }

        // Remove empty state if present
        const emptyRow = productsTableBody.querySelector('.empty-state');
        if (emptyRow) {
            productsTableBody.innerHTML = '';
        }

        const globalSec = (currentQueue && currentQueue.globalIntervalSeconds) 
            || currentSettings.checkIntervalSeconds 
            || 30;

        const currentIds = new Set(products.map(p => p.id));

        // Remove deleted rows
        productsTableBody.querySelectorAll('tr[data-product-id]').forEach(tr => {
            const id = tr.getAttribute('data-product-id');
            if (!currentIds.has(id)) tr.remove();
        });

        // Insert or patch each row
        products.forEach(p => {
            const qItem = (currentQueue && currentQueue.products) ? currentQueue.products.find(item => item.id === p.id) : null;
            const isCustom = Boolean(p.checkIntervalSeconds && Number(p.checkIntervalSeconds) > 0);
            const currentIntervalSec = isCustom ? Number(p.checkIntervalSeconds) : globalSec;

            let tr = productsTableBody.querySelector(`tr[data-product-id="${p.id}"]`);
            if (!tr) {
                // Create new row
                tr = document.createElement('tr');
                tr.setAttribute('data-product-id', p.id);
                tr.dataset.lastStatus = p.lastStatus || 'unknown';
                tr.innerHTML = buildRowInnerHtml(p, globalSec, qItem);
                productsTableBody.appendChild(tr);
            } else {
                // In-place patch existing row without flicker
                // 1. Status pill
                if (tr.dataset.lastStatus !== p.lastStatus) {
                    tr.dataset.lastStatus = p.lastStatus || 'unknown';
                    const statusCell = tr.querySelector('.cell-status');
                    if (statusCell) {
                        let statusPill = `<span class="pill pill-warning"><i class="fa-solid fa-clock"></i> Chờ check</span>`;
                        if (p.lastStatus === 'in_stock') statusPill = `<span class="pill pill-success"><i class="fa-solid fa-check"></i> CÒN HÀNG</span>`;
                        else if (p.lastStatus === 'out_of_stock') statusPill = `<span class="pill pill-danger"><i class="fa-solid fa-xmark"></i> HẾT HÀNG</span>`;
                        else if (p.lastStatus === 'error') statusPill = `<span class="pill pill-danger" title="${p.lastError || ''}"><i class="fa-solid fa-triangle-exclamation"></i> LỖI CÀO</span>`;
                        statusCell.innerHTML = statusPill;
                    }
                }

                // 2. Interval Select (Only update if user is NOT currently focusing on it)
                const select = tr.querySelector('.interval-select');
                if (select && document.activeElement !== select) {
                    const targetVal = String(p.checkIntervalSeconds || 0);
                    if (select.value !== targetVal) select.value = targetVal;
                    select.classList.toggle('is-custom', isCustom);
                    const hint = tr.querySelector('.interval-hint');
                    if (hint) hint.textContent = isCustom ? '⚡ Riêng biệt' : '⚙️ Dùng cài đặt chung';
                    const defOpt = select.querySelector('option[value="0"]');
                    if (defOpt) defOpt.textContent = `⚙️ Mặc định (${globalSec}s)`;
                }

                // 3. Schedule pill
                const pillEl = tr.querySelector('.pill-countdown');
                if (pillEl) {
                    if (qItem && qItem.isRunning) {
                        pillEl.className = 'pill-countdown running';
                        pillEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang check...';
                    } else if (qItem && qItem.isPendingPriority) {
                        pillEl.className = 'pill-countdown priority';
                        pillEl.innerHTML = '<i class="fa-solid fa-bolt"></i> Trong hàng đợi';
                    } else if (qItem && qItem.secondsUntilNextCheck !== undefined) {
                        pillEl.className = 'pill-countdown';
                        pillEl.setAttribute('data-seconds', String(qItem.secondsUntilNextCheck));
                        pillEl.innerHTML = `<i class="fa-regular fa-clock"></i> Sau <b class="cnt-val">${formatDuration(qItem.secondsUntilNextCheck)}</b>`;
                    }
                }

                // 4. Last Checked & Speed
                const lastCheckedEl = tr.querySelector('.schedule-last');
                if (lastCheckedEl) lastCheckedEl.textContent = formatDate(p.lastChecked);
                const speedEl = tr.querySelector('.schedule-meta');
                const speed = (p.lastData && p.lastData.responseTimeMs) ? `${p.lastData.responseTimeMs}ms` : '---';
                if (speedEl) speedEl.innerHTML = `<i class="fa-solid fa-gauge-high"></i> ${speed}`;
            }
        });
    }

    // EVENT DELEGATION FOR TABLE ACTIONS
    productsTableBody.addEventListener('change', async (e) => {
        const select = e.target.closest('.interval-select');
        if (select) {
            const id = select.getAttribute('data-id');
            const val = parseInt(select.value, 10);
            const newInterval = val > 0 ? val : null;

            try {
                select.disabled = true;
                const res = await fetch(`/api/products/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ checkIntervalSeconds: newInterval })
                });
                const data = await res.json();
                if (data.success) {
                    const label = newInterval ? `${newInterval}s` : 'Mặc định';
                    showToast(`✅ Đã đổi tần suất check cho sản phẩm thành: ${label}`);
                    await refreshAll();
                } else {
                    alert('Lỗi cập nhật tần suất: ' + (data.error || 'Thất bại'));
                }
            } catch (err) {
                alert('Lỗi kết nối khi cập nhật tần suất: ' + err.message);
            } finally {
                select.disabled = false;
            }
            return;
        }
    });

    productsTableBody.addEventListener('click', async (e) => {
        // Handle Delete Button
        const deleteBtn = e.target.closest('.btn-delete-item');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = deleteBtn.getAttribute('data-id');
            if (id) {
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
                    const data = await res.json();
                    if (data.success) {
                        showToast('🗑️ Đã xóa sản phẩm khỏi danh sách theo dõi');
                        await refreshAll();
                    } else {
                        alert('Không thể xóa: ' + (data.error || 'Lỗi không xác định'));
                    }
                } catch (err) {
                    alert('Lỗi kết nối khi xóa: ' + err.message);
                }
            }
            return;
        }

        // Handle Manual Check Item Button
        const checkBtn = e.target.closest('.btn-check-item');
        if (checkBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = checkBtn.getAttribute('data-id');
            if (id) {
                checkBtn.disabled = true;
                const icon = checkBtn.querySelector('i');
                if (icon) icon.classList.add('fa-spin');
                showToast('🚀 Đã kích hoạt lượt check ưu tiên qua hàng đợi...', 'info');
                try {
                    await fetch(`/api/products/${id}/check`, { method: 'POST' });
                    await refreshAll();
                } finally {
                    if (icon) icon.classList.remove('fa-spin');
                    checkBtn.disabled = false;
                }
            }
            return;
        }
    });

    // Fetch Logs
    async function loadLogs() {
        try {
            const res = await fetch('/api/logs?limit=40');
            const logs = await res.json();
            
            if (logs.length > 0) {
                logConsole.innerHTML = logs.reverse().map(l => {
                    const time = new Date(l.timestamp).toLocaleTimeString('vi-VN');
                    return `<div class="log-line log-${l.level}">[${time}] ${l.message}</div>`;
                }).join('');
                logConsole.scrollTop = logConsole.scrollHeight;
            }
        } catch (err) {
            console.error('Lỗi khi tải logs:', err);
        }
    }

    // Load Settings
    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            currentSettings = await res.json();

            // Client-side localStorage fallback for Vercel Ephemeral Lambdas
            const localToken = localStorage.getItem('boki_telegram_token') || '';
            const localChat = localStorage.getItem('boki_telegram_chat') || '';

            const activeToken = currentSettings.telegramBotToken || localToken;
            const activeChat = currentSettings.telegramChatId || localChat;

            document.getElementById('telegramBotToken').value = activeToken;
            document.getElementById('telegramChatId').value = activeChat;
            
            const intervalSec = currentSettings.checkIntervalSeconds || ((currentSettings.checkIntervalMinutes || 5) * 60);
            document.getElementById('checkIntervalSeconds').value = String(intervalSec);
            
            const autoCheckCheckbox = document.getElementById('autoCheckEnabled');
            autoCheckCheckbox.checked = currentSettings.autoCheckEnabled;
            document.getElementById('switchLabelText').textContent = currentSettings.autoCheckEnabled ? 'Đang BẬT' : 'Đang TẮT';
        } catch (err) {
            console.error('Lỗi khi tải cài đặt:', err);
        }
    }

    // Save Settings
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const botToken = document.getElementById('telegramBotToken').value.trim();
        const chatId = document.getElementById('telegramChatId').value.trim();
        const intervalSec = parseInt(document.getElementById('checkIntervalSeconds').value, 10);
        const autoCheck = document.getElementById('autoCheckEnabled').checked;

        if (botToken) localStorage.setItem('boki_telegram_token', botToken);
        if (chatId) localStorage.setItem('boki_telegram_chat', chatId);

        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegramBotToken: botToken,
                    telegramChatId: chatId,
                    checkIntervalSeconds: intervalSec,
                    checkIntervalMinutes: Math.max(1, Math.round(intervalSec / 60)),
                    autoCheckEnabled: autoCheck
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('✅ Đã lưu cấu hình cài đặt thành công!');
                refreshAll();
            }
        } catch (err) {
            alert('Lỗi lưu cấu hình: ' + err.message);
        }
    });

    // Toggle password visibility
    document.getElementById('btnToggleToken').addEventListener('click', () => {
        const input = document.getElementById('telegramBotToken');
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    });

    // Auto check toggle label
    document.getElementById('autoCheckEnabled').addEventListener('change', (e) => {
        document.getElementById('switchLabelText').textContent = e.target.checked ? 'Đang BẬT' : 'Đang TẮT';
    });

    // Test Telegram Button
    document.getElementById('btnTestTelegram').addEventListener('click', async () => {
        const btn = document.getElementById('btnTestTelegram');
        let botToken = document.getElementById('telegramBotToken').value.trim();
        let chatId = document.getElementById('telegramChatId').value.trim();

        // Fallback to saved settings if inputs are empty
        if (!botToken && currentSettings.telegramBotToken) botToken = currentSettings.telegramBotToken;
        if (!chatId && currentSettings.telegramChatId) chatId = currentSettings.telegramChatId;

        if (!botToken || !chatId) {
            alert('Vui lòng nhập Bot Token và Chat ID trước khi bấm thử nghiệm!');
            return;
        }

        btn.disabled = true;
        const origText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi tin thử nghiệm...';

        try {
            const res = await fetch('/api/telegram/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ botToken, chatId })
            });
            const data = await res.json();
            await refreshAll();

            if (data.success) {
                alert('✅ Tin nhắn thử nghiệm đã được gửi đến Telegram thành công!\n\nHãy kiểm tra ứng dụng Telegram của bạn.');
            } else {
                alert('❌ Lỗi gửi Telegram:\n\n' + data.error);
            }
        } catch (err) {
            alert('❌ Lỗi kết nối server: ' + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    // Check All Button
    document.getElementById('btnCheckAll').addEventListener('click', async () => {
        const btn = document.getElementById('btnCheckAll');
        btn.disabled = true;
        btn.querySelector('i').classList.add('fa-spin');
        try {
            await fetch('/api/check-all', { method: 'POST' });
            setTimeout(refreshAll, 1000);
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.querySelector('i').classList.remove('fa-spin');
            }, 3000);
        }
    });

    // Modal Handling
    const modal = document.getElementById('addProductModal');
    document.getElementById('btnOpenAddModal').addEventListener('click', () => modal.classList.add('show'));
    document.getElementById('btnCloseModal').addEventListener('click', () => modal.classList.remove('show'));
    document.querySelectorAll('.btnCancelModal').forEach(btn => {
        btn.addEventListener('click', () => modal.classList.remove('show'));
    });

    // Modal Mode Tabs
    const tabModeUrl = document.getElementById('tabModeUrl');
    const tabModeHtml = document.getElementById('tabModeHtml');
    const addProductForm = document.getElementById('addProductForm');
    const importHtmlForm = document.getElementById('importHtmlForm');

    if (tabModeUrl && tabModeHtml) {
        tabModeUrl.addEventListener('click', () => {
            tabModeUrl.classList.add('active');
            tabModeHtml.classList.remove('active');
            addProductForm.style.display = 'block';
            importHtmlForm.style.display = 'none';
        });

        tabModeHtml.addEventListener('click', () => {
            tabModeHtml.classList.add('active');
            tabModeUrl.classList.remove('active');
            importHtmlForm.style.display = 'block';
            addProductForm.style.display = 'none';
        });
    }

    // URL Platform preview
    const urlInput = document.getElementById('productUrl');
    const targetVariantInput = document.getElementById('targetVariant');
    const platformPreview = document.getElementById('platformPreview');
    const detectedText = document.getElementById('detectedPlatformText');

    urlInput.addEventListener('input', () => {
        const val = urlInput.value.toLowerCase();
        if (val.includes('tiki.vn')) {
            platformPreview.style.display = 'block';
            detectedText.textContent = 'Tiki.vn (API v2)';
            detectedText.className = 'badge-platform platform-tiki';
        } else if (val.includes('azvietnam.vn')) {
            platformPreview.style.display = 'block';
            detectedText.textContent = 'AZ Vietnam (Haravan API)';
            detectedText.className = 'badge-platform platform-azvietnam';
        } else if (val.includes('fahasa.com')) {
            platformPreview.style.display = 'block';
            detectedText.textContent = 'Fahasa.com (Cloudflare Mobile UA)';
            detectedText.className = 'badge-platform platform-fahasa';
        } else if (val.includes('nobita.vn')) {
            platformPreview.style.display = 'block';
            detectedText.textContent = 'Nobita.vn (WooCommerce Worker Pool)';
            detectedText.className = 'badge-platform platform-nobita';
        } else if (val.includes('shopee.vn') || val.includes('shope.ee') || val.includes('shp.ee')) {
            platformPreview.style.display = 'block';
            detectedText.textContent = 'Shopee (Shopee PDP Scraper)';
            detectedText.className = 'badge-platform platform-shopee';
        } else {
            platformPreview.style.display = 'none';
        }
    });

    // Submit Add Product via URL
    addProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        const targetVariant = targetVariantInput ? targetVariantInput.value.trim() : 'all';
        const intervalSelect = document.getElementById('productInterval');
        const intervalVal = intervalSelect ? parseInt(intervalSelect.value, 10) : 0;
        const checkIntervalSeconds = intervalVal > 0 ? intervalVal : null;

        if (!url) return;

        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, targetVariant, checkIntervalSeconds })
            });
            const data = await res.json();
            if (data.success) {
                modal.classList.remove('show');
                urlInput.value = '';
                if (targetVariantInput) targetVariantInput.value = '';
                if (intervalSelect) intervalSelect.value = '0';
                platformPreview.style.display = 'none';
                showToast('✅ Đã thêm sản phẩm vào hàng đợi theo dõi!');
                await refreshAll();
            } else {
                alert('Lỗi: ' + data.error);
            }
        } catch (err) {
            alert('Lỗi thêm sản phẩm: ' + err.message);
        }
    });

    // Submit Import HTML Element Form
    if (importHtmlForm) {
        importHtmlForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const html = document.getElementById('productHtmlInput').value.trim();
            const url = document.getElementById('productHtmlUrl').value.trim();
            const targetVariant = document.getElementById('targetVariantHtml').value.trim() || 'all';
            const intervalSelect = document.getElementById('productIntervalHtml');
            const intervalVal = intervalSelect ? parseInt(intervalSelect.value, 10) : 0;
            const checkIntervalSeconds = intervalVal > 0 ? intervalVal : null;

            if (!html) {
                alert('Vui lòng dán mã HTML/Element của Shopee!');
                return;
            }

            const submitBtn = document.getElementById('btnSubmitImportHtml');
            submitBtn.disabled = true;
            const origText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang bóc tách...';

            try {
                const res = await fetch('/api/products/import-html', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ html, url, targetVariant, checkIntervalSeconds })
                });
                const data = await res.json();
                if (data.success) {
                    modal.classList.remove('show');
                    document.getElementById('productHtmlInput').value = '';
                    document.getElementById('productHtmlUrl').value = '';
                    document.getElementById('targetVariantHtml').value = '';
                    if (intervalSelect) intervalSelect.value = '0';
                    showToast('✅ Đã bóc tách và thêm sản phẩm Shopee thành công!');
                    await refreshAll();
                } else {
                    alert('Lỗi: ' + data.error);
                }
            } catch (err) {
                alert('Lỗi gửi HTML lên server: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = origText;
            }
        });
    }

    // Clear Logs UI
    document.getElementById('btnClearLogUI').addEventListener('click', () => {
        logConsole.innerHTML = '<div class="log-line log-info">[SYSTEM] Đã xóa màn hình console.</div>';
    });

    // Global Refresh function
    async function refreshAll() {
        await Promise.all([loadStatus(), loadProducts(), loadLogs()]);
    }

    // Live Local Countdown Ticker (ticks every 1s smoothly)
    setInterval(() => {
        document.querySelectorAll('[data-countdown-id]').forEach(el => {
            let sec = parseInt(el.getAttribute('data-seconds'), 10);
            if (!isNaN(sec) && sec > 0) {
                sec -= 1;
                el.setAttribute('data-seconds', String(sec));
                const valEl = el.querySelector('.cnt-val');
                if (valEl) {
                    valEl.textContent = formatDuration(sec);
                }
            } else if (sec === 0) {
                const valEl = el.querySelector('.cnt-val');
                if (valEl) {
                    valEl.textContent = 'đang đợi lượt...';
                }
            }
        });
    }, 1000);

    // Initial Load & Polling (every 5s)
    loadSettings();
    refreshAll();
    setInterval(refreshAll, 5000);
});
