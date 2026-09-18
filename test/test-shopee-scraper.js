const { scrapeProduct, detectPlatform } = require('../scrapers');

async function testShopeeIntegration() {
    const urls = [
        'https://shopee.vn/S%C3%81CH-VE-S%E1%BA%A6U-M%C3%99A-H%E1%BA%A0-L%E1%BA%AENG-NGHE-TUY%E1%BA%BET-TAN-T%E1%BA%ACP-H%E1%BA%A0-THU-MERBOOKS-(B%E1%BA%A2N-TH%C6%AF%E1%BB%9CNG-B%E1%BA%A2N-%C4%90%E1%BA%B6C-BI%E1%BB%86T)-i.1803887349.51667561572'
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
