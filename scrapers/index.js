const { scrapeTiki } = require('./tiki');
const { scrapeAzVietnam } = require('./azvietnam');
const { scrapeFahasa } = require('./fahasa');
const { scrapeNobita } = require('./nobita');

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
            return await scrapeAzVietnam(url);
        case 'fahasa':
            return await scrapeFahasa(url);
        case 'nobita':
            return await scrapeNobita(url);
        default:
            return {
                success: false,
                platform: 'unknown',
                error: `Không hỗ trợ trang web này. Chỉ hỗ trợ: Tiki, AZ Vietnam, Fahasa, Nobita.vn`,
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
    scrapeNobita
};
