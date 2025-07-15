import mongoose from 'mongoose';
import dotenv from 'dotenv';

if (!process.env.MONGO_URI) {
  dotenv.config({ path: './.env' }); 
}

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
;

    if (!mongoURI) {
      throw new Error('MONGO_URI environment variable not set.');
    }

    await mongoose.connect(mongoURI);
    console.log(' Connected to MongoDB');
  
    const { host, port, name } = mongoose.connection;
    console.log(`MongoDB running at ${host}:${port} / DB: ${name}`);
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1); 
  }
};

process.on('SIGINT', async () => {
  await mongoose.disconnect();
  console.log('🔌 MongoDB connection closed');
  process.exit(0);
});



export default connectDB;