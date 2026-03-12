const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/journal_db';
  const MAX_RETRIES = 5;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const conn = await mongoose.connect(uri);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      attempt++;
      console.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
      if (attempt >= MAX_RETRIES) {
        console.error('Could not connect to MongoDB after multiple attempts. Exiting.');
        process.exit(1);
      }
      // Wait before retrying (exponential backoff: 2s, 4s, 8s...)
      await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000));
    }
  }
};

module.exports = connectDB;
