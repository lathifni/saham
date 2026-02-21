import mongoose from 'mongoose';
import { YahooFinance } from 'yahoo-finance2';
import StockModel from './models/stock.js'; // Pastikan path ini bener sesuai folder kamu
import dotenv from 'dotenv';

dotenv.config(); // Baca .env

const yahooFinance = new YahooFinance();

// --- 1. KAMUS SEKTORAL (UPDATE DISINI KALAU ADA TAMBAHAN) ---
const SECTOR_DB = {
    "BASIC_IND": [
        "GDST", "KRAS", "BAJA", "SMBR", "NPGF", "SOLA", "KKES", "WTON", "NIKL", "MDKA", 
        "NICL", "DKFT", "ANTM", "SMLE", "MBMA", "ESSA", "SBMA", "TINS", "OPMS", "CTBN", 
        "INTP", "BLES", "SMGR", "NICE", "PSAB", "TALF", "ALKA", "SMGA", "BATR", "BRMS", 
        "SULI", "ARCI", "TRST", "NCKL", "BRNA", "MDKI", "INCO", "LTLS", "AGII", "UNIC", 
        "AKPI", "SAMF", "KDSI", "INAI", "ZINC", "SQMI", "CHEM", "SMCB", "TIRT", "BEBS", 
        "SRSN", "ETWA", "KAYU", "HKMU", "SIMA", "KBRI", "TDPM", "PURE", "JKSW", "ALMI", 
        "YPAS", "FASW", "GGRP", "LMSH", "ESIP", "SWAT", "ADMG", "IGAR", "CMNT", "APLI", 
        "CITA", "TKIM", "PDPP", "WSBP", "PBID", "CLPI", "INKP", "FPNI", "OBMD", "INTD", 
        "AMMN", "PPRI", "IFSH", "IPOL", "PICO", "KMTR", "SPMA", "IFII", "INCI", "AYLS", 
        "ALDO", "TPIA", "SMKL", "OKAS", "DPNS", "ISSP", "EKAD", "INRU", "BRPT", "MOLI", 
        "BTON", "TBMS", "INCF", "BMSR", "EPAC"
    ],
    "BANKING": ["BBCA", "BBRI", "BMRI", "BBNI", "BRIS", "ARTO", "BBTN", "BJBR"], // Contoh Sektor Lain
    // Tambahkan sektor lain nanti...
};

// --- 2. HELPER FUNCTIONS ---

// Tidur (Jeda)
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Pembulatan Harga (Fraksi Saham Indo)
function bulatkanHarga(harga) {
    if (harga <= 0) return 0;
    let tick = 1;
    if (harga > 5000) tick = 25;
    else if (harga > 2000) tick = 10;
    else if (harga > 500) tick = 5;
    else if (harga > 200) tick = 2;
    return Math.ceil(harga / tick) * tick;
}

// Kalkulator Rumus Becorp
function calculatePlan(price, high, low, yearHigh, yearLow) {
    price = price || 0; high = high || 0; low = low || 0;

    const rawPivot = (price + high + low) / 3;
    const pivot = bulatkanHarga(rawPivot);

    const s1 = bulatkanHarga((2 * pivot) - high);
    const s2 = bulatkanHarga(pivot - (high - low));
    const s3 = bulatkanHarga(low - (2 * (high - pivot)));

    const tsp1 = bulatkanHarga((2 * pivot) - low);
    const tsp2 = bulatkanHarga(pivot + (high - low));
    const tsp3 = bulatkanHarga(high + (2 * (pivot - low)));

    // Persentase
    let pctDownATH = "0.00";
    if (yearHigh > 0) pctDownATH = (((yearHigh - price) / yearHigh) * 100).toFixed(2);

    let pctUpBottom = "0.00";
    if (yearLow > 0) pctUpBottom = (((price - yearLow) / yearLow) * 100).toFixed(2);

    return {
        pivot, s1, s2, s3, tsp1, tsp2, tsp3,
        pctDownATH, pctUpBottom
    };
}

