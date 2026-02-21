import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    // 🆔 IDENTITAS UTAMA
    firebase_uid: { 
        type: String, 
        required: true, 
        unique: true,
        index: true // Biar pencarian user ngebut ⚡
    },
    email: { 
        type: String, 
        required: true, 
        unique: true 
    },
    display_name: { type: String, default: "User Becorp" },
    photo_url: { type: String, default: "" },

    // 👑 STATUS SULTAN / REVENUECAT
    is_premium: { 
        type: Boolean, 
        default: false 
    },
    premium_expiry: { 
        type: Date, 
        default: null 
    },

    // 🎁 PROMO SOFT LAUNCH (PENTING!)
    // Field ini kunci biar user gak bisa klaim promo 6 bulan berkali-kali
    has_claimed_promo: { 
        type: Boolean, 
        default: false 
    },

    // 📱 KEAMANAN (Opsional, Future Proof)
    // Bisa buat ngecek "User ini login pakai HP apa aja?"
    registered_devices: [{
        device_id: String,
        device_name: String,
        last_active: Date
    }],

    // 🕒 AUDIT / TIMESTAMPS
    last_login: { 
        type: Date, 
        default: Date.now 
    },
    joined_at: { 
        type: Date, 
        default: Date.now 
    }
});

export default mongoose.model('User', UserSchema);