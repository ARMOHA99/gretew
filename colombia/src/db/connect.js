const mongoose = require("mongoose");

async function connectDB() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(process.env.MONGODB_URI || require("../../config/env").MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log("[db] MongoDB connected");
}

module.exports = { connectDB };