// --- 3. FUNGSI UTAMA (The Worker) ---
async function runUpdate() {
    console.log("🚀 MEMULAI WORKER: UPDATE SAHAM SATU PER SATU...");

    try {
        // Konek ke MongoDB Atlas
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Database Connected. Mulai memproses...");

        // A. LOOPING SEKTOR
        for (const [sectorName, tickerList] of Object.entries(SECTOR_DB)) {
            console.log(`\n📂 Masuk Sektor: ${sectorName} (${tickerList.length} saham)`);
            
            // B. LOOPING SAHAM (SATU PER SATU)
            for (let i = 0; i < tickerList.length; i++) {
                const ticker = tickerList[i];
                const symbol = ticker + ".JK";

                try {
                    // 1. Ambil Data dari Yahoo
                    // Kita pakai quoteSummary biar datanya lengkap (termasuk EPS/PE)
                    const result = await yahooFinance.quoteSummary(symbol, {
                        modules: ["price", "summaryDetail", "defaultKeyStatistics"]
                    });

                    const priceData = result.price;
                    const summary = result.summaryDetail || {};
                    const stats = result.defaultKeyStatistics || {};

                    // Cek validitas harga
                    if (!priceData || !priceData.regularMarketPrice) {
                        console.log(`   ⚠️ Skip ${ticker}: Data harga kosong.`);
                        continue;
                    }

                    // 2. Siapkan Variabel buat Rumus
                    const price = priceData.regularMarketPrice;
                    const high = priceData.regularMarketDayHigh;
                    const low = priceData.regularMarketDayLow;
                    const yearHigh = summary.fiftyTwoWeekHigh;
                    const yearLow = summary.fiftyTwoWeekLow;

                    // 3. Hitung Rumus
                    const plan = calculatePlan(price, high, low, yearHigh, yearLow);

                    // 4. Simpan ke MongoDB (Upsert: Update if exists, Insert if new)
                    await StockModel.findOneAndUpdate(
                        { symbol: symbol },
                        {
                            symbol: symbol,
                            company: priceData.longName || priceData.shortName,
                            sector: sectorName, // <-- INI PENTING (Hardcode Sector)

                            price: price,
                            change: priceData.regularMarketChange,
                            changePct: (priceData.regularMarketChangePercent * 100).toFixed(2) + "%",
                            
                            high: high,
                            low: low,
                            volume: summary.volume,
                            
                            // Data Fundamental (Opsional buat list)
                            market_cap: priceData.marketCap,
                            pe_ratio: summary.trailingPE,
                            eps: stats.trailingEps,

                            // Statistik
                            percentageDownATH: plan.pctDownATH,
                            percentageUpFromBottom: plan.pctUpBottom,

                            // Trading Plan
                            trading_plan: {
                                pivot: plan.pivot,
                                support_pertahanan: plan.s1,
                                support_kuat: plan.s2,
                                support_awal: plan.s3,
                                
                                best_entry: [plan.s2, plan.s1],
                                avg_down: [plan.s3, plan.s2],
                                
                                tsp1: plan.tsp1,
                                tsp2: plan.tsp2,
                                tsp3: plan.tsp3,
                                rekomendasi: price < plan.s3 ? "WAIT" : "BUY/HOLD"
                            },

                            last_updated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    // Log Sukses
                    console.log(`   ✅ [${i+1}/${tickerList.length}] ${ticker} Updated. Price: ${price}`);

                } catch (err) {
                    console.error(`   ❌ Gagal ${ticker}: ${err.message}`);
                }

                // 5. JEDA 1 DETIK (BIAR AMAN)
                await sleep(1000); 
            }
        }

        console.log("\n🎉 SEMUA SELESAI! Worker akan istirahat.");

    } catch (err) {
        console.error("FATAL ERROR:", err);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Jalankan
runUpdate();