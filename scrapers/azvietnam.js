/**
 * Scraper module for AZ Vietnam (Haravan platform) using .js JSON API
 */
async function scrapeAzVietnam(url) {
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

        const variants = (data.variants || []).map(v => ({
            id: String(v.id),
            title: v.title,
            price: Math.round(v.price / 100),
            originalPrice: v.compare_at_price ? Math.round(v.compare_at_price / 100) : Math.round(v.price / 100),
            available: Boolean(v.available),
            sku: v.sku || ''
        }));

        const isAnyVariantAvailable = variants.some(v => v.available);

        return {
            success: true,
            platform: 'azvietnam',
            title: data.title || 'AZ Vietnam Product',
            price: variants.length > 0 ? variants[0].price : Math.round((data.price || 0) / 100),
            available: isAnyVariantAvailable || Boolean(data.available),
            image: image,
            variants: variants,
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
