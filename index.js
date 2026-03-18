import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import YahooFinance from 'yahoo-finance2';
import StockModel from './models/stock.js';
import UserModel from './models/user.js'
import CommentModel from './models/comment.js'
import axios from 'axios';
import admin from 'firebase-admin'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const serviceAccount = require("./serviceAccountKey.json");
import maskData from './utils/dataMasker.js'; // 👈 Jangan lupa import
import optionalAuth from './middleware/optionalAuth.js'; // Import middleware tadi
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const cron = require('node-cron');

dotenv.config();

const app = express();
const yahooFinance = new YahooFinance();
const PORT = process.env.PORT || 3000;
let rankingsCache = null;
let lastRankingsTime = 0;
const RANKING_CACHE_DURATION = 60 * 10;
let summaryCache = null;
let lastSummaryTime = 0;
const SUMMARY_CACHE_DURATION = 60 * 10;
let ihsgCache = null;         // Tempat nyimpen data chart
let lastIhsgTime = 0;         // Kapan terakhir data diambil
const IHSG_CACHE_DURATION = 60 * 10; // 1 Jam (3600000 ms)

app.use(cors());
app.use(express.urlencoded({ extended: true })); 
app.use(express.json());

// 1. KONEKSI MONGODB
mongoose.connect(process.env.MONGODB_URI, { dbName: 'excellent' })
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => console.log("❌ DB Error:", err));

// 2. KAMUS SEKTORAL
const SECTOR_MAP = {
    // "BASIC_INDUSTRIAL":["MTEL"
    // ],
    "BASIC_INDUSTRIAL": [
        "AKPI", "ALDO", "ALKA", "ALMI", "ANTM", "APLI", "BAJA", "BMSR", "BRMS", "BRNA", 
        "BRPT", "BTON", "CITA", "CLPI", "CTBN", "DKFT", "DPNS", "EKAD", "ESSA", "ETWA", 
        "FASW", "FPNI", "GDST", "IGAR", "INAI", "INCI", "INCO", "INKP", "INRU", "INTD", 
        "INTP", "IPOL", "ISSP", "KBRI", "KDSI", "KRAS", "LMSH", "LTLS", "MDKA", "NIKL", 
        "OKAS", "PICO", "PSAB", "SIMA", "SMBR", "SMCB", "SMGR", "SPMA", "SQMI", "SRSN", 
        "SULI", "TALF", "TBMS", "TINS", "TIRT", "TKIM", "TPIA", "TRST", "UNIC", "WTON", 
        "YPAS", "INCF", "WSBP", "KMTR", "MDKI", "ZINC", "PBID", "TDPM", "SWAT", "MOLI", 
        "HKMU", "KAYU", "SMKL", "GGRP", "OPMS", "PURE", "ESIP", "IFSH", "IFII", "SAMF", 
        "EPAC", "BEBS", "NPGF", "ARCI", "NICL", "SBMA", "CMNT", "OBMD", "AVIA", "CHEM", 
        "KKES", "PDPP", "FWCT", "PACK", "AMMN", "PPRI", "SMGA", "SOLA", "BATR", "BLES", 
        "PTMR", "DAAZ", "DGWG", "MINE", "ASPR", "EMAS", "AYLS", "NCKL", "MBMA", "NICE", 
        "SMLE", "ADMG", "AGII"],
    "CYCLICAL": [
        "ABBA", "ACES", "AKKU", "ARGO", "ARTA", "AUTO", "BATA", "BAYU", "BIMA", "BLTZ", 
        "BMTR", "BOLT", "BRAM", "BUVA", "CINT", "CNTX", "CSAP", "ECII", "ERAA", "ERTX", 
        "ESTI", "FAST", "FORU", "GDYR", "GEMA", "GJTL", "GLOB", "GWSA", "HOME", "HOTL", 
        "IIKP", "IMAS", "INDR", "INDS", "JIHD", "JSPT", "KICI", "KPIG", "LMPI", "LPIN", 
        "LPPF", "MAPI", "MDIA", "MGNA", "MICE", "MNCN", "MPMX", "MSKY", "MYTX", "PANR", 
        "PBRX", "PDES", "PGLI", "PJAA", "PSKT", "PTSP", "RALS", "RICY", "SCMA", "SHID", 
        "SMSM", "SONA", "SRIL", "SSTM", "TELE", "TFCO", "TMPO", "TRIO", "TRIS", "UNIT", 
        "VIVA", "JGLE", "MARI", "MKNT", "BOGA", "CARS", "MINA", "MAPB", "WOOD", "HRTA", 
        "MABA", "BELL", "DFAM", "PZZA", "MSIN", "MAPA", "NUSA", "FILM", "DIGI", "DUCK", 
        "YELO", "SOTS", "ZONE", "CLAY", "NATO", "HRME", "FITT", "BOLA", "POLU", "IPTV", 
        "EAST", "KOTA", "INOV", "SLIS", "PMJS", "SBAT", "CBMF", "CSMI", "SOFA", "TOYS", 
        "SCNP", "PLAN", "SNLK", "LFLO", "LUCY", "MGLV", "IDEA", "DEPO", "DRMA", "ASLC", 
        "NETV", "BAUT", "ENAK", "BIKE", "OLIV", "SWID", "RAFI", "KLIN", "TOOL", "KDTN", 
        "ZATA", "ISAP", "BMBL", "FUTR", "HAJJ", "TYRE", "VKTR", "CNMA", "ERAL", "LMAX", 
        "BABY", "AEGS", "GRPH", "UNTD", "MEJA", "LIVE", "BAIK", "SPRE", "PART", "GOLF", 
        "DOSS", "VERN", "MDIY", "MERI", "PMUI", "KAQI", "ESTA", "RAAM", "DOOH", "ACRO", 
        "UFOE", "PNSE", "POLY"],
        // "FINANCE": ['BBCA'],
    "FINANCE": [
        "ABDA", "AMAG", "APIC", "ARTO", "ASBI", "ASDM", "ASJT", "ASMI", "ASRM", "BABP", 
        "BACA", "BBCA", "BBHI", "BBKP", "BBLD", "BBMD", "BBNI", "BBRI", "BBTN", "BBYB", 
        "BCAP", "BCIC", "BDMN", "BEKS", "BFIN", "BGTG", "BINA", "BJBR", "BJTM", "BKSW", 
        "BMAS", "BMRI", "BNBA", "BNGA", "BNII", "BNLI", "BPFI", "BPII", "BSIM", "BSWD", 
        "BTPN", "BVIC", "CFIN", "DEFI", "DNAR", "DNET", "GSMF", "HDFA", "INPC", "LPGI", 
        "LPPS", "MAYA", "MCOR", "MEGA", "MREI", "NISP", "NOBU", "OCAP", "PADI", "PALM", 
        "PANS", "PEGE", "PLAS", "PNBN", "PNBS", "PNIN", "PNLF", "RELI", "SDRA", "SMMA", 
        "SRTG", "STAR", "TIFA", "TRIM", "TRUS", "VICO", "VINS", "VRNA", "WOMF", "YULE", 
        "CASA", "BRIS", "MTWI", "JMAS", "NICK", "BTPS", "TUGU", "POLA", "SFAN", "LIFE", 
        "FUJI", "AMAR", "AMOR", "BHAT", "BBSI", "BANK", "MASB", "VTNY", "YOII", "COIN", 
        "SUPA", "ADMF", "AGRO", "AGRS", "AHAP", "POOL"],
    "ENERGY": [
        "ABMM", "AKRA", "APEX", "ARII", "ARTI", "BBRM", "BIPI", "BSSR", "BULL", "BUMI", 
        "BYAN", "CANI", "CNKO", "DEWA", "DOID", "DSSA", "ELSA", "ENRG", "GEMS", "GTBO", 
        "HITS", "HRUM", "IATA", "INDY", "ITMA", "ITMG", "KKGI", "KOPI", "LEAD", "MBAP", 
        "MBSS", "MEDC", "MTFN", "MYOH", "PGAS", "PKPK", "PTBA", "PTIS", "PTRO", "RAJA", 
        "RIGS", "RUIS", "SMMT", "SMRU", "SOCI", "SUGI", "TOBA", "TPMA", "TRAM", "WINS", 
        "SHIP", "TAMU", "FIRE", "PSSI", "DWGL", "BOSS", "JSKY", "INPS", "TCPI", "SURE", 
        "WOWS", "TEBE", "SGER", "UNIQ", "MCOL", "GTSI", "RMKE", "BSML", "ADMR", "SEMA", 
        "SICO", "COAL", "SUNI", "CBRE", "HILL", "CUAN", "MAHA", "RMKO", "HUMI", "RGAS", 
        "ALII", "MKAP", "ATLA", "BOAT", "AADI", "RATU", "PSAT", "BESS", "CGAS", "ADRO", 
        "AIMS"],
    "HEALTH": [
        "DVLA", "INAF", "KAEF", "KLBF", "MERK", "MIKA", "PYFA", "SAME", "SCPI", "SIDO",
        "SILO", "SRAJ", "TSPC", "PRDA", "PRIM", "HEAL", "PEHA", "IRRA", "SOHO", "BMHS", 
        "RSGK", "MTMH", "MEDS", "PRAY", "OMED", "MMIX", "PEVE", "HALO", "RSCH", "IKPM", 
        "SURI", "LABS", "OBAT", "CHEK", "MDLA", "DKHH", "CARE", "DGNS"],
    "NON_CYCLICAL": [
        "AALI", "ADES", "AISA", "ALTO", "AMRT", "ANJT", "BISI", "BTEK", "BUDI", "BWPT", 
        "CEKA", "CPIN", "CPRO", "DLTA", "DSFI", "DSNG", "EPMT", "FISH", "GGRM", "GOLL", 
        "GZCO", "HERO", "HMSP", "ICBP", "INDF", "JAWA", "JPFA", "LAPD", "LSIP", "MAGP", 
        "MAIN", "MBTO", "MIDI", "MLBI", "MLPL", "MPPA", "MRAT", "MYOR", "PSDN", "RANC", 
        "ROTI", "SDPC", "SGRO", "SIMP", "SIPD", "SKBM", "SKLT", "SMAR", "SSMS", "STTP", 
        "TBLA", "TCID", "TGKA", "ULTJ", "UNSP", "UNVR", "WAPO", "WICO", "WIIM", "DAYA", 
        "DPUM", "KINO", "CLEO", "HOKI", "CAMP", "PCAR", "MGRO", "ANDI", "GOOD", "FOOD", 
        "BEEF", "COCO", "ITIC", "KEJU", "PSGO", "AGAR", "UCID", "CSRA", "DMND", "IKAN", 
        "PGUN", "PNGO", "KMDS", "ENZO", "VICI", "PMMP", "WMUU", "TAPG", "FLMC", "OILS", 
        "BOBA", "CMRY", "TAYS", "WMPP", "IPPE", "NASI", "STAA", "NANO", "TLDN", "IBOS", 
        "ASHA", "TRGU", "DEWI", "GULA", "JARR", "AMMS", "EURO", "BUAH", "CRAB", "CBUT", 
        "MKTR", "SOUL", "BEER", "WINE", "NAYZ", "NSSS", "MAXI", "GRPM", "TGUK", "PTPS", 
        "STRK", "UDNG", "AYAM", "ISEA", "GUNA", "NEST", "BRRC", "RLCO", "YUPI", "FORE", 
        "MSJA", "FAPA"],
    "INDUSTRIAL": [
        "AMFG", "AMIN", "APII", "ARNA", "ASGR", "ASII", "BHIT", "BNBR", "CTTH", "DYAN", 
        "HEXA", "IBFN", "ICON", "IKAI", "IKBI", "IMPC", "INDX", "INTA", "JECC", "JTPE", 
        "KBLI", "KBLM", "KIAS", "KOBX", "KOIN", "KONI", "LION", "MDRN", "MFMI", "MLIA", 
        "SCCO", "TIRA", "TOTO", "TRIL", "UNTR", "VOKS", "ZBRA", "MARK", "SPTO", "SKRN", 
        "CAKK", "SOSS", "CCSI", "BLUE", "ARKA", "SINI", "HOPE", "LABA", "GPSO", "KUAS", 
        "BINO", "NTBK", "PADA", "KING", "PTMP", "SMIL", "CRSN", "WIDI", "FOLK", "MUTU", 
        "HYGN", "VISI", "MHKI", "NAIK", "PIPA"],
    "TECHNOLOGY": [
        "ATIC", "EMTK", "KREN", "LMAS", "MLPT", "MTDL", "PTSN", "SKYB", "KIOS", "MCAS", 
        "NFCX", "DIVA", "LUCK", "ENVY", "HDIT", "TFAS", "DMMX", "GLVA", "PGJO", "CASH", 
        "TECH", "EDGE", "ZYRX", "UVCR", "BUKA", "RUNS", "WGSH", "WIRG", "GOTO", "AXIO", 
        "BELI", "NINE", "ELIT", "IRSX", "CHIP", "TRON", "JATI", "CYBR", "IOTF", "MSTI", 
        "TOSK", "MPIX", "AREA", "MENN", "AWAN", "WIFI", "DCII"],
    "PROPERTY": [
        "APLN", "ASRI", "BAPA", "BCIP", "BEST", "BIKA", "BIPP", "BKDP", "BKSL", "BSDE", 
        "COWL", "CTRA", "DART", "DILD", "DMAS", "DUTI", "ELTY", "EMDE", "FMII", "GAMA", 
        "GMTD", "GPRA", "INPP", "JRPT", "KIJA", "LCGP", "LPCK", "LPKR", "LPLI", "MDLN", 
        "MKPI", "MMLP", "MTLA", "MTSM", "NIRO", "OMRE", "PLIN", "PUDP", "PWON", "RBMS", 
        "RDTX", "RIMO", "RODA", "SMDM", "SMRA", "TARA", "CSIS", "ARMY", "NASA", "RISE", 
        "POLL", "LAND", "PANI", "CITY", "MPRO", "SATU", "URBN", "POLI", "CPRI", "POSA", 
        "PAMG", "BAPI", "NZIA", "REAL", "INDO", "TRIN", "KBAG", "BBSS", "UANG", "PURI", 
        "HOMI", "ROCK", "ATAP", "ADCP", "TRUE", "IPAC", "WINR", "BSBK", "CBPE", "VAST", 
        "SAGE", "RELF", "HBAT", "GRIA", "MSIE", "KOCI", "KSIX", "CBDK", "DADA", "ASPI", 
        "AMAN", "PPRO"],
    "TRANSPORT": [
        "AKSI", "ASSA", "BIRD", "BLTA", "CMPP", "GIAA", "IMJS", "LRNA", "MIRA", "MITI", 
        "NELY", "SAFE", "SDMU", "SMDR", "TAXI", "TMAS", "WEHA", "HELI", "TRUK", "TNCA", 
        "BPTR", "SAPX", "DEAL", "JAYA", "KJEN", "PURA", "PPGL", "TRJA", "HAIS", "HATM", 
        "RCCC", "ELPI", "LAJU", "GTRA", "MPXL", "KLAS", "LOPI", "BLOG", "PJHB"],
    "INFRASTRUCTURE": [
        "ACST", "ADHI", "BALI", "BTEL", "BUKK", "CASS", "CENT", "CMNP", "DGIK", "EXCL", 
        "GOLD", "HADE", "IBST", "ISAT", "JKON", "JSMR", "KARW", "KBLV", "LINK", "META", 
        "NRCA", "PTPP", "SSIA", "SUPR", "TBIG", "TLKM", "TOTL", "TOWR", "WIKA", "WSKT", 
        "IDPR", "MTRA", "OASA", "POWR", "PBSA", "PORT", "TGRA", "TOPS", "MPOW", "GMFI", 
        "PPRE", "WEGE", "MORA", "IPCM", "LCKM", "GHON", "IPCC", "MTPS", "JAST", "KEEN", 
        "PTPW", "TAMA", "RONY", "PTDU", "FIMP", "MTEL", "SMKM", "ARKO", "KRYA", "PGEO", 
        "BDKR", "INET", "BREN", "KOKA", "ASLI", "DATA", "HGII", "CDIA", "MANG", "KETR"],
};

