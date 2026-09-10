const { scrapeTiki } = require('../scrapers/tiki');

async function testTikiTargetVariant() {
    const url = "https://tiki.vn/sach-ai-do-tap-3-p279695769.html?spid=279695871";
    
    console.log("--- Test 1: Tiki default (no target variant filter) ---");
    const res1 = await scrapeTiki(url, 'all');
    console.log("Overall Available:", res1.available);
    console.log("Variants:", res1.variants);

    console.log("\n--- Test 2: Tiki filtering target variant 'Bản Đặc Biệt' ---");
    const res2 = await scrapeTiki(url, 'Bản Đặc Biệt');
    console.log("Overall Available:", res2.available);
    console.log("Variants:", res2.variants);
}

testTikiTargetVariant();
