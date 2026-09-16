/**
 * Scraper module for Fahasa.com using Mobile App UA to bypass Cloudflare
 */
async function scrapeFahasa(url) {
    const startTime = Date.now();
    try {
        let res = null;
        let html = '';

        // Try UAs whitelisted by Cloudflare for Fahasa on datacenter IPs (Render/Vercel/AWS)
        const userAgents = [
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'FahasaApp/1.0 (Android; Mobile)',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        ];

        for (const ua of userAgents) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': ua,
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8',
                        'Cache-Control': 'no-cache'
                    }
                });

                if (response.ok) {
                    res = response;
                    html = await response.text();
                    break;
                }
            } catch (e) {
                // Try next UA
            }
        }

        if (!res || !html) {
            throw new Error(`Fahasa returned status ${res ? res.status : '403 WAF Blocked'}`);
        }

        const duration = Date.now() - startTime;

        // Clean HTML to remove <script> and <style> tags (Fahasa embeds "out_of_stock":"Sản phẩm tạm hết hàng" inside JS translation scripts on ALL pages)
        const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

        // Stock check on cleaned HTML
        const isOosInClean = cleanHtml.includes("Sản phẩm tạm hết hàng") || 
                             cleanHtml.includes("tạm hết hàng") ||
                             /class=["'][^"']*out-of-stock[^"']*["']/i.test(cleanHtml) ||
                             cleanHtml.includes("btn-out-of-stock") ||
                             cleanHtml.includes("fhs-btn-out-of-stock");

        const hasCartButton = cleanHtml.includes("btn-cart-to-cart") || 
                              cleanHtml.includes("btn-buy-now") || 
                              cleanHtml.includes("product_view_add_box");

        const isAvailable = hasCartButton && !isOosInClean;

        // Title extraction
        let title = 'Sách Fahasa';
        const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) || 
                           html.match(/<title>(.*?)<\/title>/i) ||
                           html.match(/<h1[^>]*>(.*?)<\/h1>/i);
        if (titleMatch) {
            title = titleMatch[1].replace(/ - Fahasa\.com$/i, '').trim();
        }

        // Image extraction
        let image = '';
        const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
        if (imgMatch) {
            image = imgMatch[1];
        }

        // Price extraction
        let price = 0;
        const priceMatch = html.match(/id=["']product-price-\d+["'][^>]*>\s*([\d\.]+)/i) ||
                           html.match(/<meta\s+property=["']product:price:amount["']\s+content=["'](.*?)["']/i) ||
                           html.match(/class=["']price["'][^>]*>\s*([\d\.]+)/i);
        if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\./g, ''), 10) || 0;
        }

        const variants = [
            {
                id: "default",
                title: "Mặc định",
                price: price,
                available: isAvailable
            }
        ];

        return {
            success: true,
            platform: 'fahasa',
            title: title,
            price: price,
            available: isAvailable,
            image: image,
            variants: variants,
            url: url,
            responseTimeMs: duration,
            timestamp: new Date().toISOString()
        };

    } catch (err) {
        return {
            success: false,
            platform: 'fahasa',
            error: err.message,
            url: url,
            responseTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { scrapeFahasa };
