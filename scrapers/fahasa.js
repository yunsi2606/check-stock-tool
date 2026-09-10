/**
 * Scraper module for Fahasa.com using Mobile App UA to bypass Cloudflare
 */
async function scrapeFahasa(url) {
    const startTime = Date.now();
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'FahasaApp/1.0 (Android; Mobile)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        if (!res.ok) {
            throw new Error(`Fahasa returned status ${res.status}`);
        }

        const html = await res.text();
        const duration = Date.now() - startTime;

        // Stock check
        const isOutOfStock = html.includes("Sản phẩm tạm hết hàng") || 
                             html.includes("out-of-stock") || 
                             html.includes("tạm hết hàng") ||
                             /class=["']availability out-of-stock["']/i.test(html);
        
        const isAvailable = !isOutOfStock;

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
        const priceMatch = html.match(/<meta\s+property=["']product:price:amount["']\s+content=["'](.*?)["']/i) ||
                           html.match(/class=["']price["'][^>]*>\s*([\d\.]+)\s*₫/i) ||
                           html.match(/(\d[\d\.]*)\s*đ/i);
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
