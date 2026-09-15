/**
 * Scraper module for Shopee.vn
 * Supports parsing Shopee URLs (i.SHOPID.ITEMID, /product/SHOPID/ITEMID, shope.ee short links)
 * Extracts stock, price, title, image, and variants/models.
 */

function parseShopeeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Case 1: i.SHOPID.ITEMID (e.g. shopee.vn/Ten-San-Pham-i.123456.789012)
    const matchI = url.match(/i\.(\d+)\.(\d+)/i);
    if (matchI) {
        return { shopid: matchI[1], itemid: matchI[2] };
    }

    // Case 2: product/SHOPID/ITEMID
    const matchProduct = url.match(/product\/(\d+)\/(\d+)/i);
    if (matchProduct) {
        return { shopid: matchProduct[1], itemid: matchProduct[2] };
    }

    return null;
}

async function scrapeShopee(url, targetVariant = 'all') {
    const startTime = Date.now();
    let currentUrl = url;

    try {
        // Resolve short link redirects if needed (e.g. shope.ee / vn.shp.ee)
        if (url.includes('shope.ee') || url.includes('shp.ee')) {
            try {
                const headRes = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
                    }
                });
                currentUrl = headRes.url;
            } catch (e) {
                console.log('Short URL redirect error:', e.message);
            }
        }

        const ids = parseShopeeUrl(currentUrl);
        if (!ids) {
            throw new Error('Không thể trích xuất Shop ID và Item ID từ URL Shopee');
        }

        const { shopid, itemid } = ids;

        const pcUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        // Attempt 1: Shopee PDP API v4
        let rawData = null;
        let fetchSuccess = false;

        try {
            const apiRes = await fetch(`https://shopee.vn/api/v4/pdp/get_pc?itemid=${itemid}&shopid=${shopid}`, {
                headers: {
                    'User-Agent': pcUA,
                    'Accept': 'application/json',
                    'x-shopee-language': 'vi',
                    'x-api-source': 'pc',
                    'Referer': `https://shopee.vn/product/${shopid}/${itemid}`
                }
            });

            if (apiRes.ok) {
                const json = await apiRes.json();
                if (json.data && json.data.item) {
                    rawData = json.data.item;
                    fetchSuccess = true;
                } else if (json.data && json.data.title) {
                    rawData = json.data;
                    fetchSuccess = true;
                }
            }
        } catch (e) {
            console.log('Shopee API fetch failed, trying HTML parse:', e.message);
        }

        // Attempt 2: HTML Page Parsing if API was blocked (403 WAF)
        if (!fetchSuccess) {
            const pageRes = await fetch(`https://shopee.vn/product/${shopid}/${itemid}`, {
                headers: {
                    'User-Agent': pcUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=9.0,*/*;q=0.8',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8'
                }
            });

            if (!pageRes.ok) {
                throw new Error(`Shopee page returned status ${pageRes.status}`);
            }

            const html = await pageRes.text();

            // Extract initialState from HTML script tag
            const stateMatch = html.match(/<script\b[^>]*>\s*(\{"initialState":[\s\S]*?\})\s*<\/script>/);
            if (stateMatch) {
                try {
                    const parsed = JSON.parse(stateMatch[1]);
                    const pdpMap = parsed?.initialState?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap;
                    const key = `${shopid}/${itemid}`;
                    if (pdpMap && pdpMap[key] && pdpMap[key].data) {
                        const itemObj = pdpMap[key].data.item || pdpMap[key].data;
                        rawData = itemObj;
                        fetchSuccess = true;
                    }
                } catch (e) {
                    console.log('Failed to parse initialState JSON:', e.message);
                }
            }

            // Fallback meta parsing if initialState wasn't formatted
            if (!fetchSuccess) {
                const titleMatch = html.match(/<title>(.*?)<\/title>/i);
                const title = titleMatch ? titleMatch[1].replace('| Shopee Việt Nam', '').trim() : `Sản phẩm Shopee (${itemid})`;
                const imageMatch = html.match(/https:\/\/down-vn\.img\.susercontent\.com\/file\/[a-zA-Z0-9_-]+/i);

                const duration = Date.now() - startTime;
                return {
                    success: true,
                    platform: 'shopee',
                    title: title,
                    price: 0,
                    originalPrice: 0,
                    available: true,
                    stockQty: 1,
                    image: imageMatch ? imageMatch[0] : '',
                    variants: [{ id: itemid, title: 'Mặc định', price: 0, available: true }],
                    targetVariant: targetVariant,
                    url: url,
                    responseTimeMs: duration,
                    timestamp: new Date().toISOString()
                };
            }
        }

        const duration = Date.now() - startTime;

        // Process rawData (Title, price, stock, variants)
        const title = rawData.title || rawData.name || 'Sách Shopee';
        const rawPrice = rawData.price || rawData.price_min || 0;
        const price = rawPrice > 1000000 ? Math.round(rawPrice / 100000) : rawPrice; // Shopee prices in API are scaled x100,000
        const origPriceRaw = rawData.price_before_discount || rawData.price_max || rawPrice;
        const originalPrice = origPriceRaw > 1000000 ? Math.round(origPriceRaw / 100000) : origPriceRaw;

        const totalStock = typeof rawData.stock === 'number' ? rawData.stock : (rawData.normal_stock || 0);
        const isAvailable = totalStock > 0 && rawData.item_status !== 'UNLISTED' && rawData.item_status !== 'BANNED';

        // Extract image
        let image = '';
        if (rawData.image) {
            image = rawData.image.startsWith('http') ? rawData.image : `https://down-vn.img.susercontent.com/file/${rawData.image}`;
        } else if (rawData.images && rawData.images.length > 0) {
            const img0 = rawData.images[0];
            image = img0.startsWith('http') ? img0 : `https://down-vn.img.susercontent.com/file/${img0}`;
        }

        // Process Models / Variants
        const variants = [];
        if (rawData.models && rawData.models.length > 0) {
            rawData.models.forEach(m => {
                const mPriceRaw = m.price || rawPrice;
                const mPrice = mPriceRaw > 1000000 ? Math.round(mPriceRaw / 100000) : mPriceRaw;
                const mStock = typeof m.stock === 'number' ? m.stock : (m.normal_stock || 0);
                variants.push({
                    id: String(m.modelid || m.itemid),
                    title: m.name || m.title || 'Mặc định',
                    price: mPrice,
                    available: mStock > 0,
                    stockQty: mStock
                });
            });
        } else {
            variants.push({
                id: String(itemid),
                title: title,
                price: price,
                available: isAvailable,
                stockQty: totalStock
            });
        }

        // Target variant filter matching
        let isOverallAvailable = isAvailable;
        if (targetVariant && targetVariant !== 'all') {
            const cleanTarget = targetVariant.trim().toLowerCase();
            const matched = variants.find(v => v.title.toLowerCase().includes(cleanTarget));
            if (matched) {
                isOverallAvailable = matched.available;
            } else {
                variants.unshift({
                    id: 'missing-target',
                    title: `${targetVariant} (Hết hàng)`,
                    price: price,
                    available: false,
                    stockQty: 0
                });
                isOverallAvailable = false;
            }
        }

        return {
            success: true,
            platform: 'shopee',
            title: title,
            price: price,
            originalPrice: originalPrice,
            available: isOverallAvailable,
            stockQty: totalStock,
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
            platform: 'shopee',
            error: err.message,
            url: url,
            responseTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = {
    parseShopeeUrl,
    scrapeShopee
};
