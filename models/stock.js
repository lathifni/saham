import mongoose from 'mongoose';

const StockSchema = new mongoose.Schema({
    // --- 1. IDENTITAS (Tetap di Root biar gampang dicari) ---
    symbol: { type: String, required: true, unique: true },
    company: String,
    sector: { type: String, index: true },

    // --- 2. DATA HARGA REALTIME (Tetap di Root) ---
    open: Number,
    high: Number,
    low: Number,
    close: Number,
    change: Number,
    changePct: Number,
    volume: Number,
    previousClose: Number,

    // --- 3. STATISTIK BECORP (Diskon/Reversal) ---
    percentageDownATH: Number,
    percentageUpFromBottom: Number,
    fiftyTwoWeekHigh: Number,
    fiftyTwoWeekLow: Number,
    avgVol10day: Number,
    avgVol3M: Number,

    // --- 4. FUNDAMENTALS (Kelompok Baru) 📊 ---
    fundamentals: {
        sharesOutstanding: Number, // Lembar Saham
        floatShares: Number,       // Saham Publik
        marketCap: Number,
        pe_ratio: String,      // PER
        eps: String,           // EPS
        priceToBook: String,   // PBV
        dividendYield: String, // Yield
        profitMargins: String, // Margin Laba
        incomeQoQ: String,     // Growth Laba (QoQ)
        bookValue: Number,      // Nilai Buku (Tambahan)
        lastDividendValue: Number,
        enterpriseValue: Number,
        enterpriseToEBITDA: String,
        enterpriseToRevenue: String,
        netIncomeToCommon: Number,
    },

    // --- 5. KEPEMILIKAN (Ownership) ---
    ownership: {
        insiders: String, 
        institutions: String,
        // Data 1 (Statis Efek)
        local_percentage: Number,    // Dari "Local (%)"
        foreign_percentage: Number,  // Dari "Foreign (%)"
        total_scripless: Number,     // Dari "Total Scripless"
        
        // Data 2 (Balance Position) - Kita kelompokin biar rapi
        composition: {
            local: {
                IS: Number, CP: Number, PF: Number, IB: Number, ID: Number,
                MF: Number, SC: Number, FD: Number, OT: Number, Total: Number
            },
            foreign: {
                IS: Number, CP: Number, PF: Number, IB: Number, ID: Number,
                MF: Number, SC: Number, FD: Number, OT: Number, Total: Number
            }
        },

        // Data 3 (PDF 1% Ownership) - Array of Objects
        top_shareholders: [new mongoose.Schema({
            investor_name: String,   // "INVESTOR_NAME"
            investor_type: String,   // "INVESTOR_TYPE" (CP, ID, dll)
            local_foreign: String,   // "L" atau "F"
            holding_shares: Number,  // "TOTAL_HOLDING_SHARES"
            percentage: Number       // "PERCENTAGE"
        }, { _id: false })],

        last_updated: Date
    },

    // --- 6. TEKNIKAL (Moving Averages) ---
    movingAverages: {
        ma50: Number,
        ma200: Number
    },

    // --- 7. TRADING PLAN ---
    trading_plan: {
        pivot: Number,
        best_entry: [Number],
        avg_down: [Number],
        support_pertahanan: Number,
        support_kuat: Number,
        support_awal: Number,
        tsp1: Number,
        tsp2: Number,
        tsp3: Number,
        rekomendasi: String
    },

    smart_money_map: {
        jenis: String,
        SAV: Number,
        support_pertahanan: Number,
        support_kuat: Number,
        support_awal: Number,
        TSP1: Number,
        TSP2: Number,
        TSP3: Number,
    },

    reaccum_plan: {
        reaccum1: { type: [Number], default: null },
        reaccum2: { type: [Number], default: null },
        reaccum3: { type: [Number], default: null },
        reaccum4: { type: [Number], default: null },
        reaccum5: { type: [Number], default: null },
    },

    volume_profile: {
        last_interval: Date,
        // Kita buat definisinya pake Schema eksplisit biar bisa dikasih opsi _id: false
        data: [new mongoose.Schema({
            price: Number,
            buy_lots: Number,
            sell_lots: Number,
            total_lots: Number,
            percentage: Number 
        }, { _id: false })], // 🔥 Ini kuncinya, Thif!
        poc_price: Number
    },

    screener: {
        is_big_money: { type: Boolean, default: false },
        big_money_count: { type: Number, default: 0 },
        small_money_count: { type: Number, default: 0 },
        is_small_accum: { type: Boolean, default: false },
        is_scalping: { type: Boolean, default: false },

        // FIELD BUAT SORTING (PENTING!)
        total_value_today: { type: Number, default: 0 }, // Buat ranking likuiditas
        change_pct: { type: Number, default: 0 },        // Buat ranking kenaikan
        avg_value_transaction: { type: Number, default: 0 },
        one_years_up: { type: Boolean, default: false },

        ma20: { type: Number, default: 0 },
        one_year_return: { type: Number, default: 0 },
        tx_value: { type: Number, default: 0 },       // Transaction Value Today
        vol_spike_ratio: { type: String, default: "-" }, // String karena hasil toFixed (misal "1.5x")
        last_updated: Date
    },

    last_updated: { type: Date, default: Date.now }
});
StockSchema.index({ changePct: -1 }); // Index buat Gainers
StockSchema.index({ changePct: 1 });  // Index buat Losers
StockSchema.index({ volume: -1 });    // Index buat Volume

export default mongoose.model('Stock', StockSchema);