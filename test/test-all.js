const { scrapeProduct } = require('../scrapers');

const TEST_URLS = [
    {
        name: "Tiki.vn",
        url: "https://tiki.vn/sach-ai-do-tap-3-p279695769.html?spid=279695871"
    },
    {
        name: "AZ Vietnam",
        url: "https://azvietnam.vn/products/aido3"
    },
    {
        name: "Fahasa.com",
        url: "https://www.fahasa.com/ai-do-tap-3-ban-dac-biet-bia-cung-tang-kem-bookmark-postcard-card-pvc-moc-dien-thoai-bao-dung-the-kem-day-deo-so-lo-xo.html?fhs_campaign=SEARCH"
    },
    {
        name: "Nobita.vn",
        url: "https://nobita.vn/san-pham/ai-do-tap-3-ban-dac-biet"
    }
];

async function runTests() {
    console.log("====================================================");
    console.log("🧪 STARTING AUTOMATED SCRAPING TESTS FOR ALL 4 SITES");
    console.log("====================================================\n");

    let passCount = 0;

    for (const testItem of TEST_URLS) {
        console.log(`[TESTING] ${testItem.name}: ${testItem.url}`);
        const start = Date.now();
        const res = await scrapeProduct(testItem.url);
        const elapsed = Date.now() - start;

        if (res.success) {
            passCount++;
            console.log(`  ✅ SUCCESS (${elapsed}ms)`);
            console.log(`     Title: ${res.title}`);
            console.log(`     Price: ${res.price} VND`);
            console.log(`     Overall Stock Status: ${res.available ? 'CÒN HÀNG (Available)' : 'HẾT HÀNG (Out of Stock)'}`);
            if (res.variants && res.variants.length > 0) {
                console.log(`     Variants breakdown (${res.variants.length}):`);
                res.variants.forEach(v => {
                    console.log(`       - ${v.title}: ${v.available ? 'CÒN HÀNG' : 'HẾT HÀNG'} (${v.price} VND)`);
                });
            }
        } else {
            console.log(`  ❌ FAILED (${elapsed}ms): ${res.error}`);
        }
        console.log("----------------------------------------------------\n");
    }

    console.log("====================================================");
    console.log(`📊 TEST SUMMARY: ${passCount}/${TEST_URLS.length} Scrapers Passed Successfully!`);
    console.log("====================================================");

    if (passCount === TEST_URLS.length) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests();
