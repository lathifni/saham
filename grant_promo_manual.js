import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import User from './models/user.js'; // ⚠️ Pastikan path ini benar ke model User kamu

// Load Environment Variables (.env)
dotenv.config();

// 👇 SETTING RAHASIA 👇
// Pastikan di .env ada: RC_SECRET_KEY=sk_xxxxxx
const RC_SECRET_KEY = process.env.RC_SECRET_KEY; 

// 👇 NAMA ENTITLEMENT DI REVENUECAT 👇
// Cek di Dashboard RevenueCat -> Project Settings -> Entitlements
// Biasanya namanya "pro", "premium", atau "pro_access"
const ENTITLEMENT_ID = 'pro_access'; 

// 👇 LIST EMAIL TARGET (Bisa tambah banyak koma) 👇
const targetEmails = [
    "lathifni.ni@gmail.com"
];

// Koneksi ke Database
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log("✅ Database Connected. Siap mengeksekusi...");
        runBatchJob();
    })
    .catch(err => console.error("❌ DB Error:", err));

async function runBatchJob() {
    console.log(`🚀 Memulai proses untuk ${targetEmails.length} user...`);

    for (const email of targetEmails) {
        try {
            // 1. Cari User di MongoDB (Butuh firebase_uid nya)
            const user = await User.findOne({ email: email });

            if (!user) {
                console.log(`⚠️ Skip: ${email} tidak ditemukan di database.`);
                continue;
            }

            console.log(`🎁 OTW memberikan promo ke: ${email} (UID: ${user.firebase_uid})...`);

            // 2. Tembak API RevenueCat (Grant Promotional Entitlement)
            // Docs: https://www.revenuecat.com/docs/api-v1#tag/customers/operation/grant-entitlement
            await axios.post(
                `https://api.revenuecat.com/v1/subscribers/${user.firebase_uid}/entitlements/${ENTITLEMENT_ID}/promotional`,
                {
                    duration: "six_month", // Pilihan: weekly, monthly, three_month, six_month, annual, lifetime
                    start_time_ms: Date.now() // Mulai detik ini
                },
                {
                    headers: {
                        'Authorization': `Bearer ${RC_SECRET_KEY}`,
                        'Content-Type': 'application/json',
                    }
                }
            );

            // 3. Update Database Lokal (Biar sinkron)
            user.has_claimed_promo = true;
            user.is_premium = true; 
            user.premium_expiry = new Date(Date.now() + (180 * 24 * 60 * 60 * 1000)); // +6 Bulan (Opsional visual aja)
            await user.save();

            console.log(`✅ SUKSES! ${email} sekarang Premium 6 Bulan.`);

        } catch (error) {
            console.error(`❌ GAGAL ${email}:`, error.response?.data?.message || error.message);
        }
    }

    console.log("\n🎉 Proses Selesai. Tekan Ctrl + C untuk keluar.");
}