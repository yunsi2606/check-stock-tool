/**
 * Scraper module for Shopee.vn
 * Supports parsing Shopee URLs (i.SHOPID.ITEMID, /product/SHOPID/ITEMID, a-i.SHOPID.ITEMID, shope.ee short links)
 * Extracts stock, price, title, image, and variants/models via Mobile SSR JSON and Desktop HTML DOM elements.
 */

function parseShopeeUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Case 1: i.SHOPID.ITEMID (e.g. shopee.vn/Ten-San-Pham-i.123456.789012)
    const matchI = url.match(/i\.(\d+)\.(\d+)/i);
    if (matchI) return { shopid: matchI[1], itemid: matchI[2] };

    // Case 2: product/SHOPID/ITEMID
    const matchProduct = url.match(/product\/(\d+)\/(\d+)/i);
    if (matchProduct) return { shopid: matchProduct[1], itemid: matchProduct[2] };

    // Case 3: a-i.SHOPID.ITEMID
    const matchAi = url.match(/a-i\.(\d+)\.(\d+)/i);
    if (matchAi) return { shopid: matchAi[1], itemid: matchAi[2] };

    return null;
}

/**
 * Parse Shopee product details directly from raw HTML / DOM elements
 * Supports Shopee Desktop PDP and Mobile HTML layouts
 */
