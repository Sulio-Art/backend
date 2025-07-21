import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
    query: { type: String, required: true },
    igid: { type: String, required: true },
    task: { type: String, required: true },
    response: { type: String, required: true },
    summary: { type: String, required: true }
}, { timestamps: true });

const Chat = mongoose.model('Chat', ChatSchema);

export default Chat;