// ----------------------------------------------------
// HELPER FUNCTIONS (RUMUS & LOGIKA)
// ----------------------------------------------------

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function bulatkanHarga(harga) {
    if (harga <= 0) return 0;
    let tick = 1;
    if (harga > 5000) tick = 25;
    else if (harga > 2000) tick = 10;
    else if (harga > 500) tick = 5;
    else if (harga > 200) tick = 2;
    return Math.ceil(harga / tick) * tick;
}

function calculatePlan(price, high, low, yearHigh, yearLow) {
    price = price || 0; high = high || 0; low = low || 0;

    // Pivot
    const rawPivot = (price + high + low) / 3;
    const pivot = bulatkanHarga(rawPivot);

    // Support & Resistance
    const s1 = bulatkanHarga((2 * pivot) - high);
    const s2 = bulatkanHarga(pivot - (high - low));
    const s3 = bulatkanHarga(low - (2 * (high - pivot)));

    const tsp1 = bulatkanHarga((2 * pivot) - low);
    const tsp2 = bulatkanHarga(pivot + (high - low));
    const tsp3 = bulatkanHarga(high + (2 * (pivot - low)));

    // Entry & Avg Down Area
    const bestEntry = [s2, s1]; // [Bawah, Atas]
    const avgDown = [s3, s2];   // [Bawah, Atas]

    // Persentase
    let pctDownATH = 0;
    if (yearHigh > 0) pctDownATH = parseFloat((((yearHigh - price) / yearHigh) * 100).toFixed(2));

    let pctUpBottom = 0;
    if (yearLow > 0) pctUpBottom = parseFloat((((price - yearLow) / price) * 100).toFixed(2));

    return { pivot, s1, s2, s3, tsp1, tsp2, tsp3, bestEntry, avgDown, pctDownATH, pctUpBottom };
}

function calculateMA(candles, period) {
    if (!candles || candles.length < period) return 0;
    
    // Ambil N candle TERAKHIR (Data terbaru)
    // Yahoo data urut dari Lama -> Baru, jadi kita ambil buntutnya (slice negative)
    const sliced = candles.slice(-period); 
    
    const sum = sliced.reduce((acc, curr) => acc + (curr.close || 0), 0);
    return parseFloat((sum / period).toFixed(0)); // Return angka bulat
}

// Fungsi Analisis Candle (Screener Logic)
function analyzeCandles(history) {
    let result = {
        // Status Flags
        is_big_money: false,
        big_money_count: 0,
        is_small_accum: false,
        is_scalping: false, // <--- Logic Baru (High Volatility)

        // Data Penting buat Sorting/Ranking di DB
        last_price: 0,
        prev_price: 0,
        change_pct: 0.0,       // Buat sort Top Gainers
        total_value_today: 0,  // Buat sort Liquidity (Ranking)
        avg_value_transaction: 0 
    };
    
    // Validasi data (Min 12 candle)
    if (!history || history.length < 12) return result;

    const lastCandle = history[history.length - 1];
    const prevCandle = history[history.length - 2];
    
    // Set Data Dasar
    result.last_price = lastCandle.close;
    result.prev_price = prevCandle.close;
    result.change_pct = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;
    result.total_value_today = lastCandle.close * lastCandle.volume;

    // 0. LOGIC AVG VALUE (11 Hari)
    const last11 = history.slice(-11);
    const totalValue11 = last11.reduce((acc, c) => acc + (c.close * (c.volume || 0)), 0);
    result.avg_value_transaction = Math.floor(totalValue11 / last11.length);

    // ============================================================
    // 1. LOGIC BIG ACCUMULATION (Scanner 10 Hari)
    // ============================================================
    // ... (KODE LOGIC BIG ACCUM YANG SUDAH KITA BUAT SEBELUMNYA - COPAS AJA) ...
    // Pastikan variabel result.is_big_money dan result.big_money_count terisi di sini

    let validBigMoneyCount = 0;
    let validSmallMoneyCount = 0; // Tambahan buat ngitung berapa kali small accum terjadi
    let stlBmTerakhir = null;
    let stlSmTerakhir = null;

    // "Satpam" di awal: Boleh ngecek Big / Small nggak?
    const canCheckBig = lastCandle.close > 50;
    const canCheckSmall = lastCandle.close > 55;
    const MIN_TRANSACTION_SMALL = 300000000; // 300 Juta
    const MIN_TRANSACTION_BIG = 700000000; // 700 Juta
    const isTodayGreen = lastCandle.close > prevCandle.close;
    const isTodayFlatHigh = (lastCandle.close === prevCandle.close) && (lastCandle.close === lastCandle.high);
    const isTodayBullish = isTodayGreen || isTodayFlatHigh;

    if (lastCandle.close > 50) {
        const isTodayVolSpikeBig = lastCandle.volume > 0 && lastCandle.volume > (prevCandle.volume * 1);
        if (isTodayBullish && isTodayVolSpikeBig && result.total_value_today > MIN_TRANSACTION_BIG) {
            result.is_big_money = true;
        }
    }

    // B. Cek Status Small Accumulation Hari Ini
    if (lastCandle.close > 55) {
        const isTodayVolSpikeSmall = lastCandle.volume > (prevCandle.volume * 1.5);
        const isTodayPriceRange = result.change_pct > 2 && result.change_pct < 5;
        if (isTodayPriceRange && isTodayVolSpikeSmall && result.total_value_today >= MIN_TRANSACTION_SMALL) {
            result.is_small_accum = true;
        }
    }

    // Kalau minimal masuk salah satu syarat harga, baru kita jalankan loop 10 hari
    if (canCheckBig || canCheckSmall) {
        for (let i = history.length - 10; i < history.length; i++) {
            const curr = history[i];     
            const prev = history[i - 1]; 
            if (!prev) continue;
            
            // --- DATA UMUM CANDLE HARI ITU ---
            const isGreen = curr.close > prev.close;
            const isFlatHigh = (curr.close === prev.close) && (curr.close === curr.high);
            const isBullish = isGreen || isFlatHigh;
            
            // Hitung change_pct & transaksi KHUSUS untuk candle hari (i) ini
            const currChangePct = ((curr.close - prev.close) / prev.close) * 100;
            const currTotalValue = curr.close * (curr.volume || 0);

            // ----------------------------------------------------
            // 1. CEK BIG ACCUMULATION (Syarat Harga > 50)
            // ----------------------------------------------------
            if (canCheckBig) {
                const isVolSpikeBig = curr.volume > 0 && curr.volume > (prev.volume * 1);

                if (isBullish && isVolSpikeBig && currTotalValue > MIN_TRANSACTION_BIG) {
                    const stl = calculateSTL(curr.low);
                    stlBmTerakhir = stl;
                    let isStillValid = true;
                    
                    for (let j = i + 1; j < history.length; j++) {
                        if (history[j].close < stl) {
                            isStillValid = false;
                            break; 
                        }
                    }
                    if (isStillValid) validBigMoneyCount++;
                }
            }

            // ----------------------------------------------------
            // 2. CEK SMALL ACCUMULATION (Syarat Harga > 55)
            // ----------------------------------------------------
            if (canCheckSmall) {
                const isVolSpikeSmall = curr.volume > (prev.volume * 1.5);
                const isPriceRangeMasuk = currChangePct > 2 && currChangePct < 5;
                
                // Cek syarat Small Accum di candle hari (i) ini
                if (isPriceRangeMasuk && isVolSpikeSmall && currTotalValue >= MIN_TRANSACTION_SMALL) {
                    const stl = calculateSTL(curr.low); // Hitung STL di sini aja biar hemat
                    let isStillValid = true;
                    
                    // Cek hari-hari setelahnya, apakah harganya jebol ke bawah STL?
                    for (let j = i + 1; j < history.length; j++) {
                        if (history[j].close < stl) {
                            isStillValid = false;
                            break; 
                        }
                    }

                    // Kalau sampai hari ini harga masih bertahan di atas STL, baru dihitung valid
                    if (isStillValid) validSmallMoneyCount++;
                }
            }
        }

        // ============================================================
        // HASIL AKHIR SETELAH LOOPING SELESAI
        // ============================================================
        
        // Eksekusi Result Big Money
        if (validBigMoneyCount >= 2) {
            result.is_big_money = true;
            result.big_money_count = validBigMoneyCount;
        }

        // Eksekusi Result Small Money (misal kita anggap valid kalau minimal 1 atau 2 kali terjadi)
        if (validSmallMoneyCount > 0) { 
            result.is_small_accum = true;
            result.small_money_count = validSmallMoneyCount
            // opsional: result.small_money_count = validSmallMoneyCount; kalau mau disimpen ke DB
        }
    }

    // ============================================================
    // 2. LOGIC SMALL ACCUMULATION
    // ============================================================
    // const MIN_TRANSACTION_SMALL = 100000000; // 100 Juta
    // if (result.total_value_today >= MIN_TRANSACTION_SMALL && lastCandle.close > 55) {
    //     const isPriceRangeMasuk = result.change_pct > 2 && result.change_pct < 5;
    //     const isVolNaik = lastCandle.volume > (prevCandle.volume * 1.5);
    //     if (isPriceRangeMasuk && isVolNaik) {
    //         result.is_small_accum = true;
    //         if (validBigMoneyCount >= 2) {
    //             result.is_big_money = true;
    //             result.big_money_count = validBigMoneyCount;
    //         }
    //     }
    // }

    // ============================================================
    // 3. LOGIC SCALPING / DAY TRADE (NEW) 🔥
    // ============================================================
    // Syarat:
    // a. Harga > 50
    // b. Naik > 10%
    // c. Vol Hari Ini > Vol Kemarin
    // d. Value Transaksi > 700 Juta
    
    const MIN_TRANSACTION_SCALP = 700000000; // 700 Juta

    const condPrice = lastCandle.close > 50;
    const condGain = result.change_pct > 10;
    
    const condVol = lastCandle.volume > prevCandle.volume;
    const condValue = result.total_value_today > MIN_TRANSACTION_SCALP;    

    if (condPrice && condGain && condVol && condValue) {        
        result.is_scalping = true;
    }

    return result;
}
function analyzeCandlesIntraday(history) {
    let result = {
        // Status Flags
        is_big_money: false,
        big_money_count: 0,
        is_small_accum: false,

        // Data Penting buat Sorting/Ranking di DB
        last_price: 0,
        prev_price: 0,
        change_pct: 0.0,       // Buat sort Top Gainers
        total_value_today: 0,  // Buat sort Liquidity (Ranking)
        avg_value_transaction: 0 
    };

    // Validasi data (Min 12 candle)    
    if (!history || history.length < 12) return result;

    const lastCandle = history[history.length - 1];
    const prevCandle = history[history.length - 2];
    
    // Set Data Dasar
    result.last_price = lastCandle.close;
    result.prev_price = prevCandle.close;
    result.change_pct = ((lastCandle.close - prevCandle.close) / prevCandle.close) * 100;
    result.total_value_today = lastCandle.close * lastCandle.volume;

    // 0. LOGIC AVG VALUE (11 Hari)
    const last11 = history.slice(-11);
    const totalValue11 = last11.reduce((acc, c) => acc + (c.close * (c.volume || 0)), 0);
    result.avg_value_transaction = Math.floor(totalValue11 / last11.length);

    // ============================================================
    // 1. LOGIC BIG ACCUMULATION (Scanner 10 Hari)
    // ============================================================
    // ... (KODE LOGIC BIG ACCUM YANG SUDAH KITA BUAT SEBELUMNYA - COPAS AJA) ...
    // Pastikan variabel result.is_big_money dan result.big_money_count terisi di sini

    let validBigMoneyCount = 0;
    let stlBmTerakhir = null;
    for (let i = history.length - 10; i < history.length; i++) {
        const curr = history[i];     
        const prev = history[i - 1]; 
        if (!prev) continue;
        const isGreen = curr.close > prev.close;
        const isFlatHigh = (curr.close === prev.close) && (curr.close === curr.high);
        const isBullish = isGreen || isFlatHigh;
        const isVolSpike = curr.volume > 0 && curr.volume >= (prev.volume * 3);

        if (isBullish && isVolSpike) {
            const stl = calculateSTL(curr.low); 
            stlBmTerakhir = stl;
            let isStillValid = true;
            for (let j = i + 1; j < history.length; j++) {
                if (history[j].close < stl) {
                    isStillValid = false;
                    break; 
                }
            }
            if (isStillValid) validBigMoneyCount++;
        }
    }
    if (validBigMoneyCount >= 2 && stlBmTerakhir !== null && lastCandle.close >= stlBmTerakhir) {      
        result.is_big_money = true;
        result.big_money_count = validBigMoneyCount;
    }

    // ============================================================
    // 2. LOGIC SMALL ACCUMULATION
    // ============================================================
    const MIN_TRANSACTION_SMALL = 100000000; // 100 Juta
    if (result.total_value_today >= MIN_TRANSACTION_SMALL) {
        const isPriceRangeMasuk = result.change_pct >= 2 && result.change_pct <= 5;
        const isVolNaik = lastCandle.volume >= (prevCandle.volume * 1.5);
        if (isPriceRangeMasuk && isVolNaik) {
            result.is_small_accum = true;
        }
    }

    return result;
}