function parseShopeeHtml(html, targetVariant = 'all') {
    if (!html || typeof html !== 'string') return null;

    // 1. Title Extraction
    let title = '';
    const h1Match = html.match(/<h1\b[^>]*class="[^"]*auau1S[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) ||
                    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
                    html.match(/<span\b[^>]*class="[^"]*jrzBcd[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                    html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                    html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i) ||
                    html.match(/<title\b[^>]*>(.*?)<\/title>/i);
    if (h1Match) {
        title = h1Match[1].replace(/<[^>]+>/g, '').replace(/\s*\|\s*Shopee Việt Nam$/i, '').trim();
    }

    if (!title || title === 'Shopee Việt Nam') return null;

    // 2. Image Extraction
    let image = '';
    const imgMatch = html.match(/<img\b[^>]*class="[^"]*P39yUt[^"]*"[^>]*src="([^"]+)"/i) ||
                     html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
                     html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:image["']/i) ||
                     html.match(/https:\/\/down-vn\.img\.susercontent\.com\/file\/[a-zA-Z0-9_-]+/i);
    if (imgMatch) {
        image = imgMatch[1] || imgMatch[0];
    }

    // 3. Price Extraction
    let price = 0;
    const pDomMatch = html.match(/class="[^"]*pw3J3G[^"]*"[^>]*>\s*([\d\.]+)/i) ||
                      html.match(/class="[^"]*nt0EaI[^"]*"[^>]*>[\s\S]*?(\d{1,3}(?:\.\d{3})+)/i) ||
                      html.match(/Giá bìa(?:\s+|\\t)+(\d{1,3}(?:\.\d{3})+)/i) ||
                      html.match(/(?:Giá bìa|giá|₫)(?:\s+|\\t|[:\s])+(\d{1,3}(?:\.\d{3})+)/i);
    if (pDomMatch) {
        price = parseInt(pDomMatch[1].replace(/\./g, ''), 10) || 0;
    }

    // 4. Variants Extraction from HTML Buttons
    const variants = [];
    const buttonRegex = /<button\b[^>]*\bclass="[^"]*(?:selection-box|Dbg4vL|lK5dVS|Lj3peW)[^"]*"[^>]*>[\s\S]*?<\/button>/gi;
    const allButtons = html.match(buttonRegex) || [];

    for (const btnHtml of allButtons) {
        let label = '';
        const labelMatch = btnHtml.match(/aria-label="([^"]+)"/i) ||
                           btnHtml.match(/<span\b[^>]*class="[^"]*f4_5wu[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
        if (labelMatch) {
            label = labelMatch[1].replace(/<[^>]+>/g, '').trim();
        }

        const isDisabled = btnHtml.includes('aria-disabled="true"') ||
                           btnHtml.includes('disabled') ||
                           btnHtml.includes('selection-box-disabled');

        if (label && !variants.some(v => v.title.toLowerCase() === label.toLowerCase())) {
            variants.push({
                id: label,
                title: label,
                price: price,
                available: !isDisabled,
                stockQty: !isDisabled ? 1 : 0
            });
        }
    }

    // Alternative Regex for aria-label & aria-disabled everywhere in HTML
    if (variants.length === 0) {
        const regex1 = /<button\b[^>]*aria-label="([^"]+)"[^>]*aria-disabled="(true|false)"[^>]*>/gi;
        let m;
        while ((m = regex1.exec(html)) !== null) {
            const name = m[1].trim();
            const isDisabled = m[2].toLowerCase() === 'true';
            if (!variants.some(v => v.title.toLowerCase() === name.toLowerCase())) {
                variants.push({
                    id: name,
                    title: name,
                    price: price,
                    available: !isDisabled,
                    stockQty: !isDisabled ? 1 : 0
                });
            }
        }
    }

    // 5. Global Stock Status
    const hasGlobalOosBadge = /class="[^"]*nHt5ah[^"]*"[^>]*>\s*hết hàng/i.test(html) ||
                            />\s*HẾT HÀNG\s*</i.test(html) ||
                            (html.includes('btn-solid-primary--disabled') && html.includes('btn-tinted--disabled'));

    let isOverallAvailable = false;
    if (variants.length > 0) {
        isOverallAvailable = variants.some(v => v.available);
    } else {
        isOverallAvailable = !hasGlobalOosBadge;
    }

    if (hasGlobalOosBadge && !variants.some(v => v.available)) {
        isOverallAvailable = false;
    }

    // 6. Target Variant Handling
    let effectivePrice = price;
    let effectiveStockQty = variants.reduce((acc, v) => acc + (v.available ? v.stockQty : 0), 0);

    if (targetVariant && targetVariant !== 'all') {
        const cleanTarget = targetVariant.trim().toLowerCase();
        const matched = variants.find(v => v.title.toLowerCase().includes(cleanTarget));
        if (matched) {
            isOverallAvailable = matched.available;
            if (matched.price > 0) effectivePrice = matched.price;
            effectiveStockQty = matched.available ? (matched.stockQty || 1) : 0;
        } else {
            variants.unshift({
                id: 'missing-target',
                title: `${targetVariant} (Hết hàng)`,
                price: price,
                available: false,
                stockQty: 0
            });
            isOverallAvailable = false;
            effectiveStockQty = 0;
        }
    } else if (variants.length === 0) {
        variants.push({
            id: 'default',
            title: 'Mặc định',
            price: price,
            available: isOverallAvailable,
            stockQty: isOverallAvailable ? 1 : 0
        });
    }

    return {
        title,
        price: effectivePrice,
        originalPrice: effectivePrice,
        available: isOverallAvailable,
        stockQty: isOverallAvailable ? effectiveStockQty : 0,
        image,
        variants
    };
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
        let lastHtml = '';

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

        // Attempt 2: HTML Page Parsing with Mobile User-Agents & Desktop URLs
        if (!fetchSuccess) {
            const pageUrls = [
                `https://shopee.vn/a-i.${shopid}.${itemid}`,
                `https://shopee.vn/product/${shopid}/${itemid}`
            ];

            for (const pageUrl of pageUrls) {
                if (fetchSuccess) break;

                for (const ua of mobileUAs) {
                    try {
                        const pageRes = await fetch(pageUrl, {
                            headers: {
                                'User-Agent': ua,
                                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
                                'Cache-Control': 'no-cache'
                            }
                        });

                        if (!pageRes.ok) continue;

                        const html = await pageRes.text();
                        lastHtml = html;

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
        }

        // Attempt 3: If JSON initialState was not available, try parsing raw HTML DOM elements
        const htmlParsed = lastHtml ? parseShopeeHtml(lastHtml, targetVariant) : null;

        if (!fetchSuccess && !rawData && (!htmlParsed || !htmlParsed.title)) {
            throw new Error(`Shopee WAF anti-bot blocked request (Status 403 / Captcha Required)`);
        }

        const duration = Date.now() - startTime;

        // If we don't have rawData but have htmlParsed, use htmlParsed directly
        if (!rawData && htmlParsed && htmlParsed.title) {
            return {
                success: true,
                platform: 'shopee',
                title: htmlParsed.title,
                price: htmlParsed.price,
                originalPrice: htmlParsed.originalPrice,
                available: htmlParsed.available,
                stockQty: htmlParsed.stockQty,
                image: htmlParsed.image,
                variants: htmlParsed.variants,
                targetVariant: targetVariant,
                url: url,
                responseTimeMs: duration,
                timestamp: new Date().toISOString()
            };
        }

        // Process rawData (Title, price, stock, variants)
        const title = rawData.title || rawData.name || (htmlParsed ? htmlParsed.title : 'Sách Shopee');
        
        let rawPrice = rawData.price || rawData.price_min || 0;
        let origPriceRaw = rawData.price_before_discount || rawData.price_max || rawPrice;

        let price = rawPrice > 1000000 ? Math.round(rawPrice / 100000) : rawPrice;
        let originalPrice = origPriceRaw > 1000000 ? Math.round(origPriceRaw / 100000) : origPriceRaw;

        // Extract price from page text / htmlParsed if rawPrice is not present in initial state
        if (price === 0) {
            if (htmlParsed && htmlParsed.price > 0) {
                price = htmlParsed.price;
                originalPrice = htmlParsed.originalPrice || price;
            } else if (lastHtml) {
                const pMatch = lastHtml.match(/class="[^"]*pw3J3G[^"]*"[^>]*>\s*([\d\.]+)/i) ||
                              lastHtml.match(/Giá bìa(?:\s+|\\t)+(\d{1,3}(?:\.\d{3})+)/i) ||
                              lastHtml.match(/(?:Giá bìa|giá|₫)(?:\s+|\\t|[:\s])+(\d{1,3}(?:\.\d{3})+)/i);
                if (pMatch) {
                    price = parseInt(pMatch[1].replace(/\./g, ''), 10) || 0;
                    originalPrice = price;
                }
            }
        }

        const totalStock = typeof rawData.stock === 'number' ? rawData.stock : (rawData.normal_stock || 0);
        
        // Process Models / Variants
        const variants = [];
        if (rawData.models && rawData.models.length > 0) {
            rawData.models.forEach(m => {
                const mPriceRaw = m.price || rawPrice;
                const mPrice = mPriceRaw > 1000000 ? Math.round(mPriceRaw / 100000) : (mPriceRaw || price);
                
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
        } else if (htmlParsed && htmlParsed.variants && htmlParsed.variants.length > 0) {
            // Use variants from HTML DOM buttons if JSON models were empty
            htmlParsed.variants.forEach(v => variants.push(v));
        } else {
            const isAvailable = totalStock > 0 && rawData.item_status !== 'UNLISTED' && rawData.item_status !== 'BANNED';
            variants.push({
                id: String(itemid),
                title: 'Mặc định',
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
        } else if (htmlParsed && htmlParsed.image) {
            image = htmlParsed.image;
        }

        // Global out-of-stock badge check
        const hasGlobalOosBadge = lastHtml ? (
            /class="[^"]*nHt5ah[^"]*"[^>]*>\s*hết hàng/i.test(lastHtml) ||
            />\s*HẾT HÀNG\s*</i.test(lastHtml) ||
            (lastHtml.includes('btn-solid-primary--disabled') && lastHtml.includes('btn-tinted--disabled'))
        ) : false;

        // Determine overall availability based on targetVariant
        let isOverallAvailable = variants.some(v => v.available);
        if (hasGlobalOosBadge && !variants.some(v => v.available)) {
            isOverallAvailable = false;
        }

        let effectivePrice = price;
        let effectiveStockQty = variants.reduce((acc, v) => acc + (v.available ? v.stockQty : 0), 0);

        if (targetVariant && targetVariant !== 'all') {
            const cleanTarget = targetVariant.trim().toLowerCase();
            const matched = variants.find(v => v.title.toLowerCase().includes(cleanTarget));
            if (matched) {
                isOverallAvailable = matched.available;
                if (matched.price > 0) effectivePrice = matched.price;
                effectiveStockQty = matched.available ? (matched.stockQty || 1) : 0;
            } else {
                variants.unshift({
                    id: 'missing-target',
                    title: `${targetVariant} (Hết hàng)`,
                    price: price,
                    available: false,
                    stockQty: 0
                });
                isOverallAvailable = false;
                effectiveStockQty = 0;
            }
        }

        return {
            success: true,
            platform: 'shopee',
            title: title,
            price: effectivePrice,
            originalPrice: originalPrice || effectivePrice,
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
    parseShopeeHtml,
    scrapeShopee
};
