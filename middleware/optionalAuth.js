// middleware/optionalAuth.js
import User from '../models/user.js'; // 👈 Sesuaikan path model User
import admin from 'firebase-admin';   // 👈 Pastikan firebase-admin sudah di-init di server.js atau import config kamu

const optionalAuth = async (req, res, next) => {
    try {
        console.log("🔍 Middleware Auth: Mulai Cek...");

        // 1. Ambil token dari Header Authorization
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log("⚠️ Middleware: Tidak ada token / Header salah. (Guest Mode)");
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];

        // 2. VERIFIKASI PAKAI FIREBASE (BUKAN jsonwebtoken) 👈 INI KUNCINYA
        // Kita minta Firebase cek: "Ini token asli apa palsu?"
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        console.log(`✅ Token Valid! UID Firebase: ${decodedToken.uid}`);

        // 3. Cari User di MongoDB pakai firebase_uid
        const user = await User.findOne({ firebase_uid: decodedToken.uid });

        if (!user) {
            console.log("❌ User tidak ditemukan di MongoDB (Mungkin belum sync login)");
            req.user = null;
        } else {
            console.log(`👤 User Ketemu: ${user.email} | Premium: ${user.is_premium}`);
            // BERHASIL! Tempel user ke request
            req.user = user; 
        }

        next();

    } catch (error) {
        // Kalau token expired, salah, atau error lain -> Anggap Guest
        console.log("⚠️ Auth Gagal (Ignored):", error.message);
        req.user = null;
        next();
    }
};

export default optionalAuth;