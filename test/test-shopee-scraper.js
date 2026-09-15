const { scrapeProduct, detectPlatform } = require('../scrapers');

async function testShopeeIntegration() {
    const urls = [
        'https://shopee.vn/product/88234394/21834279564',
        'https://shopee.vn/S%C3%A1ch-Ai-%C4%90%C3%B3-T%E1%BA%ADp-3-i.88234394.21834279564'
    ];

    console.log('=== TESTING SHOPEE SCRAPER INTEGRATION ===\n');

    for (const u of urls) {
        console.log(`URL: ${u}`);
        console.log(`Detected Platform: ${detectPlatform(u)}`);

        const result = await scrapeProduct(u, 'all');
        console.log('Result Success:', result.success);
        console.log('Platform:', result.platform);
        console.log('Title:', result.title);
        console.log('Price:', result.price);
        console.log('Available:', result.available);
        console.log('StockQty:', result.stockQty);
        console.log('Image:', result.image);
        console.log('Variants:', result.variants);
        console.log('Response Time:', `${result.responseTimeMs}ms`);
        console.log('--------------------------------------------------\n');
    }
}

testShopeeIntegration();
