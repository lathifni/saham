/**
 * Fungsi untuk menyensor data berdasarkan tipe fitur
 * @param {Object|Array} data - Data asli dari Database
 * @param {String} type - Jenis fitur ('day_trade', 'screener', 'analysis')
 * @param {Boolean} isPremium - Status user
 */
const maskData = (data, featureType, isPremium) => {
  // 🔥 KALAU PREMIUM, LOLOSKAN SEMUA (Tanpa Sensor)
  if (isPremium) return data;

  // Kalau data kosong/null, kembalikan apa adanya
  if (!data) return data;

  // Helper untuk sensor Object tunggal
  const applyMask = (item, type) => {
      // Clone object biar aman (memutus referensi memori)
      const doc = item.toObject ? item.toObject() : { ...item }; 

      switch (type) {
          // ==================================================
          // 1. MASKING SCREENER (Scalping, Sleeping, dll)
          // ==================================================
          case 'screener':
              return {
                  ...doc,
                  // ✅ Tetap Tampil (Biar user tau saham apa aja)
                  symbol: doc.symbol,
                  name: doc.name,
                  close: doc.close,
                  changePct: doc.changePct,
                  screener: doc.screener, // Label tetap muncul

                  // ❌ SENSOR (Bikin user penasaran)
                  // Kita umpetin Volume spike atau alasan detil kenapa masuk screener
                  volume: "🔒 PREMIUM", 
                  
                  // Kalau ada field return setahun (Sleeping Giant), sensor juga
                  return_setahun: doc.return_setahun ? "🔒 ****" : undefined,
                  
                  // Tambahan info buat UI
                  is_locked: true,
                  note: "Upgrade Premium untuk analisa volume & detail."
              };

          // ==================================================
          // 2. MASKING RANKINGS (Pro Buy / Loss Sell)
          // ==================================================
          case 'rankings_pro': 
              return {
                  ...doc,
                  symbol: doc.symbol,
                  name: doc.name,
                  close: doc.close,
                  
                  // ❌ SENSOR Bandarmology Flow
                  // ChangePct & Volume kita tutup biar gak bisa analisa mendalam
                  change: null,
                  changePct: null, 
                  volume: "🔒 HIDDEN",
                  
                  is_locked: true
              };

          // ==================================================
          // 3. MASKING ANALYZE (Trading Plan & Fundamentals)
          // ==================================================
          case 'analyze':
              return {
                  ...doc,
                  // ✅ Metadata aman
                  meta: doc.meta,
                  data_mentah: doc.data_mentah, // OHLC biarin aja, itu data umum

                  // ❌ SENSOR KERAS: TRADING PLAN (Jantungnya Aplikasi)
                  trading_plan: {
                      status: "LOCKED 🔒",
                      buy_area: "Upgrade Premium",
                      stop_loss: "****",
                      target_price: "****",
                      desc: "Analisa lengkap hanya untuk member Premium."
                  },

                  // ❌ SENSOR: Bandarmology (Ownership)
                  ownership: {
                      status: "LOCKED",
                      foreign_flow: "****",
                      local_flow: "****",
                      top_holder: ["Hidden", "Hidden", "Hidden"]
                  },

                  // ❌ SENSOR: Fundamental Ratio (Opsional)
                  fundamentals: doc.fundamentals ? {
                      ...doc.fundamentals,
                      fair_value: "🔒 Premium Only" // Misal kamu punya hitungan harga wajar
                  } : null
              };

          default:
              return doc;
      }
  };

  // Logic Pengecekan Array vs Object
  if (Array.isArray(data)) {
      return data.map(item => applyMask(item, featureType));
  } else {
      return applyMask(data, featureType);
  }
};

export default maskData;