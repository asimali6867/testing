const express = require("express");
const serverless = require("serverless-http");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const path = require("path");

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = require("../config/db");
connectDB(); // Make sure your db.js handles reconnect logic well

// Import routes
const scanRoutes = require("../routes/scanRoutes");
const authRoutes = require("../routes/authRoutes");
const healthCheckRouter = require("../routes/health-check");

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Static uploads (if needed)
app.use(
  "/.netlify/functions/api/uploads",
  express.static(path.join(__dirname, "../uploads"))
);

// Routes
app.use("/.netlify/functions/api/api/scan", scanRoutes);
app.use("/.netlify/functions/api/api/auth", authRoutes);
app.use("/.netlify/functions/api/api", healthCheckRouter);

// Export handler
module.exports.handler = serverless(app);
