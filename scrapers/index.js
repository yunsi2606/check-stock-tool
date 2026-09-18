const { scrapeTiki } = require('./tiki');
const { scrapeAzVietnam } = require('./azvietnam');
const { scrapeFahasa } = require('./fahasa');
const { scrapeNobita } = require('./nobita');
const { scrapeShopee } = require('./shopee');

/**
 * Detect platform from URL
 */
function detectPlatform(url) {
    if (!url || typeof url !== 'string') return 'unknown';
    const lower = url.toLowerCase();
    if (lower.includes('tiki.vn')) return 'tiki';
    if (lower.includes('azvietnam.vn')) return 'azvietnam';
    if (lower.includes('fahasa.com')) return 'fahasa';
    if (lower.includes('nobita.vn')) return 'nobita';
    if (lower.includes('shopee.vn') || lower.includes('shope.ee') || lower.includes('shp.ee')) return 'shopee';
    return 'unknown';
}

/**
 * Main scraper dispatcher
 */
async function scrapeProduct(url, targetVariant = 'all') {
    const platform = detectPlatform(url);
    switch (platform) {
        case 'tiki':
            return await scrapeTiki(url, targetVariant);
        case 'azvietnam':
            return await scrapeAzVietnam(url, targetVariant);
        case 'fahasa':
            return await scrapeFahasa(url);
        case 'nobita':
            return await scrapeNobita(url);
        case 'shopee':
            return await scrapeShopee(url, targetVariant);
        default:
            return {
                success: false,
                platform: 'unknown',
                error: `Không hỗ trợ trang web này. Chỉ hỗ trợ: Tiki, AZ Vietnam, Fahasa, Nobita.vn, Shopee`,
                url: url,
                responseTimeMs: 0,
                timestamp: new Date().toISOString()
            };
    }
}

module.exports = {
    detectPlatform,
    scrapeProduct,
    scrapeTiki,
    scrapeAzVietnam,
    scrapeFahasa,
    scrapeNobita,
    scrapeShopee
};
