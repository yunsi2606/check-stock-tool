/**
 * Scraper module for AZ Vietnam (Haravan platform) using .js JSON API
 */
async function scrapeAzVietnam(url, targetVariant = 'all') {
    const startTime = Date.now();
    try {
        // Normalize URL to get JSON endpoint
        const cleanUrl = url.split('?')[0].replace(/\/+$/, '');
        const jsonUrl = cleanUrl.endsWith('.js') ? cleanUrl : `${cleanUrl}.js`;

        const res = await fetch(jsonUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
            }
        });

        if (!res.ok) {
            throw new Error(`AZ Vietnam API returned status ${res.status}`);
        }

        const data = await res.json();
        const duration = Date.now() - startTime;

        let image = '';
        if (data.featured_image) {
            image = data.featured_image.startsWith('//') ? `https:${data.featured_image}` : data.featured_image;
        } else if (data.images && data.images.length > 0) {
            const img = data.images[0];
            image = img.startsWith('//') ? `https:${img}` : img;
        }

        const variants = (data.variants || []).map(v => {
            const stock = typeof v.inventory_quantity === 'number' ? v.inventory_quantity : (v.available ? 1 : 0);
            return {
                id: String(v.id),
                title: v.title,
                price: Math.round(v.price / 100),
                originalPrice: v.compare_at_price ? Math.round(v.compare_at_price / 100) : Math.round(v.price / 100),
                available: Boolean(v.available) && stock > 0,
                stockQty: stock,
                sku: v.sku || ''
            };
        });

        const isAnyVariantAvailable = variants.some(v => v.available);
        let isOverallAvailable = isAnyVariantAvailable || Boolean(data.available);
        let effectivePrice = variants.length > 0 ? variants[0].price : Math.round((data.price || 0) / 100);
        let effectiveStockQty = variants.reduce((acc, v) => acc + (v.available ? (v.stockQty || 1) : 0), 0);

        if (targetVariant && targetVariant !== 'all') {
            const cleanTarget = targetVariant.trim().toLowerCase();
            const matched = variants.find(v => v.title.toLowerCase().includes(cleanTarget));
            if (matched) {
                isOverallAvailable = matched.available;
                effectivePrice = matched.price;
                effectiveStockQty = matched.available ? (matched.stockQty || 1) : 0;
            } else {
                variants.unshift({
                    id: 'missing-target',
                    title: `${targetVariant} (Hết hàng)`,
                    price: effectivePrice,
                    available: false,
                    stockQty: 0
                });
                isOverallAvailable = false;
                effectiveStockQty = 0;
            }
        }

        return {
            success: true,
            platform: 'azvietnam',
            title: data.title || 'AZ Vietnam Product',
            price: effectivePrice,
            available: isOverallAvailable,
            stockQty: isOverallAvailable ? effectiveStockQty : 0,
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
            platform: 'azvietnam',
            error: err.message,
            url: url,
            responseTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { scrapeAzVietnam };
