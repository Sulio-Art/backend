import axios from 'axios';

export const callChatbot = async (query, igid, task) => {
    const { data } = await axios.get('http://localhost:8888/setup-chatbot', {
        headers: {
            'Content-Type': 'application/json'
        },
        data: { query, igid, task }
    });
    return data;
};
