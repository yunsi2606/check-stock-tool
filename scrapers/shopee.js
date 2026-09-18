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

function parseShopeeHtmlButtons(html) {
    const variants = [];
    const regex = /<button\b[^>]*aria-label="([^"]+)"[^>]*aria-disabled="(true|false)"[^>]*>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const name = match[1].trim();
        const isDisabled = match[2].toLowerCase() === 'true';
        variants.push({
            id: name,
            title: name,
            available: !isDisabled,
            price: 0,
            stockQty: !isDisabled ? 1 : 0
        });
    }

    if (variants.length === 0) {
        const regexAlt = /<button\b[^>]*aria-disabled="(true|false)"[^>]*aria-label="([^"]+)"[^>]*>/gi;
        while ((match = regexAlt.exec(html)) !== null) {
            const isDisabled = match[1].toLowerCase() === 'true';
            const name = match[2].trim();
            variants.push({
                id: name,
                title: name,
                available: !isDisabled,
                price: 0,
                stockQty: !isDisabled ? 1 : 0
            });
        }
    }

    return variants;
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

        const mobileUAs = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ];

        let rawData = null;
        let fetchSuccess = false;

        // Attempt 1: Shopee PDP API v4
        try {
            const apiRes = await fetch(`https://shopee.vn/api/v4/pdp/get_pc?itemid=${itemid}&shopid=${shopid}`, {
                headers: {
                    'User-Agent': mobileUAs[2],
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

        // Attempt 2: HTML Page Parsing with Mobile User-Agents (Shopee Mobile SSR sends initialState with models & stock)
        if (!fetchSuccess) {
            for (const ua of mobileUAs) {
                try {
                    const pageRes = await fetch(`https://shopee.vn/product/${shopid}/${itemid}`, {
                        headers: {
                            'User-Agent': ua,
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
                            'Cache-Control': 'no-cache'
                        }
                    });

                    if (!pageRes.ok) continue;

                    const html = await pageRes.text();

                    // Extract initialState from HTML script tags
                    const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];

                    for (const scriptTag of scripts) {
                        if (scriptTag.includes('initialState') || scriptTag.includes('DOMAIN_PDP') || scriptTag.includes('cachedMap') || scriptTag.includes('RW_VARIATION_SELECTION')) {
                            const firstBrace = scriptTag.indexOf('{');
                            const lastBrace = scriptTag.lastIndexOf('}');
                            if (firstBrace === -1 || lastBrace === -1) continue;

                            const jsonText = scriptTag.substring(firstBrace, lastBrace + 1);
                            try {
                                const parsed = JSON.parse(jsonText);
                                const initialState = parsed?.initialState || parsed;
                                if (!initialState) continue;

                                let itemObj = null;

                                // 1. Check DOMAIN_PDP cachedMap
                                const cachedMap = initialState?.DOMAIN_PDP?.data?.PDP_BFF_DATA?.cachedMap;
                                if (cachedMap) {
                                    for (const k of Object.keys(cachedMap)) {
                                        if (k.includes(itemid)) {
                                            const entry = cachedMap[k];
                                            itemObj = entry?.item || entry?.data?.item || entry?.data;
                                            if (itemObj && (itemObj.title || itemObj.name || (itemObj.models && itemObj.models.length > 0))) {
                                                break;
                                            }
                                        }
                                    }
                                }

                                // 2. Check initialState.item.items[itemid]
                                if ((!itemObj || (!itemObj.name && !itemObj.title)) && initialState?.item?.items) {
                                    if (initialState.item.items[itemid] && (initialState.item.items[itemid].name || initialState.item.items[itemid].title)) {
                                        itemObj = initialState.item.items[itemid];
                                    }
                                }

                                // 3. Check RW_VARIATION_SELECTION
                                if ((!itemObj || (!itemObj.name && !itemObj.title)) && initialState?.RW_VARIATION_SELECTION?.data?.itemLevel?.item) {
                                    itemObj = initialState.RW_VARIATION_SELECTION.data.itemLevel.item;
                                }

                                if (itemObj && (itemObj.name || itemObj.title)) {
                                    rawData = itemObj;
                                    fetchSuccess = true;
                                    break;
                                }
                            } catch (e) {
                                // Skip non-parseable scripts
                            }
                        }
                    }

                    if (fetchSuccess) break;
                } catch (e) {
                    // Try next UA
                }
            }
        }

        // Attempt 3: OpenGraph fallback via Facebook External Hit UA if HTML script parsing failed
        if (!fetchSuccess || !rawData) {
            try {
                const fbRes = await fetch(`https://shopee.vn/a-i.${shopid}.${itemid}`, {
                    headers: {
                        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    }
                });
                if (fbRes.ok) {
                    const fbHtml = await fbRes.text();
                    const titleMatch = fbHtml.match(/<meta\b[^>]*property=["']og:title["']\s+content=["'](.*?)["']/i);
                    const imageMatch = fbHtml.match(/<meta\b[^>]*property=["']og:image["']\s+content=["'](.*?)["']/i);
                    
                    if (titleMatch && titleMatch[1] && !titleMatch[1].includes('Shopee Việt Nam')) {
                        const title = titleMatch[1].replace(/\s*\|\s*Shopee Việt Nam$/i, '').trim();
                        const image = imageMatch ? imageMatch[1] : '';
                        const duration = Date.now() - startTime;
                        return {
                            success: true,
                            platform: 'shopee',
                            title: title,
                            price: 0,
                            originalPrice: 0,
                            available: true,
                            stockQty: 1,
                            image: image,
                            variants: [{ id: itemid, title: 'Mặc định', price: 0, available: true }],
                            targetVariant: targetVariant,
                            url: url,
                            responseTimeMs: duration,
                            timestamp: new Date().toISOString()
                        };
                    }
                }
            } catch (e) {
                // Skip
            }

            throw new Error(`Shopee WAF anti-bot blocked request (Status 403 / Captcha Required)`);
        }

        const duration = Date.now() - startTime;

        // Process rawData (Title, price, stock, variants)
        const title = rawData.title || rawData.name || 'Sách Shopee';
        
        let rawPrice = rawData.price || rawData.price_min || 0;
        let origPriceRaw = rawData.price_before_discount || rawData.price_max || rawPrice;

        const price = rawPrice > 1000000 ? Math.round(rawPrice / 100000) : rawPrice;
        const originalPrice = origPriceRaw > 1000000 ? Math.round(origPriceRaw / 100000) : origPriceRaw;

        const totalStock = typeof rawData.stock === 'number' ? rawData.stock : (rawData.normal_stock || 0);
        
        // Process Models / Variants
        const variants = [];
        if (rawData.models && rawData.models.length > 0) {
            rawData.models.forEach(m => {
                const mPriceRaw = m.price || rawPrice;
                const mPrice = mPriceRaw > 1000000 ? Math.round(mPriceRaw / 100000) : mPriceRaw;
                
                // Model is available if NOT grayed out, clickable is not false, and stock > 0 (if stock provided)
                const isGrayout = m.is_grayout === true;
                const isNotClickable = m.is_clickable === false;
                const mStock = typeof m.stock === 'number' ? m.stock : (m.normal_stock !== undefined ? m.normal_stock : 1);
                
                const mAvailable = !isGrayout && !isNotClickable && (mStock > 0);

                variants.push({
                    id: String(m.modelid || m.model_id || m.itemid),
                    title: m.name || m.title || 'Mặc định',
                    price: mPrice,
                    available: mAvailable,
                    stockQty: mAvailable ? (mStock || 1) : 0
                });
            });
        } else {
            const isAvailable = totalStock > 0 && rawData.item_status !== 'UNLISTED' && rawData.item_status !== 'BANNED';
            variants.push({
                id: String(itemid),
                title: title,
                price: price,
                available: isAvailable,
                stockQty: totalStock
            });
        }

        // Image extraction
        let image = '';
        if (rawData.image) {
            image = rawData.image.startsWith('http') ? rawData.image : `https://down-vn.img.susercontent.com/file/${rawData.image}`;
        } else if (rawData.images && rawData.images.length > 0) {
            const img0 = rawData.images[0];
            image = img0.startsWith('http') ? img0 : `https://down-vn.img.susercontent.com/file/${img0}`;
        }

        // Determine overall availability based on targetVariant
        let isOverallAvailable = variants.some(v => v.available);
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
            stockQty: variants.reduce((acc, v) => acc + (v.available ? v.stockQty : 0), 0),
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
