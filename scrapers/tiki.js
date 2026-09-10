/**
 * Scraper module for Tiki.vn using API v2
 * Note: Tiki automatically hides variants with 0 inventory from `configurable_products`.
 * When a targetVariant (e.g. "Bản Đặc Biệt") is specified by user, we verify if it exists in the active variants list.
 */
async function scrapeTiki(url, targetVariant = 'all') {
    const startTime = Date.now();
    try {
        // Extract product ID and spid
        const productMatch = url.match(/p(\d+)\.html/i) || url.match(/product-p(\d+)/i) || url.match(/\/(\d+)\.html/i);
        if (!productMatch) {
            throw new Error("Không thể trích xuất ID sản phẩm Tiki từ URL");
        }
        const productId = productMatch[1];
        
        const spidMatch = url.match(/spid=(\d+)/i);
        const spidParam = spidMatch ? `?spid=${spidMatch[1]}` : '';

        const apiUrl = `https://tiki.vn/api/v2/products/${productId}${spidParam}`;

        const res = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        if (!res.ok) {
            throw new Error(`Tiki API returned status ${res.status}`);
        }

        const data = await res.json();
        const duration = Date.now() - startTime;

        const isAvailable = data.inventory_status === 'available';
        const image = data.images && data.images.length > 0 ? data.images[0].base_url : (data.thumbnail_url || '');

        // Extract active variants
        const variants = [];
        if (data.configurable_products && data.configurable_products.length > 0) {
            data.configurable_products.forEach(cp => {
                const name = cp.option1 || cp.name || `Phiên bản #${cp.id}`;
                variants.push({
                    id: String(cp.id),
                    title: name,
                    price: cp.price || data.price,
                    available: cp.inventory_status === 'available',
                    inventoryStatus: cp.inventory_status || 'unknown'
                });
            });
        } else {
            variants.push({
                id: String(data.id),
                title: data.name || "Mặc định",
                price: data.price,
                available: isAvailable,
                inventoryStatus: data.inventory_status
            });
        }

        // Check if user requested a specific target variant (e.g. "Bản Đặc Biệt")
        let targetVariantFound = false;
        let isOverallAvailable = isAvailable;

        if (targetVariant && targetVariant !== 'all') {
            const cleanTarget = targetVariant.trim().toLowerCase();
            const matched = variants.find(v => v.title.toLowerCase().includes(cleanTarget));
            if (matched) {
                targetVariantFound = true;
                isOverallAvailable = matched.available;
            } else {
                // Tiki hid this variant because stock = 0! Add explicit 0-stock placeholder variant entry for transparency.
                variants.unshift({
                    id: 'missing-target',
                    title: `${targetVariant} (Ẩn do hết hàng)`,
                    price: data.price,
                    available: false,
                    inventoryStatus: 'hidden_out_of_stock'
                });
                isOverallAvailable = false;
            }
        }

        return {
            success: true,
            platform: 'tiki',
            title: data.name || 'Sách Tiki',
            price: data.price || 0,
            originalPrice: data.list_price || data.original_price || data.price,
            available: isOverallAvailable,
            stockQty: data.stock_item ? data.stock_item.qty : (isAvailable ? 1 : 0),
            image: image,
            variants: variants,
            targetVariant: targetVariant,
            url: url,
            responseTimeMs: duration,
            timestamp: new Date().toISOString()
        };

    } catch (err) {
        return {
            success: false,
            platform: 'tiki',
            error: err.message,
            url: url,
            responseTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { scrapeTiki };
