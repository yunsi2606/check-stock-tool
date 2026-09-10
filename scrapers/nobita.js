/**
 * Scraper module for Nobita.vn (WordPress/WooCommerce platform)
 * Optimized for server-side response delay (~5-8s)
 */
async function scrapeNobita(url) {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout max

        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache'
            }
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error(`Nobita.vn returned status ${res.status}`);
        }

        const html = await res.text();
        const duration = Date.now() - startTime;

        // Stock check
        const isOutOfStock = html.includes("Hết hàng") || 
                             html.includes("out-of-stock") || 
                             html.includes("outofstock") ||
                             /class=["'][^"']*out-of-stock[^"']*["']/i.test(html);
        
        const isAvailable = !isOutOfStock;

        // Title extraction
        let title = 'Sách Nobita';
        const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) || 
                           html.match(/<title>(.*?)<\/title>/i) ||
                           html.match(/<h1[^>]*class=["'][^"']*product_title[^"']*["'][^>]*>(.*?)<\/h1>/i);
        if (titleMatch) {
            title = titleMatch[1].replace(/ - Nobita\.vn$/i, '').replace(/ – Nobita$/i, '').trim();
        }

        // Image extraction
        let image = '';
        const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i);
        if (imgMatch) {
            image = imgMatch[1];
        }

        // Price extraction
        let price = 0;
        const priceMatch = html.match(/class=["'][^"']*woocommerce-Price-amount[^"']*["'][^>]*>([\d\.,]+)&nbsp;₫<\/span>/i) ||
                           html.match(/class=["']price["'][^>]*>[\s\S]*?([\d\.,]+)\s*₫/i) ||
                           html.match(/(\d[\d\.]*)\s*đ/i);
        if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\./g, '').replace(/,/g, ''), 10) || 0;
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
            platform: 'nobita',
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
            platform: 'nobita',
            error: err.name === 'AbortError' ? 'Timeout khi chờ kết nối Nobita.vn (quá 20 giây)' : err.message,
            url: url,
            responseTimeMs: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = { scrapeNobita };
