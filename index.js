import 'dotenv/config'; // Cara baru load .env
import express from 'express';
import cors from 'cors';
import YahooFinance from 'yahoo-finance2'; // Import Class-nya langsung

const app = express();
const PORT = process.env.PORT || 3000;

// Kita buat instance baru secara manual (Biar gak error singleton)
const yahooFinance = new YahooFinance(); 

app.use(cors());
app.use(express.json());

// --- ROUTE UTAMA ---
app.get('/api/analyze', async (req, res) => {
  const ticker = req.query.ticker;

  if (!ticker) {
      return res.status(400).json({ error: "Bro, masukin kode sahamnya dong! (?ticker=KODE)" });
  }

  try {
    const symbol = ticker.toUpperCase() + ".JK"; 
    
    // 1. AMBIL DATA LENGKAP
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics"]
    });

    const priceData = result.price;
    const summary = result.summaryDetail;
    console.log(summary);
    
    const stats = result.defaultKeyStatistics;

    // 2. DATA MENTAH
    const currentPrice = priceData.regularMarketPrice;
    const high = priceData.regularMarketDayHigh;
    const low = priceData.regularMarketDayLow;
    const open = priceData.regularMarketOpen;

    // 3. RUMUS BECORP
    const pivot = (high + low + currentPrice) / 3;
    const support1 = (2 * pivot) - high;
    const resistance1 = (2 * pivot) - low;

    // 4. RESPONSE JSON
    res.json({
      meta: {
        symbol: ticker.toUpperCase(),
        company: priceData.longName,
        timestamp: new Date()
      },
      data_mentah: {
        // Harga & Volume -> Gak mungkin minus, aman dikasih 0 kalau error
        price: currentPrice ?? 0,
        open: open ?? 0,
        high: high ?? 0,
        low: low ?? 0,
        volume: summary.volume ?? 0,
        market_cap: priceData.marketCap ?? 0, // Market Cap jarang minus
        
        // --- BAGIAN INI KITA UBAH ---
        // PE & EPS -> Bisa Minus. Kalau undefined, biarkan null.
        // Kita pakai '|| null' untuk memastikan kalau undefined jadi null beneran.
        pe_ratio: summary.trailingPE || null, 
        eps: stats.trailingEps || null,
        
        // Shares juga biarkan null kalau gak ketemu
        sharesOutstanding: stats.sharesOutstanding || null,
        
        // Data teknikal lain
        fiftyTwoWeekLow: summary.fiftyTwoWeekLow ?? 0,
        fiftyTwoWeeksHigh: summary.fiftyTwoWeekHigh ?? 0,
        fiftyDayAverage: summary.fiftyDayAverage ?? 0, 
        twoHundredDayAverage: summary.twoHundredDayAverage ?? 0,
    },
      trading_plan: {
        action: "ANALYSIS", 
        pivot_point: Math.round(pivot),
        support_kuat: Math.round(support1),
        target_sell: Math.round(resistance1),
        rekomendasi: currentPrice < support1 ? "WAIT" : "HOLD"
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ 
      error: "Saham tidak ditemukan atau error server", 
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server Excellent Becorp jalan di port ${PORT}`);
  console.log(`Tes di browser: http://localhost:${PORT}/api/analyze?ticker=TAYS`);
});