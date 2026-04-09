import mongoose from 'mongoose';

const NewsSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true 
    },
    source: { 
        type: String, 
        required: true 
    },
    url: { 
        type: String, 
        required: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

export default mongoose.model('News', NewsSchema);