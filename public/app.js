document.addEventListener('DOMContentLoaded', () => {
    // State
    let productsList = [];
    let currentSettings = {};

    // DOM Elements
    const productsTableBody = document.getElementById('productsTableBody');
    const statTotal = document.getElementById('statTotal');
    const statInStock = document.getElementById('statInStock');
    const statOutOfStock = document.getElementById('statOutOfStock');
    const statTelegramStatus = document.getElementById('statTelegramStatus');
    const productCountBadge = document.getElementById('productCountBadge');
    const autoCheckStatus = document.getElementById('autoCheckStatus');
    const autoCheckText = document.getElementById('autoCheckText');
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

    // Helper: Format Price
    function formatVND(price) {
        if (!price || isNaN(price)) return '---';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price);
    }

    // Helper: Format Date
    function formatDate(isoString) {
        if (!isoString) return 'Chưa check';
        const date = new Date(isoString);
        return date.toLocaleTimeString('vi-VN') + ' ' + date.toLocaleDateString('vi-VN');
    }

    // Fetch Overview Status
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

    // Render Products Table
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

        productsTableBody.innerHTML = products.map(p => {
            const platformClass = `platform-${p.platform}`;
            const platformNames = { tiki: 'Tiki', azvietnam: 'AZ Vietnam', fahasa: 'Fahasa', nobita: 'Nobita.vn' };
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
            const imgUrl = (p.lastData && p.lastData.image) ? p.lastData.image : 'https://via.placeholder.com/60?text=Book';

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
                        const vStatus = v.available ? '✓ Còn' : '✗ Hết';
                        return `<span class="variant-pill ${vClass}">${v.title}: ${formatVND(v.price)} (${vStatus})</span>`;
                    }).join('') + 
                    `</div>`;
            }

            // Speed indicator
            const speed = (p.lastData && p.lastData.responseTimeMs) ? `${p.lastData.responseTimeMs}ms` : '---';

            return `
                <tr data-product-id="${p.id}">
                    <td>
                        <span class="badge-platform ${platformClass}">
                            ${platformLabel}
                        </span>
                    </td>
                    <td>
                        <div class="product-cell">
                            <img src="${imgUrl}" alt="cover" class="product-img" onerror="this.src='https://via.placeholder.com/60?text=Book'">
                            <div>
                                <a href="${p.url}" target="_blank" class="product-title" title="${p.title}">${p.title}</a>
                                <small class="text-muted">${formatVND(p.lastData ? p.lastData.price : 0)}</small>
                                ${targetVarBadge}
                            </div>
                        </div>
                    </td>
                    <td>${variantsHtml}</td>
                    <td>${statusPill}</td>
                    <td><code>${speed}</code></td>
                    <td><small>${formatDate(p.lastChecked)}</small></td>
                    <td class="text-right">
                        <button class="btn btn-sm btn-secondary btn-check-item" data-id="${p.id}" title="Check ngay">
                            <i class="fa-solid fa-arrows-rotate"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-delete-item" data-id="${p.id}" title="Xóa sản phẩm">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // EVENT DELEGATION FOR TABLE ACTIONS
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

            document.getElementById('telegramBotToken').value = currentSettings.telegramBotToken || '';
            document.getElementById('telegramChatId').value = currentSettings.telegramChatId || '';
            
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
    document.getElementById('btnCancelModal').addEventListener('click', () => modal.classList.remove('show'));

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
        } else {
            platformPreview.style.display = 'none';
        }
    });

    // Submit Add Product
    document.getElementById('addProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();
        const targetVariant = targetVariantInput ? targetVariantInput.value.trim() : 'all';
        if (!url) return;

        try {
            const res = await fetch('/api/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, targetVariant })
            });
            const data = await res.json();
            if (data.success) {
                modal.classList.remove('show');
                urlInput.value = '';
                if (targetVariantInput) targetVariantInput.value = '';
                platformPreview.style.display = 'none';
                await refreshAll();
            } else {
                alert('Lỗi: ' + data.error);
            }
        } catch (err) {
            alert('Lỗi thêm sản phẩm: ' + err.message);
        }
    });

    // Clear Logs UI
    document.getElementById('btnClearLogUI').addEventListener('click', () => {
        logConsole.innerHTML = '<div class="log-line log-info">[SYSTEM] Đã xóa màn hình console.</div>';
    });

    // Global Refresh function
    async function refreshAll() {
        await Promise.all([loadStatus(), loadProducts(), loadLogs()]);
    }

    // Initial Load & Polling (every 5s)
    loadSettings();
    refreshAll();
    setInterval(refreshAll, 5000);
});
