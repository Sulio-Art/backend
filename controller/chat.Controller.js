import Chat from '../model/chat.Model.js';
import { callChatbot } from '../services/chatbotService.js';

export const handleChat = async (req, res) => {
    try {
        const { query, task } = req.body;
        const igid = req.igid; 

        if (!query || !igid || !task) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        const chatbotResponse = await callChatbot(query, igid, task);

        const newChat = new Chat({
            query,
            igid,
            task,
            response: chatbotResponse.response,
            summary: chatbotResponse.summary
        });

        await newChat.save();

        res.status(201).json(newChat);

    } catch (error) {
        console.error('Handle Chat Error:', error.message);
        res.status(500).json({ error: 'Server Error' });
    }
};
export const getChatHistory = async (req, res) => {
    try {
        const { igid } = req.params;
        const chatHistory = await ChatHistory.find({ igid }).sort({ createdAt: -1 });

        if (!chatHistory.length) {
            return res.status(404).json({ message: 'No chat history found' });
        }

        res.json({ chatHistory });
    } catch (error) {
        console.error('Error fetching chat history:', error.message);
        res.status(500).json({ error: 'Error fetching chat history', message: error.message });
    }
};