// --- HELPER 1: Fraksi Harga BEI (Tick Size) ---
function getTickSize(price) {
    if (price < 200) return 1;
    if (price >= 200 && price <= 500) return 2;
    if (price > 500 && price <= 2000) return 5;
    if (price > 2000 && price <= 5000) return 10;
    if (price > 5000) return 25;
    return 1;
}

// --- HELPER 2: Pembulatan ke Atas Tick Terdekat ---
function roundUpToTick(price, tickSize) {
    if (tickSize === 0) return Math.floor(price);
    return Math.ceil(price / tickSize) * tickSize;
}

// --- HELPER 3: Rumus STL (Support Toleransi) ---
// Ini konversi 1:1 dari kode Kotlin kamu
function calculateSTL(supportAnalisa) {
    // Safety check
    if (supportAnalisa <= 0) return supportAnalisa;

    let currentPrice = supportAnalisa;

    // KONDISI A: Harga > 2000 (Pakai Rumus Persentase 2.3%)
    if (supportAnalisa > 2000) {
        // Turun 2.3%
        const priceAfterPercentage = supportAnalisa * (1 - 0.023);
        // Cek tick size dari harga baru
        const tickSize = getTickSize(Math.floor(priceAfterPercentage));
        // Bulatkan ke atas (Ceiling)
        return roundUpToTick(priceAfterPercentage, tickSize);
    }

    // KONDISI B: Harga <= 2000 (Pakai Simulasi Turun Papan)
    let papanCount = 0;
    if (supportAnalisa <= 500) {
        papanCount = 2; // Turun 2 tick
    } else if (supportAnalisa > 500 && supportAnalisa <= 2000) {
        papanCount = 5; // Turun 5 tick
    }

    // Simulasi Loop (PENTING!)
    // Kita pakai loop karena tick size bisa berubah di tengah jalan.
    // Misal: Harga 505 (Tick 5) -> Turun jadi 500.
    // Dari 500, Tick berubah jadi 2 -> Turun jadi 498.
    for (let i = 0; i < papanCount; i++) {
        // Ambil tick size saat ini sebelum dikurang
        const tick = getTickSize(currentPrice);
        currentPrice -= tick;
    }

    return currentPrice;
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

app.post('/api/auth/login-LAMA', async (req, res) => {
    const { token } = req.body; // Token ID dari Android

    if (!token) {
        return res.status(400).json({ status: "error", message: "Token wajib ada!" });
    }

    try {
        // 1. VERIFIKASI TOKEN KE GOOGLE (Cek Asli/Palsu)
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Ambil data user dari token
        const { uid, email, name, picture } = decodedToken;

        console.log(`👤 User Login: ${email}`);

        // 2. SIMPAN / UPDATE KE MONGODB (Upsert)
        // Kalau user baru -> Buat baru
        // Kalau user lama -> Update last_login, nama, foto (siapa tau ganti)
        const user = await UserModel.findOneAndUpdate(
            { email: email }, // Cari berdasarkan email
            {
                $set: {
                    firebase_uid: uid,
                    display_name: name || "User Tanpa Nama",
                    photo_url: picture || "",
                    last_login: new Date()
                },
                $setOnInsert: {
                    // Field ini cuma di-set pas PERTAMA KALI buat (Register)
                    joined_at: new Date(),
                    is_premium: false,
                    has_claimed_promo: false 
                }
            },
            { new: true, upsert: true } // Return data terbaru & Create if not exists
        );

        // ---------------------------------------------------------
        // 🎁 TEMPAT LOGIC REVENUECAT PROMO (NANTI KITA ISI DISINI)
        // ---------------------------------------------------------
        // if (!user.has_claimed_promo) { ... }

        // 3. KIRIM BALIKAN KE ANDROID
        res.json({
            status: "success",
            message: "User berhasil disimpan/diupdate",
            data: user
        });

    } catch (error) {
        console.error("❌ Auth Error:", error.message);
        res.status(401).json({ 
            status: "error", 
            message: "Token tidak valid atau kadaluarsa" 
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { token } = req.body; 

    if (!token) {
        return res.status(400).json({ status: "error", message: "Token wajib ada!" });
    }

    try {
        // 1. VERIFIKASI TOKEN KE GOOGLE
        const decodedToken = await admin.auth().verifyIdToken(token);
        const { uid, email, name, picture } = decodedToken;

        console.log(`👤 User Login: ${email}`);

        // ============================================================
        // 🔥 2. CEK STATUS TERBARU KE REVENUECAT (SYNC) 🔥
        // ============================================================
        let isPremiumNow = false; // Default Free

        try {
            // Tembak API RevenueCat pakai User ID (UID)
            const rcResponse = await axios.get(
                `https://api.revenuecat.com/v1/subscribers/${uid}`,
                {
                    headers: { 
                        'Authorization': `Bearer ${process.env.RC_SECRET_KEY}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Cek apakah ada Entitlement 'pro_access' (sesuaikan nama di Dashboard RC kamu)
            const entitlements = rcResponse.data.subscriber.entitlements;
            
            // Kalau ada di list 'active', berarti true
            if (entitlements.active && entitlements.active['pro_access']) {
                isPremiumNow = true;
                console.log("✅ Status RevenueCat: PREMIUM AKTIF");
            } else {
                console.log("⚠️ Status RevenueCat: FREE / EXPIRED");
            }

        } catch (rcError) {
            // Kalau error 404 (User belum ada di RC), anggap aja Free
            console.log("⚠️ User belum terdaftar di RevenueCat (New User)");
        }

        // ============================================================
        // 3. SIMPAN / UPDATE KE MONGODB (Dengan Status Terbaru)
        // ============================================================
        const user = await UserModel.findOneAndUpdate(
            { email: email }, 
            {
                $set: {
                    firebase_uid: uid,
                    display_name: name || "User Tanpa Nama",
                    photo_url: picture || "",
                    last_login: new Date(),
                    
                    // 🔥 UPDATE STATUS PREMIUM DARI HASIL CEK TADI 🔥
                    is_premium: isPremiumNow 
                },
                $setOnInsert: {
                    joined_at: new Date(),
                    // is_premium: false, <-- HAPUS INI, karena sudah di-set di atas ($set)
                    has_claimed_promo: false 
                }
            },
            { new: true, upsert: true } 
        );

        // 4. KIRIM BALIKAN KE ANDROID
        console.log(user);
        
        res.json({
            status: "success",
            message: "Login & Sync Berhasil",
            data: user // Android bakal dapet status is_premium yang real-time
        });

    } catch (error) {
        console.error("❌ Auth Error:", error.message);
        res.status(401).json({ 
            status: "error", 
            message: "Token tidak valid atau kadaluarsa" 
        });
    }
});

// Node.js Route
app.get('/api/auth/me', optionalAuth, async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id);
        res.json({
            status: "success",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                is_premium: user.is_premium // 🔥 INI YANG KITA CARI
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Error" });
    }
});

app.post('/api/account/delete', async (req, res) => {
    // 1. Tangkap email/uid dari Body JSON
    const { email, uid } = req.body;

    if (!email || !uid) {
        return res.status(400).json({ error: "Email dan UID wajib diisi!" });
    }

    try {
        // 2. Hapus data di MongoDB
        await UserModel.findOneAndDelete({ email: email });

        // 3. (Opsional) Hapus Auth di Firebase
        // await admin.auth().deleteUser(uid);

        res.json({ message: "Akun berhasil dihapus permanen." });
    } catch (error) {
        res.status(500).json({ error: "Gagal menghapus akun" });
    }
});

app.post('/api/user/update-premium', optionalAuth, async (req, res) => {
    try {
        const { is_premium } = req.body; // Terima status true/false dari Android

        // Update DB MongoDB
        await UserModel.findByIdAndUpdate(req.user.id, { 
            is_premium: is_premium 
        });

        console.log(`✅ User ${req.user.email} updated premium status to: ${is_premium}`);

        res.json({ 
            status: "success", 
            message: "Status premium berhasil diupdate di Database" 
        });

    } catch (error) {
        console.error("Gagal update premium:", error);
        res.status(500).json({ error: "Server Error" });
    }
});

app.get('/api/historyLAMA', async (req, res) => {
    const ticker = req.query.ticker;
    if (!ticker) return res.status(400).json({ error: "Ticker required" });

    try {
        const symbol = ticker.toUpperCase() + ".JK";
        
        // Ambil data 6 bulan terakhir (180 hari)
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 180); 

        // Pakai .chart (bukan historical)
        const result = await yahooFinance.chart(symbol, {
            period1: pastDate,
            interval: '1d' 
        });

        const candles = result.quotes || [];
        const formattedData = candles.map(item => ({
            time: item.date.toISOString().split('T')[0], // YYYY-MM-DD
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        res.json({
            symbol: ticker,
            candles: formattedData
        });

    } catch (error) {
        console.error("Error History:", error.message);
        // Balikin array kosong kalau gagal biar App gak crash
        res.json({ symbol: ticker, candles: [] });
    }
});

app.get('/api/history', async (req, res) => {
    const ticker = req.query.ticker;
    if (!ticker) return res.status(400).json({ error: "Ticker required" });

    try {
        const symbol = ticker.toUpperCase() + ".JK";

        // 1. HITUNG TANGGAL
        const period2 = Math.floor(Date.now() / 1000); 
        const period1 = period2 - (180 * 24 * 60 * 60); 

        // 2. URL ENDPOINT JSON (V8)
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=1d&events=history&includeAdjustedClose=true`;
        console.log("Fetching URL:", url);

        // 3. REQUEST FETCH
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            }
        });

        if (!response.ok) {
            throw new Error(`Yahoo menolak: ${response.status} ${response.statusText}`);
        }

        // 4. PARSING JSON (Bukan CSV)
        const jsonData = await response.json(); // 🔥 Pakai .json() bukan .data

        // Validasi struktur data Yahoo
        const result = jsonData.chart.result?.[0];
        if (!result) throw new Error("Struktur JSON Yahoo tidak sesuai / Kosong");

        const timestamps = result.timestamp;
        const indicators = result.indicators.quote[0]; // Data harga ada disini

        const formattedData = [];

        // 5. MAPPING DATA ARRAY
        // Karena datanya terpisah array timestamp sendiri, open sendiri, close sendiri
        if (timestamps && indicators) {
            timestamps.forEach((time, i) => {
                // Yahoo kadang ngasih nilai null di tengah array kalau libur
                if (indicators.open[i] === null) return; 

                formattedData.push({
                    // Convert Unix Timestamp ke YYYY-MM-DD
                    time: new Date(time * 1000).toISOString().split('T')[0],
                    open: indicators.open[i],
                    high: indicators.high[i],
                    low: indicators.low[i],
                    close: indicators.close[i]
                });
            });
        }

        // 6. KIRIM HASIL
        res.json({
            symbol: ticker,
            candles: formattedData
        });

    } catch (error) {
        console.error(`❌ History Error (${ticker}):`, error.message);
        res.json({ symbol: ticker, candles: [] });
    }
});

// ----------------------------------------------------
// ENDPOINT 1: USER (SUPER CEPAT - BACA DB)
// ----------------------------------------------------
app.get('/api/analyze-LAMA', optionalAuth, async (req, res) => {
    const ticker = req.query.ticker;
    if (!ticker) return res.status(400).json({ error: "Butuh ticker!" });

    const symbol = ticker.toUpperCase() + ".JK";

    try {
        // CUMA BACA DB, GAK PAKE REQ YAHOO SAMA SEKALI
        const isPremium = req.user ? req.user.is_premium : false;

        const stock = await StockModel.findOne({ symbol: symbol });
        if (!stock) {
            return res.status(404).json({ error: "Data belum ada. Silakan request update admin." });
        }

        // Format Response sesuai Android
        res.json({
            meta: { symbol: ticker.toUpperCase(), company: stock.company, source: "DATABASE" },
            data_mentah: {
                open: stock.open,
                high: stock.high,
                low: stock.low,
                close: stock.close,
                change: stock.change,
                changePct: stock.changePct,
                volume: stock.volume/100,
                market_cap: stock.market_cap,
                pe_ratio: stock.pe_ratio,
                eps: stock.eps,
                percentageDownATH: stock.percentageDownATH,
                percentageUpFromBottom: stock.percentageUpFromBottom
            },
            trading_plan: stock.trading_plan,
            movingAverages: stock.movingAverages,
            fundamentals: stock.fundamentals,
            ownership: stock.ownership
        });

    } catch (error) {
        res.status(500).json({ error: "DB Error" });
    }

    // try {
    //     const isPremium = req.user ? req.user.is_premium : false;
        
    //     // Debugging: Pastikan statusnya kebaca
    //     console.log(`🛡️ Serving ${ticker} for ${req.user ? req.user.email : 'Guest'} (Premium: ${isPremium})`);

    //     const stock = await StockModel.findOne({ symbol: symbol });
    //     if (!stock) {
    //         return res.status(404).json({ error: "Data belum ada. Silakan request update admin." });
    //     }

    //     // 1. SIAPKAN DATA FULL DULU (Belum Disensor)
    //     const fullResponse = {
    //         meta: { symbol: ticker.toUpperCase(), company: stock.company, source: "DATABASE" },
    //         data_mentah: {
    //             open: stock.open,
    //             high: stock.high,
    //             low: stock.low,
    //             close: stock.close,
    //             change: stock.change,
    //             changePct: stock.changePct,
    //             volume: stock.volume/100,
    //             market_cap: stock.market_cap,
    //             pe_ratio: stock.pe_ratio,
    //             eps: stock.eps,
    //             percentageDownATH: stock.percentageDownATH,
    //             percentageUpFromBottom: stock.percentageUpFromBottom
    //         },
    //         trading_plan: stock.trading_plan,
    //         movingAverages: stock.movingAverages,
    //         fundamentals: stock.fundamentals,
    //         ownership: stock.ownership
    //     };

    //     // 🔥 2. JALANKAN SENSOR DI SINI! 🔥
    //     // Kalau isPremium = false, trading_plan & ownership bakal digembok
    //     const finalResponse = maskData(fullResponse, 'analyze', isPremium);
    //     console.log(finalResponse);
        

    //     // 3. KIRIM HASIL SENSOR
    //     res.json(finalResponse);

    // } catch (error) {
    //     console.error("Analyze Error:", error); // Log error biar tau kalo ada apa2
    //     res.status(500).json({ error: "DB Error" });
    // }
});

app.get('/api/analyze', optionalAuth, async (req, res) => {
    const ticker = req.query.ticker;
    if (!ticker) return res.status(400).json({ error: "Butuh ticker!" });

    const symbol = ticker.toUpperCase() + ".JK";

    try {
        // 1. Cek Status Premium User
        // const isPremium = req.user ? req.user.is_premium : false;
        // console.log(`🔍 Request ${ticker} by ${req.user?.email || 'Guest'} (Premium: ${isPremium})`);

        // 2. Ambil Data dari DB
        const stockRaw = await StockModel.findOne({ symbol: symbol });
        if (!stockRaw) {
            return res.status(404).json({ error: "Data belum ada. Silakan request update admin." });
        }

        // 🔥 PENTING: Convert ke Plain Object biar bisa dimodifikasi
        let stock = stockRaw.toObject();

        // 3. LOGIC SENSOR (-1 Strategy) 🔒 KITA HIDE DULU
        // if (!isPremium) {
        //     // Kita timpa object trading_plan dengan nilai -1
        //     stock.trading_plan = {
        //         status: "PREMIUM ONLY", 
        //         action: "LOCKED",
                
        //         // --- TIDAK RAWAN ---
        //         pivot: -1,
        //         tsp1: -1,
        //         tsp2: -1,
        //         tsp3: -1,
                
        //         // --- 🔥 BAGIAN KRUSIAL (JANGAN SALAH KETIK) 🔥 ---
                
        //         // 1. Android minta @SerializedName("support_pertahanan")
        //         support_pertahanan: -1,  // ✅ JANGAN supportPertahanan

        //         // 2. Android minta @SerializedName("support_kuat")
        //         support_kuat: -1,        // ✅ JANGAN supportKuat
                
        //         // 3. Android minta @SerializedName("support_awal")
        //         support_awal: -1,        // ✅ JANGAN supportAwal

        //         // 4. Android minta @SerializedName("best_entry")
        //         best_entry: [-1, -1],    // ✅ JANGAN bestEntry (Ini biang kerok crashnya!)

        //         // 5. Android minta @SerializedName("avg_down")
        //         avg_down: [-1]           // ✅ JANGAN avgDown
        //     };
            
        //     // Opsional: Kalau ownership mau disensor juga
        //     // stock.ownership = []; 
        // }

        // 4. Kirim Response (Struktur JSON Tetap Sama)
        res.json({
            meta: { symbol: ticker.toUpperCase(), company: stock.company, source: "DATABASE" },
            data_mentah: {
                open: stock.open,
                high: stock.high,
                low: stock.low,
                close: stock.close,
                change: stock.change,
                changePct: stock.changePct,
                volume: Math.floor(stock.volume/100),
                market_cap: stock.market_cap,
                pe_ratio: stock.pe_ratio,
                eps: stock.eps,
                fiftyTwoWeekLow: stock.fiftyTwoWeekLow,
                fiftyTwoWeekHigh: stock.fiftyTwoWeekHigh,
                percentageDownATH: stock.percentageDownATH,
                last_updated: stock.last_updated,
                percentageUpFromBottom: stock.percentageUpFromBottom,
                avgVol10day: Math.floor(stock.avgVol10day / 100),
                avgVol3M: Math.floor(stock.avgVol3M / 100),
            },
            trading_plan: stock.trading_plan, // 👈 Ini yang sudah dimanipulasi di atas
            movingAverages: stock.movingAverages,
            fundamentals: stock.fundamentals,
            ownership: stock.ownership,
            
            // Flag tambahan buat Android tau user ini statusnya apa (opsional tapi berguna)
            // is_locked: !isPremium 
            is_locked: false 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "DB Error" });
    }
});

// ----------------------------------------------------
// ENDPOINT 2: ADMIN / CRON (UPDATE BERAT - TULIS DB)
// ----------------------------------------------------
app.get('/api/update-sector', async (req, res) => {
    // const sectorName = req.query.name;

    // if (!sectorName || !SECTOR_MAP[sectorName.toUpperCase()]) {
    //     return res.status(400).json({ error: "Sektor tidak ditemukan." });
    // }

    // res.json({ message: `Update sektor ${sectorName} dimulai (Mode: MA20 + 1 Year Return)...` });

    // const stockList = SECTOR_MAP[sectorName.toUpperCase()];
    // const today = new Date();
    
    // // 🔥 PERUBAHAN 1: Mundurin Tanggal 1 Tahun (365 hari)
    // // Biar bisa hitung kinerja 1 tahun terakhir
    // const startDate = new Date();
    // startDate.setDate(today.getDate() - 365); 

    // (async () => {
    //     for (const ticker of stockList) {
    //         const symbol = ticker + ".JK";
    //         try {
    //             // --- STEP 1: TARIK DATA ---
    //             const [quoteResult, historyResult] = await Promise.all([
    //                 yahooFinance.quoteSummary(symbol, {
    //                     modules: ["price", "summaryDetail", "defaultKeyStatistics"]
    //                 }).catch(e => null),
                    
    //                 // Tarik history 1 tahun ke belakang
    //                 yahooFinance.historical(symbol, { 
    //                     period1: startDate, 
    //                     period2: new Date(),
    //                     interval: '1d' 
    //                 }).catch(e => [])
    //             ]);                

    //             if (!quoteResult || !quoteResult.price || !quoteResult.price.regularMarketPrice) {
    //                 console.log(`⚠️ Skip ${ticker}: Data corrupt.`);
    //                 continue;
    //             }

    //             const priceData = quoteResult.price;
    //             const summary = quoteResult.summaryDetail || {};
    //             const stats = quoteResult.defaultKeyStatistics || {};
    //             const currentPrice = priceData.regularMarketPrice;

    //             // --- STEP 2: HITUNG TRADING PLAN (Function kamu yg lama) ---
    //             const plan = calculatePlan(
    //                 currentPrice,
    //                 priceData.regularMarketDayHigh,
    //                 priceData.regularMarketDayLow,
    //                 summary.fiftyTwoWeekHigh,
    //                 summary.fiftyTwoWeekLow
    //             );

    //             const screenerStats = analyzeCandles(historyResult);
    //             const toPercent = (val) => val ? (val * 100).toFixed(2) + "%" : "-";
    //             const toX = (val) => val ? val.toFixed(2) + "x" : "-";
    //             const toDec = (val) => val ? val.toFixed(2) : "-";
    //             // --- STEP 3: LOGIC SCREENER BARU (MA20 & 1 Year) 🔥 --- 
                
    //             // A. Hitung MA 20
    //             // 1. Hitung MA 20 & 1 Year Return (Logic Sebelumnya)
    //             const ma20Value = calculateMA(historyResult, 20);
                
    //             let oneYearReturnPct = 0;
    //             if (historyResult.length > 0) {
    //                 const price1YearAgo = historyResult[0].close;
    //                 if (price1YearAgo > 0) {
    //                     oneYearReturnPct = ((currentPrice - price1YearAgo) / price1YearAgo) * 100;
    //                 }
    //             }
    //             oneYearReturnPct = parseFloat(oneYearReturnPct.toFixed(2));

    //             // --- LOGIC BARU SESUAI REQUEST ---
                
    //             // A. Data Pendukung
    //             const currentVol = summary.volume || 0;
    //             const prevClosePrice = priceData.regularMarketPreviousClose;
                
    //             // Ambil Volume Kemarin (H-1) dari history
    //             // Kita ambil index ke-2 dari belakang untuk aman (jaga-jaga kalau index terakhir itu data hari ini yang belum close)
    //             const prevCandle = historyResult.length >= 2 ? historyResult[historyResult.length - 2] : null;
    //             const prevVol = prevCandle ? prevCandle.volume : currentVol; // Fallback kalau data kurang

    //             // B. Pengecekan Syarat (Satu per satu)
                
    //             // Syarat 1: Vol > 1.5x Volume Sebelumnya
    //             const condVolSpike = currentVol > (1.5 * prevVol);
                
    //             // Syarat 2: Price > 55
    //             const condPrice55 = currentPrice > 55;
                
    //             // Syarat 3: Price > Price Sebelumnya (Lagi Ijo)
    //             const condGreen = currentPrice > prevClosePrice;
                
    //             // Syarat 4: Transaksi > 100 Juta
    //             const transactionValue = currentPrice * currentVol;
    //             const condLiquid = transactionValue > 100000000;
                
    //             // Syarat 5: 1 Year Return < 1 (Sleeping Giant)
    //             const condSleeping = oneYearReturnPct < 1;
                
    //             // Syarat 6: Price > MA 20
    //             const condAboveMA20 = ma20Value > 0 && currentPrice > ma20Value;

    //             // --- KESIMPULAN AKHIR ---
    //             // Semua syarat harus TRUE
    //             const isMatchScreener = condVolSpike && condPrice55 && condGreen && condLiquid && condSleeping && condAboveMA20;

    //             // --- STEP 4: SIMPAN KE DB ---
    //             await StockModel.findOneAndUpdate(
    //                 { symbol: symbol },
    //                 {
    //                     symbol: symbol,
    //                     company: priceData.longName,
    //                     sector: sectorName.toUpperCase(),
                        
    //                     // ... (Field Harga Sama Kayak Dulu) ...
    //                     open: priceData.regularMarketOpen,
    //                     high: priceData.regularMarketDayHigh,
    //                     low: priceData.regularMarketDayLow,
    //                     close: priceData.regularMarketPrice,
    //                     change: priceData.regularMarketChange,
    //                     changePct: priceData.regularMarketChangePercent 
    //                         ? parseFloat((priceData.regularMarketChangePercent * 100).toFixed(2)) 
    //                         : 0,
    //                     volume: summary.volume,
    //                     avgVol10day: priceData.averageDailyVolume10Day,
    //                     avgVol3M: priceData.averageDailyVolume3Month,
    //                     previousClose: priceData.regularMarketPreviousClose,

    //                     percentageDownATH: plan.pctDownATH,
    //                     percentageUpFromBottom: plan.pctUpBottom,
    //                     fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh,
    //                     fiftyTwoWeekLow: summary.fiftyTwoWeekLow,

    //                     fundamentals: {
    //                         marketCap: summary.marketCap,
    //                         bookValue: stats.bookValue,
    //                         pe_ratio: toX(summary.trailingPE),
    //                         eps: toDec(stats.trailingEps),
    //                         priceToBook: toX(stats.priceToBook),
    //                         dividendYield: toPercent(summary.dividendYield),
    //                         profitMargins: toPercent(stats.profitMargins),
    //                         incomeQoQ: toPercent(stats.earningsQuarterlyGrowth), // "10.5%"
    //                         lastDividendValue: stats.lastDividendValue,
    //                         enterpriseValue: stats.enterpriseValue,
    //                         enterpriseToEBITDA: toX(stats.enterpriseToEbitda),
    //                         enterpriseToRevenue: toX(stats.enterpriseToRevenue),
    //                         netIncomeToCommon: stats.netIncomeToCommon
    //                     },

    //                     ownership: {
    //                         insiders: toPercent(stats.heldPercentInsiders),
    //                         institutions: toPercent(stats.heldPercentInstitutions)
    //                     },

    //                     // Screener Field 🔥
    //                     screener: {
    //                         is_big_money: screenerStats.is_big_money,
    //                         big_money_count: screenerStats.big_money_count,
    //                         is_small_accum: screenerStats.is_small_accum,
    //                         is_scalping: screenerStats.is_scalping, // <--- JANGAN LUPA INI!

    //                         // 2. Data Ranking (PENTING BUAT SORTING API)
    //                         total_value_today: screenerStats.total_value_today, // Buat ranking Likuiditas
    //                         change_pct: screenerStats.change_pct,               // Buat ranking Top Gainers
    //                         avg_value_transaction: screenerStats.avg_value_transaction, // Buat filter Big Cap

    //                         // Technical Indicators
    //                         one_years_up: isMatchScreener, 

    //                         // Detail Indikator (Disimpan biar bisa didebug/ditampilkan)
    //                         ma20: ma20Value,
    //                         one_year_return: oneYearReturnPct,
    //                         tx_value: transactionValue,
    //                         vol_spike_ratio: prevVol > 0 ? (currentVol / prevVol).toFixed(2) : "0", // Misal: "1.8x"

    //                         last_updated: new Date()
    //                     },

    //                     trading_plan: {
    //                         pivot: plan.pivot,
    //                         support_pertahanan: plan.s1,
    //                         support_kuat: plan.s2,
    //                         support_awal: plan.s3,
    //                         best_entry: plan.bestEntry,
    //                         avg_down: plan.avgDown,
    //                         tsp1: plan.tsp1,
    //                         tsp2: plan.tsp2,
    //                         tsp3: plan.tsp3,
    //                         rekomendasi: priceData.regularMarketPrice < plan.s3 ? "WAIT" : "BUY"
    //                     },
                        
    //                     // Percentage Number (Tanpa %)
    //                     percentageDownATH: plan.pctDownATH,
    //                     percentageUpFromBottom: plan.pctUpBottom
    //                 },
    //                 { upsert: true, new: true }
    //             );

    //             console.log(`✅ ${ticker} | Price: ${currentPrice} | MA20: ${ma20Value} | 1Y: ${oneYearReturnPct}%`);

    //         } catch (err) {
    //             console.error(`❌ Fail: ${ticker}`, err.message);
    //         }
            
    //         await sleep(1800); // Jangan terlalu ngebut, nanti Yahoo nge-block
    //     }
    //     console.log(`🏁 Update Selesai: ${sectorName}`);
    // })();
    const sectorName = req.query.name;

    if (!sectorName || !SECTOR_MAP[sectorName.toUpperCase()]) {
        return res.status(400).json({ error: "Sektor tidak ditemukan." });
    }

    // Kasih response duluan biar browser gak loading terus
    res.json({ message: `Update sektor ${sectorName} sedang berjalan di background...` });

    // Jalankan fungsinya di background
    processSectorUpdate(sectorName);
});

app.get('/api/update-sector-lama', async (req, res) => {
    const sectorName = req.query.name;

    if (!sectorName || !SECTOR_MAP[sectorName.toUpperCase()]) {
        return res.status(400).json({ error: "Sektor tidak ditemukan." });
    }

    res.json({ message: `Update sektor ${sectorName} dimulai di background...` });

    const stockList = SECTOR_MAP[sectorName.toUpperCase()];
    console.log(`🚀 Mulai Update Sektor: ${sectorName}`);
    const today = new Date();
    const startDate = new Date();
    startDate.setFullYear(today.getFullYear() - 1); // Mundur 1 Tahun

    (async () => {
        for (const ticker of stockList) {
            const symbol = ticker + ".JK";
            try {
                // --- STEP 1: TARIK DATA (PARALEL BIAR CEPAT) ---
                // Kita jalankan quoteSummary & historical bebarengan pake Promise.all
                const [quoteResult, historyResult] = await Promise.all([
                    // Request A: Fundamental & Harga Saat Ini
                    yahooFinance.quoteSummary(symbol, {
                        modules: ["price", "summaryDetail", "defaultKeyStatistics"]
                    }).catch(e => null), // Kalau error return null biar gak crash
                    
                    // Request B: History Candle (35 hari ke belakang)
                    yahooFinance.historical(symbol, { 
                        period1: startDate, 
                        period2: new Date(),
                        interval: '1d' 
                    }).catch(e => [])   // Kalau error return array kosong
                ]);

                // Validasi: Kalau quoteResult null (saham delisted/error), skip
                if (!quoteResult || !quoteResult.price || !quoteResult.price.regularMarketPrice) {
                    console.log(`⚠️ Skip ${ticker}: Data tidak lengkap.`);
                    continue;
                }

                const priceData = quoteResult.price;
                const summary = quoteResult.summaryDetail || {};
                const stats = quoteResult.defaultKeyStatistics || {};

                // --- STEP 2: HITUNG TRADING PLAN (Logic Lama) ---
                const plan = calculatePlan(
                    priceData.regularMarketPrice,
                    priceData.regularMarketDayHigh,
                    priceData.regularMarketDayLow,
                    summary.fiftyTwoWeekHigh,
                    summary.fiftyTwoWeekLow
                );

                // --- STEP 3: HITUNG SCREENER (Logic Baru) --- 

                const screenerStats = analyzeCandles(historyResult);

                // Helper Format
                const toPercent = (val) => val ? (val * 100).toFixed(2) + "%" : "-";
                const toX = (val) => val ? val.toFixed(2) + "x" : "-";
                const toDec = (val) => val ? val.toFixed(2) : "-";

                // --- STEP 4: SIMPAN KE DB ---
                await StockModel.findOneAndUpdate(
                    { symbol: symbol },
                    {
                        symbol: symbol,
                        company: priceData.longName,
                        sector: sectorName.toUpperCase(),
                        
                        // ... (Field Harga Sama Kayak Dulu) ...
                        open: priceData.regularMarketOpen,
                        high: priceData.regularMarketDayHigh,
                        low: priceData.regularMarketDayLow,
                        close: priceData.regularMarketPrice,
                        change: priceData.regularMarketChange,
                        changePct: priceData.regularMarketChangePercent 
                            ? parseFloat((priceData.regularMarketChangePercent * 100).toFixed(2)) 
                            : 0,
                        volume: summary.volume,
                        previousClose: priceData.regularMarketPreviousClose,

                        percentageDownATH: plan.pctDownATH,
                        percentageUpFromBottom: plan.pctUpBottom,
                        fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: summary.fiftyTwoWeekLow,

                        // Field Baru: SCREENER RESULT 🔥
                        screener: {
                            // 1. Status Flags
                            is_big_money: screenerStats.is_big_money,
                            big_money_count: screenerStats.big_money_count,
                            is_small_accum: screenerStats.is_small_accum,
                            is_scalping: screenerStats.is_scalping, // <--- JANGAN LUPA INI!

                            // 2. Data Ranking (PENTING BUAT SORTING API)
                            total_value_today: screenerStats.total_value_today, // Buat ranking Likuiditas
                            change_pct: screenerStats.change_pct,               // Buat ranking Top Gainers
                            avg_value_transaction: screenerStats.avg_value_transaction, // Buat filter Big Cap

                            // 3. Timestamp
                            last_updated: new Date()
                        },

                        fundamentals: {
                            marketCap: summary.marketCap,
                            // ... (Fundamental Sama Kayak Dulu) ...
                            pe_ratio: toX(summary.trailingPE),
                            eps: toDec(stats.trailingEps),
                            priceToBook: toX(stats.priceToBook),
                            dividendYield: toPercent(summary.dividendYield),
                            profitMargins: toPercent(stats.profitMargins)
                        },

                        ownership: {
                            insiders: toPercent(stats.heldPercentInsiders),
                            institutions: toPercent(stats.heldPercentInstitutions)
                        },

                        trading_plan: {
                            pivot: plan.pivot,
                            support_pertahanan: plan.s1,
                            support_kuat: plan.s2,
                            support_awal: plan.s3,
                            best_entry: plan.bestEntry,
                            avg_down: plan.avgDown,
                            tsp1: plan.tsp1,
                            tsp2: plan.tsp2,
                            tsp3: plan.tsp3,
                            rekomendasi: priceData.regularMarketPrice < plan.s3 ? "WAIT" : "BUY"
                        },
                        
                        last_updated: new Date()
                    },
                    { upsert: true, new: true }
                );

                console.log(`${ticker} BA:${screenerStats.is_big_money} SA:${screenerStats.is_small_accum} PS:${screenerStats.is_scalping}`);

            } catch (err) {
                console.error(`❌ Fail: ${ticker}`, err.message);
            }

            // Jeda agak lamaan dikit karena kita nembak 2 request (quote + history)
            await sleep(2000); 
        }
        console.log(`🏁 Selesai Update Sektor: ${sectorName}`);
    })();
});

app.get('/api/update-sector-lama-lama', async (req, res) => {
    const sectorName = req.query.name; // ?name=BANKING

    if (!sectorName || !SECTOR_MAP[sectorName.toUpperCase()]) {
        return res.status(400).json({ error: "Sektor tidak ditemukan di Kamus." });
    }

    // Jangan tunggu selesai (Background Process) biar browser gak timeout
    // Kita kirim respons duluan "Proses Dimulai"
    res.json({ message: `Update sektor ${sectorName} dimulai di background...` });

    const stockList = SECTOR_MAP[sectorName.toUpperCase()];
    console.log(`🚀 Mulai Update Sektor: ${sectorName} (${stockList.length} saham)`);

    // --- PROSES BACKGROUND (LOOPING DENGAN JEDA) ---
    (async () => {
        for (const ticker of stockList) {
            const symbol = ticker + ".JK";
            try {
                // 1. Tarik Yahoo
                const result = await yahooFinance.quoteSummary(symbol, {
                    modules: ["price", "summaryDetail", "defaultKeyStatistics"]
                });

                const priceData = result.price                
                const summary = result.summaryDetail || {};
                console.log(summary.marketCap);
                
                const stats = result.defaultKeyStatistics || {};         

                if (!priceData || !priceData.regularMarketPrice) continue;

                // 2. Hitung Rumus
                const plan = calculatePlan(
                    priceData.regularMarketPrice,
                    priceData.regularMarketDayHigh,
                    priceData.regularMarketDayLow,
                    summary.fiftyTwoWeekHigh,
                    summary.fiftyTwoWeekLow
                );

                const toPercent = (val) => val ? (val * 100).toFixed(2) + "%" : "-";
                const toX = (val) => val ? val.toFixed(2) + "x" : "-";
                const toDec = (val) => val ? val.toFixed(2) : "-";

                // 3. Simpan ke DB
                await StockModel.findOneAndUpdate(
                    { symbol: symbol },
                    {
                        symbol: symbol,
                        company: priceData.longName,
                        sector: sectorName.toUpperCase(),
                        
                        // Harga
                        open: priceData.regularMarketOpen,
                        high: priceData.regularMarketDayHigh,
                        low: priceData.regularMarketDayLow,
                        close: priceData.regularMarketPrice,
                        change: priceData.regularMarketChange,
                        changePct: (priceData.regularMarketChangePercent * 100).toFixed(2),
                        volume: summary.volume,
                        previousClose: priceData.regularMarketPreviousClose,

                        // Statistik Becorp
                        percentageDownATH: plan.pctDownATH,
                        percentageUpFromBottom: plan.pctUpBottom,
                        fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: summary.fiftyTwoWeekLow,

                        // --- KELOMPOK FUNDAMENTALS (BARU) ---
                        fundamentals: {
                            marketCap: summary.marketCap,      // Simpan Raw Number biar bisa diformat Android
                            sharesOutstanding: stats.sharesOutstanding,
                            floatShares: stats.floatShares,
                            
                            pe_ratio: toX(summary.trailingPE),       // "15.2x"
                            eps: toDec(stats.trailingEps),           // "450.20"
                            priceToBook: toX(stats.priceToBook),     // "3.5x"
                            dividendYield: toPercent(summary.dividendYield), // "3.5%"
                            profitMargins: toPercent(stats.profitMargins), // "20.5%"
                            incomeQoQ: toPercent(stats.earningsQuarterlyGrowth), // "10.5%"
                            bookValue: stats.bookValue
                        },
                        // ------------------------------------

                        // Kepemilikan
                        ownership: {
                            insiders: toPercent(stats.heldPercentInsiders),
                            institutions: toPercent(stats.heldPercentInstitutions)
                        },

                        // Moving Averages (Kalau mau disimpan)
                        movingAverages: {
                            ma50: summary.fiftyDayAverage,
                            ma200: summary.twoHundredDayAverage
                        },

                        // Trading Plan (Sama kayak sebelumnya)
                        trading_plan: {
                            pivot: plan.pivot,
                            support_pertahanan: plan.s1,
                            support_kuat: plan.s2,
                            support_awal: plan.s3,
                            best_entry: plan.bestEntry,
                            avg_down: plan.avgDown,
                            tsp1: plan.tsp1,
                            tsp2: plan.tsp2,
                            tsp3: plan.tsp3,
                            rekomendasi: priceData.regularMarketPrice < plan.s3 ? "WAIT" : "BUY"
                        },

                        last_updated: new Date()
                    },
                    { upsert: true, new: true }
                );

                console.log(`✅ Updated: ${ticker}`);

            } catch (err) {
                console.error(`❌ Fail: ${ticker}`, err.message);
            }

            // 4. JEDA 1 DETIK (PENTING!)
            await sleep(2000);
        }
        console.log(`🏁 Selesai Update Sektor: ${sectorName}`);
    })();
});

app.get('/api/sector', async (req, res) => {
    // Ambil parameter ?name=BANKING dari Android
    const sectorName = req.query.name;
    console.log(sectorName);
    

    if (!sectorName) {
        return res.status(400).json({ error: "Parameter 'name' (Nama Sektor) wajib diisi!" });
    }

    try {
        console.log(`📥 Request Sektor: ${sectorName}`);

        // 1. Query ke MongoDB
        // "Cari semua saham yang field 'sector'-nya sama dengan request"
        const stocks = await StockModel.find({ 
            sector: sectorName.toUpperCase() 
        }).sort({ changePct: -1 });

        // 2. Cek apakah ada datanya?
        if (stocks.length === 0) {
            return res.status(404).json({ 
                error: `Data untuk sektor ${sectorName} belum ada di Database.`,
                hint: "Coba jalankan /api/update-sector dulu." 
            });
        }
        const cleanedStocks = stocks.map(stock => ({
            ...stock.toObject(), // convert mongoose doc → plain object
            symbol: stock.symbol.replace(/\.JK$/i, "")
        }));

        // 3. Kirim List ke Android
        // Kita kirim format yang sesuai dengan StockDataModel.kt (SectorResponse)
        res.json({
            sector: sectorName.toUpperCase(),
            total: cleanedStocks.length,
            stocks: cleanedStocks // Array of objects
        });

    } catch (error) {
        console.error("❌ Error API Sector:", error);
        res.status(500).json({ error: "Gagal mengambil data dari Database." });
    }
});

// ENDPOINT KHUSUS CHART MINI (SPARKLINE)
app.get('/api/market/chartLAMA', async (req, res) => {
    try {
        const currentTime = Date.now();

        // 1. CEK CACHE DULU ⚡
        // Kalau data ada DAN belum lewat 1 jam
        if (ihsgCache && (currentTime - lastIhsgTime < IHSG_CACHE_DURATION)) {
            // console.log("🚀 Serving IHSG Chart from RAM (Hemat Kuota Yahoo)");
            return res.json(ihsgCache);
        }

        // ==========================================
        // KALAU CACHE KOSONG/EXPIRED, BARU HIT KE YAHOO
        // ==========================================
        
        // console.log("🔄 Fetching IHSG from Yahoo Finance...");
        const symbol = '^JKSE'; // IHSG

        // Tentukan Tanggal (6 Bulan Terakhir)
        const today = new Date();
        const startDate = new Date();
        startDate.setMonth(today.getMonth() - 6); 

        const queryOptions = {
            period1: startDate,
            period2: today,
            interval: '1d'
        };

        const history = await yahooFinance.historical(symbol, queryOptions);

        // Mapping Data
        const chartData = history.map(item => ({
            time: item.date.toISOString().split('T')[0],
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        // 2. SIMPAN KE CACHE SEBELUM DIKIRIM 💾
        ihsgCache = chartData;
        lastIhsgTime = currentTime;

        // 3. KIRIM DATA
        res.json(chartData);

    } catch (error) {
        console.error("❌ Chart Error:", error.message);
        
        // Fallback: Kalau error, coba kirim data cache lama (kalau ada) daripada array kosong
        if (ihsgCache) {
            console.log("⚠️ Mengirim data cache lama karena Yahoo Error");
            return res.json(ihsgCache);
        }

        res.json([]); 
    }
});
app.get('/api/market/chart', async (req, res) => {
    try {
        const currentTime = Date.now();

        // 1. CEK CACHE DULU ⚡
        if (ihsgCache && (currentTime - lastIhsgTime < IHSG_CACHE_DURATION)) {
            return res.json(ihsgCache);
        }

        // ==========================================
        // FETCH MANUAL DENGAN HEADER BROWSER
        // ==========================================
        
        // Hitung timestamp detik (Unix Timestamp)
        const period2 = Math.floor(Date.now() / 1000); // Hari ini
        const period1 = period2 - (6 * 30 * 24 * 60 * 60); // 6 Bulan lalu

        // URL Resmi Yahoo yang kamu kasih tadi
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/%5EJKSE?period1=${period1}&period2=${period2}&interval=1d&events=history`;
        
        // 🔥 INI KUNCINYA: Headers biar dikira Browser 🔥
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5"
            }
        });

        if (!response.ok) {
            throw new Error(`Yahoo menolak: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        // Cek struktur data Yahoo (kadang kosong kalau libur)
        const result = data.chart.result[0];
        if (!result || !result.timestamp) {
             throw new Error("Data Yahoo kosong / Market Libur");
        }

        const timestamps = result.timestamp;
        const quotes = result.indicators.quote[0];

        // Mapping Manual Data Yahoo ke Format Kamu
        const chartData = timestamps.map((time, index) => ({
            time: new Date(time * 1000).toISOString().split('T')[0], // Convert Unix ke YYYY-MM-DD
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index]
            // open: quotes.open[index] ? Math.round(quotes.open[index]) : null,
            // high: quotes.high[index] ? Math.round(quotes.high[index]) : null,
            // low: quotes.low[index] ? Math.round(quotes.low[index]) : null,
            // close: quotes.close[index] ? Math.round(quotes.close[index]) : null
        })).filter(item => item.close != null); // Filter data null (error yahoo)

        // 2. SIMPAN KE CACHE 💾
        ihsgCache = chartData;
        lastIhsgTime = currentTime;

        // 3. KIRIM DATA
        res.json(chartData);

    } catch (error) {
        console.error("❌ Chart Error:", error.message);
        
        // Fallback Cache
        if (ihsgCache) {
            console.log("⚠️ Mengirim data cache lama...");
            return res.json(ihsgCache);
        }
        res.status(500).json([]); 
    }
});

app.get('/api/market/summary', async (req, res) => {
    try {
        const currentTime = Date.now();

        // 1. CEK CACHE: Kalau data ada & belum expired (1 jam), pake yg lama
        if (summaryCache && (currentTime - lastSummaryTime < SUMMARY_CACHE_DURATION)) {
            // console.log("Serving Summary from RAM ⚡");
            return res.json(summaryCache);
        }

        // 2. KALAU GAK ADA CACHE / EXPIRED: Hitung ulang ke DB
        // Gunakan Promise.all biar 3 query jalan barengan (Paralel) -> Lebih Cepat
        const [up, down, stagnant] = await Promise.all([
            StockModel.countDocuments({ change: { $gt: 0 } }),
            StockModel.countDocuments({ change: { $lt: 0 } }),
            StockModel.countDocuments({ change: 0 })
        ]);

        const result = {
            up,
            down,
            stagnant,
            total: up + down + stagnant
        };

        // 3. SIMPAN KE RAM (CACHE)
        summaryCache = result;
        lastSummaryTime = currentTime;

        res.json(result);

    } catch (error) {
        console.error("Market Summary Error:", error);
        res.status(500).json({ error: "Gagal mengambil statistik pasar" });
    }
});

app.get('/api/market/rankings', async (req, res) => {
    try {
        const currentTime = Date.now();

        // 1. CEK CACHE (Tetap sama)
        if (rankingsCache && (currentTime - lastRankingsTime < RANKING_CACHE_DURATION)) {
            return res.json(rankingsCache);
        }

        const LIMIT = 7;

        // 2. FETCH DARI DB (Variable namanya aku ganti jadi 'raw...')
        const [rawGainers, rawLosers, rawProBuy, rawLossSell] = await Promise.all([
            StockModel.find().sort({ changePct: -1 }).limit(LIMIT).select('symbol name close change changePct'),
            StockModel.find().sort({ changePct: 1 }).limit(LIMIT).select('symbol name close change changePct'),
            StockModel.find({ change: { $gt: 0 } }).sort({ volume: -1 }).limit(LIMIT).select('symbol name close change changePct volume'),
            StockModel.find({ change: { $lt: 0 } }).sort({ volume: -1 }).limit(LIMIT).select('symbol name close change changePct volume')
        ]);

        // 🔥 FUNGSI PEMBERSIH .JK 🔥
        // Mengubah "BBCA.JK" jadi "BBCA"
        const cleanTicker = (stockList) => {
            return stockList.map(stock => {
                const s = stock.toObject(); // Ubah dari Mongoose Doc ke Object JS Biasa
                s.symbol = s.symbol.replace('.JK', ''); // Hapus suffix
                return s;
            });
        };

        // 3. BERSIHKAN DATA SEBELUM DISIMPAN KE RESULT
        const result = {
            gainers: cleanTicker(rawGainers),
            losers: cleanTicker(rawLosers),
            proBuy: cleanTicker(rawProBuy),
            lossSell: cleanTicker(rawLossSell),
            lastUpdate: currentTime
        };

        // 4. SIMPAN CACHE & KIRIM
        rankingsCache = result;
        lastRankingsTime = currentTime;

        res.json(result);

    } catch (error) {
        console.error("Ranking Error:", error);
        res.status(500).json({ error: "Gagal mengambil data ranking" });
    }
});

// --- CACHE GLOBAL ---
let screenerCache = {}; // { 'Big Accum': [...], 'Small Accum': [...] }
const SCREENER_CACHE_DURATION = 60 * 60 * 1000; // 1 Jam

app.get('/api/screenerLamaLama', async (req, res) => {
    try {
        // 1. Tentukan Parameter (Default 'big')
        // URL kamu tadi ?big, jadi req.query.type undefined, masuk ke default 'big'. Aman.
        const typeParam = req.query.type || 'big'; 
        
        // 2. Tentukan Filter Query MongoDB
        // JANGAN pakai string "Big Accum", tapi pakai object filter
        let dbQueryFilter = {};

        if (typeParam === 'small') {
            // Cari yang field screener.is_small_accum = true
            dbQueryFilter = { "screener.is_small_accum": true }; 
        } else {
            // Default: Cari yang field screener.is_big_money = true
            dbQueryFilter = { "screener.is_big_money": true };
        }

        const currentTime = Date.now();
        // Buat key cache yang unik berdasarkan tipe
        const cacheKey = typeParam; 

        // 3. CEK CACHE
        if (screenerCache[cacheKey] && (currentTime - screenerCache[cacheKey].time < SCREENER_CACHE_DURATION)) {
            return res.json(screenerCache[cacheKey].data);
        }

        // 4. QUERY DB
        // Gunakan dbQueryFilter yang sudah kita buat di atas
        const rawStocks = await StockModel.find(dbQueryFilter)
            .select('symbol company close change changePct screener') // Note: di JSONmu tidak ada field 'name', adanya 'company' atau 'symbol'
            .sort({ changePct: -1 });

        // 5. BERSIHKAN .JK
        const cleanStocks = rawStocks.map(s => {
            const obj = s.toObject();
            
            // Logika menentukan label screener
            let screenerLabel = "";
            if (obj.screener && obj.screener.is_big_money) screenerLabel = "Big Accum";
            else if (obj.screener && obj.screener.is_small_accum) screenerLabel = "Small Accum";

            // Bersihkan changePct dari string "-0.57%" menjadi angka -0.57
            let cleanPct = 0.0;
            if (typeof obj.changePct === 'string') {
                cleanPct = parseFloat(obj.changePct.replace('%', ''));
            }

            return {
                symbol: obj.symbol.replace('.JK', ''),
                name: obj.company || "", // Mapping company ke name
                close: obj.close,
                change: obj.change,
                changePct: cleanPct, // Kirim sebagai angka murni (Double)
                volume: obj.volume,
                screener: screenerLabel // Kirim sebagai String sederhana
            };
        });

        // 6. SIMPAN CACHE
        screenerCache[cacheKey] = {
            data: cleanStocks,
            time: currentTime
        };

        res.json(cleanStocks);

    } catch (error) {
        console.error("Screener Error:", error);
        res.status(500).json({ error: "Gagal ambil data screener" });
    }
});

app.get('/api/screenerLama', async (req, res) => {
    try {
        console.log("Query Params:", req.query);
        const typeParam = req.query.type || 'big'; // default 'big'
        const currentTime = Date.now();

        // 1. Tentukan Filter DB & Sorting
        let dbQueryFilter = {};
        let sortCriteria = { changePct: -1 }; // Default sort: Kenaikan tertinggi
        let limitCount = 20; // Default limit

        if (typeParam === 'scalping') {
            // Logika Khusus Scalping
            dbQueryFilter = { "screener.is_scalping": true };
            // Kita ambil 10 teratas aja (5 Day Trade + 5 Scalping)
            limitCount = 10; 
        } else if (typeParam === 'small') {
            dbQueryFilter = { "screener.is_small_accum": true };
        } else {
            // Default Big Accum
            dbQueryFilter = { "screener.is_big_money": true };
        }

        // 2. CEK CACHE
        // Buat key cache unik, misal "scalping"
        if (screenerCache[typeParam] && (currentTime - screenerCache[typeParam].time < SCREENER_CACHE_DURATION)) {
            return res.json(screenerCache[typeParam].data);
        }

        // 3. QUERY DATABASE
        const rawStocks = await StockModel.find(dbQueryFilter)
            .select('symbol company close change changePct screener volume') 
            .sort(sortCriteria)
            .limit(limitCount);

        // 4. BERSIHKAN & FORMAT DATA (Logic Day Trade vs Scalping disini)
        const cleanStocks = rawStocks.map((s, index) => {
            const obj = s.toObject();
            
            // --- LOGIKA LABELING ---
            let screenerLabel = "";

            if (typeParam === 'scalping') {
                // Jika index 0-4 (5 teratas) -> Day Trade
                if (index < 5) {
                    screenerLabel = "Day Trade";
                } else {
                    // Sisanya (5 berikutnya) -> Scalping
                    screenerLabel = "Scalping";
                }
            } else {
                // Logika label untuk Big/Small accum (seperti sebelumnya)
                if (obj.screener?.is_big_money) screenerLabel = "Big Accum";
                else if (obj.screener?.is_small_accum) screenerLabel = "Small Accum";
            }
            // -----------------------

            // Bersihkan changePct (String "%" jadi Double)
            let cleanPct = 0.0;
            if (typeof obj.changePct === 'string') {
                cleanPct = parseFloat(obj.changePct.replace('%', ''));
            } else if (typeof obj.changePct === 'number') {
                cleanPct = obj.changePct;
            }

            return {
                symbol: obj.symbol.replace('.JK', ''),
                name: obj.company || "", 
                close: obj.close,
                change: obj.change,
                changePct: cleanPct,
                volume: obj.volume,
                screener: screenerLabel // <--- Ini yang akan dibaca Android
            };
        });

        // 5. SIMPAN CACHE
        // screenerCache[typeParam] = {
        //     data: cleanStocks,
        //     time: currentTime
        // };

        res.json(cleanStocks);

    } catch (error) {
        console.error("Screener Error:", error);
        res.status(500).json({ error: "Gagal ambil data screener" });
    }
});

app.get('/api/screener', async (req, res) => {
    try {
        console.log("Query Params:", req.query);
        const typeParam = req.query.type || 'big'; 
        const currentTime = Date.now();

        // 1. Tentukan Filter DB & Sorting
        let dbQueryFilter = {};
        let sortCriteria = { changePct: -1 }; // Default: Naik tertinggi
        let limitCount = 20;

        if (typeParam === 'scalping') {
            // --- LOGIC SCALPING ---
            dbQueryFilter = { "screener.is_scalping": true };
            limitCount = 10; 

        } else if (typeParam === 'small') {
            // --- LOGIC SMALL ACCUM ---
            dbQueryFilter = { "screener.is_small_accum": true };

        } else if (typeParam === 'one_years_up') { 
            // Cari yang flag 'one_years_up' nya TRUE
            dbQueryFilter = { "screener.one_years_up": true };
            
            // Tips: Bisa sort berdasarkan Volume Spike atau Change Pct
            // sortCriteria = { "screener.vol_spike_ratio": -1 }; // Opsional
            
        } else {
            // --- DEFAULT: BIG ACCUM ---
            dbQueryFilter = { "screener.is_big_money": true };
        }

        // 2. CEK CACHE (Sama kayak logic kamu)
        // ... (Code Cache kamu) ...

        // 3. QUERY DATABASE
        const rawStocks = await StockModel.find(dbQueryFilter)
            // Pastikan field 'screener' diambil semua biar bisa cek one_years_up
            .select('symbol company close change changePct screener volume') 
            .sort(sortCriteria)
            .limit(limitCount);

        // 4. BERSIHKAN & FORMAT DATA
        const cleanStocks = rawStocks.map((s, index) => {
            const obj = s.toObject();
            
            // --- LOGIKA LABELING ---
            let screenerLabel = "";

            if (typeParam === 'scalping') {
                screenerLabel = index < 5 ? "Day Trade" : "Scalping";

            } else if (typeParam === 'sleeping') {
                // 🔥 LABEL BARU
                screenerLabel = "Sleeping Giant"; 

            } else {
                // Label Default
                if (obj.screener?.is_big_money) screenerLabel = "Big Accum";
                else if (obj.screener?.is_small_accum) screenerLabel = "Small Accum";
            }

            // Bersihkan changePct (Code lama kamu)
            let cleanPct = 0.0;
            if (typeof obj.changePct === 'string') {
                cleanPct = parseFloat(obj.changePct.replace('%', ''));
            } else if (typeof obj.changePct === 'number') {
                cleanPct = obj.changePct;
            }

            return {
                symbol: obj.symbol.replace('.JK', ''),
                name: obj.company || "", 
                close: obj.close,
                change: obj.change,
                changePct: cleanPct,
                volume: obj.volume,
                screener: screenerLabel,
                
                // Optional: Kalau mau nampilin detail di Android
                // return_setahun: obj.screener?.one_year_return 
            };
        });

        // 5. SIMPAN CACHE & RETURN
        res.json(cleanStocks);

    } catch (error) {
        console.error("Screener Error:", error);
        res.status(500).json({ error: "Gagal ambil data screener" });
    }
});

app.get('/api/comments', async (req, res) => {
    try {
        const { ticker } = req.query;

        // 1. Cari yang parent_id-nya NULL (Induk saja)
        const comments = await CommentModel.find({ 
            stock_symbol: ticker.toUpperCase(),
            parent_id: null 
        })
        .sort({ created_at: -1 })
        .populate('user_id', 'display_name photo_url')
        // 2. 🔥 Populate Virtual 'replies' + User penngirim reply
        .populate({
            path: 'replies',
            populate: { path: 'user_id', select: 'display_name photo_url' },
            options: { sort: { created_at: 1 } } // Reply urut dari lama ke baru
        });

        res.json({ status: "success", data: comments });
    } catch (error) {
        res.status(500).json({ message: "Error", error: error.message });
    }
});

app.post('/api/comments', optionalAuth, async (req, res) => {
    try {
        console.log("📦 BODY MASUK:", req.body);
        const { stock_symbol, content, parent_id } = req.body; // 👈 Terima parent_id
        const user_id = req.user._id;

        const newComment = await CommentModel.create({
            user_id,
            stock_symbol: stock_symbol.toUpperCase(),
            content,
            parent_id: parent_id || null // Kalau gak dikirim, jadi null (Induk)
        });

        await newComment.populate('user_id', 'display_name photo_url');

        res.status(201).json({ status: "success", data: newComment });
    } catch (error) {
        res.status(500).json({ message: "Gagal", error: error.message });
    }
});

app.delete('/api/comments/:id', optionalAuth, async (req, res) => {
    try {
        const commentId = req.params.id;
        const userId = req.user._id; // Dari Token

        // 1. Cari Komennya
        const comment = await CommentModel.findById(commentId);

        if (!comment) {
            return res.status(404).json({ message: "Komentar tidak ditemukan" });
        }

        // 2. Validasi Pemilik (Hanya boleh hapus punya sendiri)
        // toString() penting karena ObjectID vs String
        if (comment.user_id.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Bukan punya lu, woy!" });
        }

        // 3. Cek apakah dia punya Anak/Reply?
        const hasChildren = await CommentModel.exists({ parent_id: commentId });

        if (hasChildren) {
            await CommentModel.findByIdAndUpdate(
                commentId,
                {
                    $set: {
                        content: "[Komentar telah dihapus]",
                        // TIPS PRO: Mending user_id jangan di-null-kan kalau dia required di Schema.
                        // Sebagai gantinya, lu bisa nambahin flag penanda.
                        is_deleted: true 
                    }
                }
            );
            
            res.json({ status: "success", message: "Komentar disembunyikan (Soft Delete)" });
        } else {
            // --- SKENARIO HARD DELETE (Kalau jomblo) ---
            await CommentModel.deleteOne({ _id: commentId });
            
            res.json({ status: "success", message: "Komentar musnah selamanya" });
        }

    } catch (error) {
        res.status(500).json({ message: "Server Error", error: error.message });
    }
})

app.listen(PORT, () => console.log(`Server run di ${PORT}`));

async function processSectorUpdate(sectorName) {
    if (!sectorName || !SECTOR_MAP[sectorName.toUpperCase()]) {
        console.log(`⚠️ Sektor ${sectorName} tidak valid atau tidak ditemukan.`);
        return;
    }

    console.log(`🚀 [CRON] Update sektor ${sectorName} dimulai...`);

    const stockList = SECTOR_MAP[sectorName.toUpperCase()];
    const today = new Date();
    // const period2 = today.toISOString().split('T')[0];
    
    // const startDate = new Date();
    // startDate.setDate(today.getDate() - 365); 

    const startDate = new Date();
    startDate.setDate(today.getDate() - 365); 
    const period1 = startDate.toISOString().split('T')[0]; // Hasil: "2025-03-17"

    // // Set Kemarin
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const period2 = yesterday.toISOString().split('T')[0]; // Hasil: "2026-03-16"

    for (const ticker of stockList) {
        const symbol = ticker + ".JK";
        try {            
                // --- STEP 1: TARIK DATA ---
                const [quoteResult, historyResult] = await Promise.all([
                    yahooFinance.quoteSummary(symbol, {
                        modules: ["price", "summaryDetail", "defaultKeyStatistics"]
                    }).catch(e => {
                        // Jangan didiamkan, kita log biar tahu kalau ada error beneran
                        console.error(`⚠️ Gagal narik quoteResult ${ticker}:`, e.message);
                        return null;
                    }),
                    
                    // Tarik history 1 tahun ke belakang
                    yahooFinance.historical(symbol, {
                        // period1: period1,
                        // period2: period2,
                        // interval: '1d'
                        period1: startDate, 
                        period2: new Date(),
                        interval: '1d' 
                    }).catch(e => {
                        // Jangan didiamkan, kita log biar tahu kalau ada error beneran
                        console.error(`⚠️ Gagal narik history ${ticker}:`, e.message);
                        return [];
                    })
                ]);
                // console.log('ini historyResult',quoteResult);
                // const period2 = Math.floor(Date.now() / 1000); // Hari ini
                // const period1 = period2 - (12 * 30 * 24 * 60 * 60); // 6 Bulan lalu

                // // URL Resmi Yahoo yang kamu kasih tadi
                // const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d&events=history`;
                
                // // 🔥 INI KUNCINYA: Headers biar dikira Browser 🔥
                // const response = await fetch(url, {
                //     headers: {
                //         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                //         "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                //         "Accept-Language": "en-US,en;q=0.5"
                //     }
                // });

                // if (!response.ok) {
                //     throw new Error(`Yahoo menolak: ${response.status} ${response.statusText}`);
                // }

                // const data = await response.json();
                // const result = data.chart.result[0];
                // const timestamps = result.timestamp;
                // const quotes = result.indicators.quote[0];

                // // Mapping Manual Data Yahoo ke Format Kamu
                // const chartData = timestamps.map((time, index) => ({
                //     time: new Date(time * 1000).toISOString().split('T')[0], // Convert Unix ke YYYY-MM-DD
                //     open: quotes.open[index],
                //     high: quotes.high[index],
                //     low: quotes.low[index],
                //     close: quotes.close[index],
                //     volume: quotes.volume[index] || 0
                //     // open: quotes.open[index] ? Math.round(quotes.open[index]) : null,
                //     // high: quotes.high[index] ? Math.round(quotes.high[index]) : null,
                //     // low: quotes.low[index] ? Math.round(quotes.low[index]) : null,
                //     // close: quotes.close[index] ? Math.round(quotes.close[index]) : null
                // })).filter(item => item.close != null); // Filter data null (error yahoo)
                // console.log(chartData);
                         

                if (!quoteResult || !quoteResult.price || !quoteResult.price.regularMarketPrice) {
                    console.log(`⚠️ Skip ${ticker}: Data corrupt.`);
                    continue;
                }

                const priceData = quoteResult.price;
                const summary = quoteResult.summaryDetail || {};
                const stats = quoteResult.defaultKeyStatistics || {};
                const currentPrice = priceData.regularMarketPrice;

                // --- STEP 2: HITUNG TRADING PLAN (Function kamu yg lama) ---
                const plan = calculatePlan(
                    currentPrice,
                    priceData.regularMarketDayHigh,
                    priceData.regularMarketDayLow,
                    summary.fiftyTwoWeekHigh,
                    summary.fiftyTwoWeekLow
                );

                const screenerStats = analyzeCandles(historyResult);
                
                const toPercent = (val) => val ? (val * 100).toFixed(2) + "%" : "-";
                const toX = (val) => val ? val.toFixed(2) + "x" : "-";
                const toDec = (val) => val ? val.toFixed(2) : "-";
                // --- STEP 3: LOGIC SCREENER BARU (MA20 & 1 Year) 🔥 --- 
                
                // A. Hitung MA 20
                // 1. Hitung MA 20 & 1 Year Return (Logic Sebelumnya)
                const ma20Value = calculateMA(historyResult, 20);
                
                let oneYearReturnPct = 0;
                if (historyResult.length > 0) {
                    const price1YearAgo = historyResult[0].close;                    
                    if (price1YearAgo > 0) {
                        oneYearReturnPct = ((currentPrice - price1YearAgo) / price1YearAgo) * 100;
                    }
                }
                oneYearReturnPct = parseFloat(oneYearReturnPct.toFixed(2));
                
                // --- LOGIC BARU SESUAI REQUEST ---
                
                // A. Data Pendukung
                const currentVol = summary.volume || 0;
                const prevClosePrice = priceData.regularMarketPreviousClose;
                
                // Ambil Volume Kemarin (H-1) dari history
                // Kita ambil index ke-3 dari belakang untuk aman index -1 & -2 masih last daily so ambil -3 yang yesterday nya
                const prevCandle = historyResult.length >= 3 ? historyResult[historyResult.length - 3] : null;
                
                const prevVol = prevCandle ? prevCandle.volume : 0; // Fallback kalau data kurang

                // B. Pengecekan Syarat (Satu per satu)
                
                // Syarat 1: Vol > 1.5x Volume Sebelumnya
                const condVolSpike = currentVol > (1.5 * prevVol);                
                
                // Syarat 2: Price > 55
                const condPrice55 = currentPrice > 55;
                
                // Syarat 3: Price > Price Sebelumnya (Lagi Ijo)
                const condGreen = currentPrice > prevClosePrice;
                
                // Syarat 4: Transaksi > 100 Juta
                const transactionValue = currentPrice * currentVol;
                const condLiquid = transactionValue > 100000000;
                
                // Syarat 5: 1 Year Return < 1 (Sleeping Giant)
                const condSleeping = oneYearReturnPct < 1;
                
                // Syarat 6: Price > MA 20
                const condAboveMA20 = ma20Value > 0 && currentPrice > ma20Value;

                // --- KESIMPULAN AKHIR ---
                // Semua syarat harus TRUE
                const isMatchScreener = condVolSpike && condPrice55 && condGreen && condLiquid && condSleeping && condAboveMA20;

                //--- STEP 4: SIMPAN KE DB ---
                await StockModel.findOneAndUpdate(
                    { symbol: symbol },
                    {
                        symbol: symbol,
                        company: priceData.longName,
                        sector: sectorName.toUpperCase(),
                        
                        // ... (Field Harga Sama Kayak Dulu) ...
                        open: priceData.regularMarketOpen,
                        high: priceData.regularMarketDayHigh,
                        low: priceData.regularMarketDayLow,
                        close: priceData.regularMarketPrice,
                        change: priceData.regularMarketChange,
                        changePct: priceData.regularMarketChangePercent 
                            ? parseFloat((priceData.regularMarketChangePercent * 100).toFixed(2)) 
                            : 0,
                        volume: summary.volume,
                        avgVol10day: priceData.averageDailyVolume10Day,
                        avgVol3M: priceData.averageDailyVolume3Month,
                        previousClose: priceData.regularMarketPreviousClose,

                        percentageDownATH: plan.pctDownATH,
                        percentageUpFromBottom: plan.pctUpBottom,
                        fiftyTwoWeekHigh: summary.fiftyTwoWeekHigh,
                        fiftyTwoWeekLow: summary.fiftyTwoWeekLow,

                        fundamentals: {
                            marketCap: summary.marketCap,
                            bookValue: stats.bookValue,
                            pe_ratio: toX(summary.trailingPE),
                            eps: toDec(stats.trailingEps),
                            priceToBook: toX(stats.priceToBook),
                            dividendYield: toPercent(summary.dividendYield),
                            profitMargins: toPercent(stats.profitMargins),
                            incomeQoQ: toPercent(stats.earningsQuarterlyGrowth), // "10.5%"
                            lastDividendValue: stats.lastDividendValue,
                            enterpriseValue: stats.enterpriseValue,
                            enterpriseToEBITDA: toX(stats.enterpriseToEbitda),
                            enterpriseToRevenue: toX(stats.enterpriseToRevenue),
                            netIncomeToCommon: stats.netIncomeToCommon
                        },

                        ownership: {
                            insiders: toPercent(stats.heldPercentInsiders),
                            institutions: toPercent(stats.heldPercentInstitutions)
                        },

                        // Screener Field 🔥
                        screener: {
                            is_big_money: screenerStats.is_big_money,
                            big_money_count: screenerStats.big_money_count,
                            is_small_accum: screenerStats.is_small_accum,
                            small_money_count: screenerStats.small_money_count,
                            is_scalping: screenerStats.is_scalping, // <--- JANGAN LUPA INI!

                            // 2. Data Ranking (PENTING BUAT SORTING API)
                            total_value_today: screenerStats.total_value_today, // Buat ranking Likuiditas
                            change_pct: screenerStats.change_pct,               // Buat ranking Top Gainers
                            avg_value_transaction: screenerStats.avg_value_transaction, // Buat filter Big Cap

                            // Technical Indicators
                            one_years_up: isMatchScreener, 

                            // Detail Indikator (Disimpan biar bisa didebug/ditampilkan)
                            ma20: ma20Value,
                            one_year_return: oneYearReturnPct,
                            tx_value: transactionValue,
                            vol_spike_ratio: prevVol > 0 ? (currentVol / prevVol).toFixed(2) : "0", // Misal: "1.8x"

                            last_updated: new Date()
                        },

                        trading_plan: {
                            pivot: plan.pivot,
                            support_pertahanan: plan.s1,
                            support_kuat: plan.s2,
                            support_awal: plan.s3,
                            best_entry: plan.bestEntry,
                            avg_down: plan.avgDown,
                            tsp1: plan.tsp1,
                            tsp2: plan.tsp2,
                            tsp3: plan.tsp3,
                            rekomendasi: priceData.regularMarketPrice < plan.s3 ? "WAIT" : "BUY"
                        },
                        
                        // Percentage Number (Tanpa %)
                        percentageDownATH: plan.pctDownATH,
                        percentageUpFromBottom: plan.pctUpBottom
                    },
                    { upsert: true, new: true }
                );

                console.log(`✅ ${ticker} | Price: ${currentPrice} | MA20: ${ma20Value} | 1Y: ${oneYearReturnPct}%`);

            } catch (err) {
                console.error(`❌ Fail: ${ticker}`, err.message);
            }
            
            await sleep(1800); // Jangan terlalu ngebut, nanti Yahoo nge-block
    }
    console.log(`🏁 [CRON] Update Selesai: ${sectorName}`);
}

cron.schedule('30 16 * * 1-5', async () => {
    console.log("⏰ Jam 17:00! Memulai auto-update semua sektor...");
    
    const allSectors = Object.keys(SECTOR_MAP); // Ambil semua nama sektor (FINANCE, BASIC, dll)
    
    // Looping untuk update SEMUA sektor satu per satu
    for (const sector of allSectors) {
        await processSectorUpdate(sector);
    }
    
    console.log("🎉 SEMUA SEKTOR BERHASIL DIUPDATE OTOMATIS!");
}, {
    scheduled: true,
    timezone: "Asia/Jakarta" // PENTING 🔥 Biar ngikutin jam WIB (bukan jam server luar negeri)
});

function getAllSymbols() {
    let allStocks = [];
    for (const sector in SECTOR_MAP) {
        allStocks.push(...SECTOR_MAP[sector]);
    }
    // Ingat: Ini udah nambahin .JK otomatis -> ["GDST.JK", "KRAS.JK"]
    return allStocks.map(sym => `${sym}.JK`);
}

// Function Utama (Tanpa parameter sectorName)
async function processIntradayUpdateAll() {
    console.log(`⚡ [CRON INTRADAY] Update SEMUA saham dimulai...`);

    // 1. Ambil seluruh list saham gabungan
    const allSymbols = getAllSymbols(); 
    
    const today = new Date();
    // Tarik 7 hari ke belakang (buat nutupin libur Sabtu-Minggu)
    const startDate = new Date();
    startDate.setDate(today.getDate() - 22); 

    // 2. Looping langsung dari array gabungan
    for (const symbol of allSymbols) {
        // Karena symbol udah ada .JK (misal: "BBCA.JK"), kita buang buat keperluan log
        const ticker = symbol.replace(".JK", ""); 

        try {
            // --- STEP 1: TARIK DATA SUPER RINGAN ---
            const [quoteResult, historyResult] = await Promise.all([
                yahooFinance.quote(symbol).catch(e => null),
                
                yahooFinance.historical(symbol, { 
                    period1: startDate, 
                    period2: new Date(),
                    interval: '1d' 
                }).catch(e => {
                    // Jangan didiamkan, kita log biar tahu kalau ada error beneran
                    console.error(`⚠️ Gagal narik history intraday ${ticker}:`, e.message);
                    return [];
                })
            ]);
            
            if (!quoteResult || !quoteResult.regularMarketPrice) {
                continue; // Skip kalau data bolong
            }

            const currentPrice = quoteResult.regularMarketPrice;
            const currentVol = quoteResult.regularMarketVolume || 0;
            const prevClosePrice = quoteResult.regularMarketPreviousClose;
            
            // --- STEP 2: LOGIC SCREENER INTRADAY ---
            const screenerStats = analyzeCandlesIntraday(historyResult);
            
            // Ambil Volume H-1 dari history buat nyari Spike
            const prevCandle = historyResult.length >= 3 ? historyResult[historyResult.length - 3] : null;
            
            const prevVol = prevCandle ? prevCandle.volume : currentVol; 
            
            const transactionValue = currentPrice * currentVol;
            const volSpikeRatio = prevVol > 0 ? (currentVol / prevVol).toFixed(2) : "0";

            // --- STEP 3: UPDATE KE DB ---
            await StockModel.findOneAndUpdate(
                { symbol: symbol }, // Cari pakai yang ada .JK-nya
                {
                    $set: {
                        open: quoteResult.regularMarketOpen,
                        high: quoteResult.regularMarketDayHigh,
                        low: quoteResult.regularMarketDayLow,
                        close: currentPrice,
                        change: quoteResult.regularMarketChange,
                        changePct: quoteResult.regularMarketChangePercent 
                            ? parseFloat((quoteResult.regularMarketChangePercent).toFixed(2)) 
                            : 0,
                        volume: currentVol,
                        previousClose: prevClosePrice,
                        "screener.is_big_money": screenerStats.is_big_money,
                        "screener.big_money_count": screenerStats.big_money_count,
                        "screener.is_small_accum": screenerStats.is_small_accum,
                        "screener.total_value_today": transactionValue,
                        "screener.tx_value": transactionValue,
                        "screener.change_pct": quoteResult.regularMarketChangePercent,
                        "screener.vol_spike_ratio": volSpikeRatio,
                        "screener.last_updated": new Date()
                    }
                },
                { new: true }
            );

            // console.log(`⚡ ${ticker} | P: ${currentPrice} | Vol: ${currentVol} | Spike: ${volSpikeRatio}x`);

        } catch (err) {
            console.error(`❌ Fail Intraday: ${ticker}`, err.message);
        }
        
        // Jeda 500ms biar aman dari Yahoo
        await sleep(800); 
    }
    console.log(`🏁 [CRON INTRADAY] Update SEMUA Saham Selesai!`);
}

// Jadwal Cron Job Intraday
cron.schedule('*/15 09-16 * * 1-5', () => {
    const jakartaTime = new Date().toLocaleString("en-US", {timeZone: "Asia/Jakarta"});
    const now = new Date(jakartaTime);
    console.log(now);
    
    const hari = now.getDay(); // 1 = Senin, ..., 5 = Jumat
    const jam = now.getHours();
    const menit = now.getMinutes();    

    // ==========================================
    // GERBANG PENJAGA 1: KHUSUS HARI JUMAT
    // Istirahat: 11:45 s/d 13:59
    // ==========================================
    if (hari === 5) {
        if ((jam === 11 && menit >= 45) || jam === 12 || jam === 13 || (jam === 14 && menit === 0)) {
            console.log(`⏸️ [JUMAT ${jam}:${menit}] Istirahat Jum'atan, skip narik data!`);
            return; // Berhenti di sini, jangan narik data
        }
    } 
    // ==========================================
    // GERBANG PENJAGA 2: SENIN - KAMIS
    // Istirahat: 12:00 s/d 13:29
    // ==========================================
    else {
        if (jam === 12 || (jam === 13 && menit < 30)) {
            console.log(`⏸️ [${jam}:${menit}] Bursa istirahat siang, skip narik data!`);
            return; // Berhenti di sini, jangan narik data
        }
    }

    // Kalau lolos dari kedua gerbang di atas, baru hajar tarik data!
    console.log(`▶️ [${jam}:${menit}] Market jalan, sikat data Intraday!`);
    processIntradayUpdateAll();

}, {
    scheduled: true,
    timezone: "Asia/Jakarta" // Wajib biar jamnya akurat ngikutin Jakarta
});

async function sendSmartScreenerNotif() {
    try {
        // 1. Cari Top 5 Big Accum (Urutkan dari transaksi paling gede)
        const topBigAccum = await StockModel.find({ "screener.is_big_money": true })
            .sort({ "screener.total_value_today": -1 })
            .limit(5);

        // 2. Cari Top 5 Small Accum (Urutkan dari transaksi paling gede)
        const topSmallAccum = await StockModel.find({ "screener.is_small_accum": true })
            .sort({ "screener.total_value_today": -1 })
            .limit(5);

        // Kalau market lagi sepi dan gak ada data sama sekali, jangan kirim notif
        if (topBigAccum.length === 0 && topSmallAccum.length === 0) {
            console.log("Market sepi, skip notif.");
            return;
        }

        // 3. Rangkai Teks Notifikasinya (Pake .map biar otomatis jadi koma-komaan)
        const bigNames = topBigAccum.map(s => s.symbol.replace(".JK", "")).join(", ");
        const smallNames = topSmallAccum.map(s => s.symbol.replace(".JK", "")).join(", ");

        let bodyText = "";
        if (bigNames) bodyText += `🔥 Big Accum: ${bigNames}\n`;
        if (smallNames) bodyText += `💎 Small Accum: ${smallNames}`;

        // 4. Siapkan Payload Firebase
        const message = {
            notification: {
                title: "Radar Screener Sesi Ini! 🚀",
                body: bodyText
            },
            topic: "all_users"
        };

        // 5. Eksekusi Kirim!
        await admin.messaging().send(message);
        console.log(`📲 Notif Top 5 berhasil dikirim!`);

    } catch (error) {
        console.error("❌ Gagal generate notif Top 5:", error);
    }
}

// ==========================================
// CRON JOB KHUSUS NOTIFIKASI
// ==========================================
// Jalan jam 10:30 pagi (Sesi 1) dan 14:30 siang (Sesi 2), Senin - Jumat
cron.schedule('0 10,11,12,14 * * 1-5', () => {
    console.log("⏰ [CRON NOTIF] Memicu notifikasi radar (Sesi Jam Pas)...");
    sendSmartScreenerNotif();
}, {
    // 🔥 PENTING: Paksa pakai jam WIB
    scheduled: true,
    timezone: "Asia/Jakarta" 
});

// 2. Jadwal khusus untuk jam 15:45 (Jelang Penutupan Market)
cron.schedule('45 15 * * 1-5', () => {
    console.log("⏰ [CRON NOTIF] Memicu notifikasi radar (Sesi 15:45)...");
    sendSmartScreenerNotif();
}, {
    // 🔥 PENTING: Paksa pakai jam WIB
    scheduled: true,
    timezone: "Asia/Jakarta" 
});

// const allSectors = Object.keys(SECTOR_MAP); // Ambil semua nama sektor (FINANCE, BASIC, dll)
    
//     // Looping untuk update SEMUA sektor satu per satu
//     for (const sector of allSectors) {
//         await processSectorUpdate(sector);
//     }

// processIntradayUpdateAll()