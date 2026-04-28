import TradingView from '@mathieuc/tradingview';

export function getDynamicRange() {
    const sekarang = new Date();
    // Konversi waktu sekarang ke zona Jakarta
    const jktTime = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(sekarang);

    const [jam, menit] = jktTime.split('.').map(Number); // id-ID kadang pake titik

    // Jam 09:00 dalam menit adalah 9 * 60 = 540
    const menitSekarang = (jam * 60) + menit;
    const menitBuka = 9 * 60; // 09:00

    let diff = menitSekarang - menitBuka;

    // Kalau diff negatif (dipanggil jam 8 pagi), balikin range minimal
    if (diff < 0) diff = 0;

    // Tambahin buffer 30-60 menit buat jaga-jaga clock drift atau data awal
    return diff + 20; 
}

// --- HELPER 1: Aturan Fraksi BEI ---
function getNextPrice(currentPrice) {
    if (currentPrice < 200) return currentPrice + 1;
    if (currentPrice < 500) return currentPrice + 2;
    if (currentPrice < 2000) return currentPrice + 5;
    if (currentPrice < 5000) return currentPrice + 10;
    return currentPrice + 25;
}

// --- CORE: Fungsi Narik Data dari TV ---
export async function fetchTV1mCandles(ticker, rangeCount = 20) {
    
    return new Promise((resolve, reject) => {
        const client = new TradingView.Client();
        const chart = new client.Session.Chart();

        chart.setMarket(`IDX:${ticker}`, {
            timeframe: '1',
            range: rangeCount, // Ambil 400 menit terakhir (Full jam bursa)
        });

        chart.onUpdate(() => {
            if (chart.periods.length > 0) {
                // const today = new Date().getDate();
                const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
                const candles = chart.periods
                    .map(p => ({
                        dateObj: new Date(p.time * 1000),
                        open: p.open,
                        high: p.max,
                        low: p.min,
                        close: p.close,
                        volume: p.volume
                    }))
                    .filter(c => {
                        // Samain tanggal candle sama tanggal Jakarta hari ini
                        const candleDate = c.dateObj.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
                        return candleDate === todayWIB;
                    });

                if (candles.length > 0) {
                    client.end();
                    resolve(candles);
                }
            }
        });

        chart.onError((err) => {
            client.end();
            reject(err);
        });

        setTimeout(() => { client.end(); reject(new Error("TV Timeout")); }, 2000);
    });
}

// --- CORE: Mesin Pencincang Volume Profile (Zone Bucket) ---
export function calculateVolumeProfile(candles) {
    let volumeByPrice = {};
    let totalVolumeHarianLot = 0; // Ini buat pembagi persentase nanti
    const BODY_RATIO = 0.85; 

    // --- STEP 1: Hitung Total Volume Harian Dulu (Dalam Lot) ---
    candles.forEach(c => {
        totalVolumeHarianLot += Math.floor(c.volume / 100);
    });

    // --- STEP 2: Cincang Volume Per Candle ---
    for (const candle of candles) {
        const volumeLot = Math.floor(candle.volume / 100);
        if (volumeLot === 0) continue;

        let priceLevels = [];
        let p = candle.low;
        while (p <= candle.high) {
            priceLevels.push(p);
            if (p === candle.high) break;
            p = getNextPrice(p); 
        }

        let buyRatio = (candle.close > candle.open) ? 0.65 : (candle.close < candle.open ? 0.35 : 0.5);

        const topBody = Math.max(candle.open, candle.close);
        const bottomBody = Math.min(candle.open, candle.close);
        let bodyPrices = [], upperWickPrices = [], lowerWickPrices = [];

        for (const price of priceLevels) {
            if (price > topBody) upperWickPrices.push(price);
            else if (price < bottomBody) lowerWickPrices.push(price);
            else bodyPrices.push(price);
        }

        // Distribusi Volume (Tetap pakai logic Zone Bucket lu)
        let bodyVol = Math.floor(volumeLot * BODY_RATIO);
        let remainingVol = volumeLot - bodyVol;
        
        const distribute = (prices, vol) => {
            if (prices.length === 0 || vol === 0) return;
            const volPerTick = Math.floor(vol / prices.length);
            for (const price of prices) {
                if (!volumeByPrice[price]) volumeByPrice[price] = { total: 0, buy: 0, sell: 0 };
                const b = Math.floor(volPerTick * buyRatio);
                volumeByPrice[price].total += volPerTick;
                volumeByPrice[price].buy += b;
                volumeByPrice[price].sell += (volPerTick - b);
            }
        };

        distribute(bodyPrices, bodyVol);
        distribute(upperWickPrices, Math.floor(remainingVol / 2));
        distribute(lowerWickPrices, Math.ceil(remainingVol / 2));
    }

    // --- STEP 3: Hitung Percentage Terhadap TOTAL HARIAN ---
    let maxVol = 0, pocPrice = null;
    const finalData = Object.entries(volumeByPrice).map(([price, data]) => {
        if (data.total > maxVol) {
            maxVol = data.total;
            pocPrice = Number(price);
        }
        const rawPercentage = totalVolumeHarianLot > 0 ? (data.total / totalVolumeHarianLot) * 100 : 0;
        return {
            price: Number(price),
            buy_lots: data.buy,
            sell_lots: data.sell,
            total_lots: data.total,
            percentage: parseFloat(rawPercentage.toFixed(2))
        };
    }).sort((a, b) => b.price - a.price);

    return { data: finalData, poc_price: pocPrice, totalVolumeHarian: totalVolumeHarianLot };
}