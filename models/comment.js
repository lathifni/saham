// models/Comment.js
import mongoose from 'mongoose';

const CommentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    stock_symbol: { type: String, required: true },
    content: {
        type: String,
        required: true,
        trim: true, // Hapus spasi di awal/akhir
        maxLength: 500 // 🔥 BATAS SUCI
    },
    created_at: { type: Date, default: Date.now },
    
    // 🔥 TAMBAHAN 1: Link ke Bapaknya
    parent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null // Kalau null berarti dia Induk
    }
}, {
    // 🔥 TAMBAHAN 2: Izinkan Virtuals masuk ke JSON
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// 🔥 TAMBAHAN 3: Virtual "replies"
// "Tolong carikan Comment lain yang parent_id-nya adalah _id saya"
CommentSchema.virtual('replies', {
    ref: 'Comment',
    localField: '_id',
    foreignField: 'parent_id'
});

export default mongoose.model('Comment', CommentSchema);