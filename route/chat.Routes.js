import express from 'express';
import { handleChat, getChatHistory } from '../controller/chat.Controller.js';
import { verifyInstagramToken } from '../middleware/verifyInstagramToken.js';

const router = express.Router();

router.post('/chat', verifyInstagramToken, handleChat);
router.get('/chat', getChatHistory); 

export default router;
