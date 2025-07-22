import axios from 'axios';

export const verifyInstagramToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];

        const response = await axios.get(`https://graph.instagram.com/me`, {
            params: {
                fields: 'id,username',
                access_token: token
            }
        });

        const { id, username } = response.data;

        if (!id) {
            return res.status(401).json({ error: 'Invalid Instagram Token' });
        }

        req.igid = id;
        req.igUsername = username;

        next();

    } catch (error) {
        console.error('Instagram Token Verification Error:', error.message);
        return res.status(401).json({ error: 'Invalid or Expired Instagram Token' });
    }
};


