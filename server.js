// import express from 'express';
// import dotenv from 'dotenv';
// import cors from 'cors';
// import connectDB from './conifg/database.js';
// import chatRoutes from './route/chat.ROutes.js';
// import authRoutes from './route/auth.Routes.js';

// dotenv.config();
// connectDB();

// const app = express();


// app.use(cors());
// app.use(express.json());


// app.use('/api', chatRoutes);
// app.use('/api/auth', authRoutes);


// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));






import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import mongoose from 'mongoose';


import authRoutes from './route/auth.Routes.js';
import artworkRoutes from './route/artwork.Routes.js';
// import customerRoutes from './route/customerRoutes.js';
import eventRoutes from './route/event.Routes.js';
import profileRoutes from './route/profile.Routes.js';
import settingsRoutes from './route/setting.Routes.js';
// import paymentRoutes from './route/payment.Routes.js';
// import chatLogRoutes from './route/chatRoutes.js';
import diaryEntryRoutes from './route/dailylogs.Routes.js';
// 
// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error(err.message);
    process.exit(1); // Exit process with failure
  }
};
connectDB();

const app = express();


app.use(cors({
  origin: 'http://localhost:3000', // <-- set your frontend URL here
  credentials: true,               // <-- allow cookies to be sent
})); 
app.use(express.json()); 



//Routes
app.use('/api/auth', authRoutes); 
app.use('/api/artworks', artworkRoutes);
// app.use('/api/customers', customerRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/settings', settingsRoutes);
// app.use('/api/payments', paymentRoutes); 
// app.use('/api/chatlogs', chatLogRoutes); 
app.use('/api/diary', diaryEntryRoutes);


app.get('/', (req, res) => {
  res.send('API is running...');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));