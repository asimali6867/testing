const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const scanRoutes = require("./routes/scanRoutes");

const authRoutes = require("./routes/authRoutes");
const healthCheckRouter = require("./routes/health-check");
const connectDB = require("./config/db");
const cors = require("cors");
const path = require("path");

dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(cors()); // Enable CORS for frontend communication

// Increase body size limit for base64 image uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/scan", scanRoutes);

//Signup, login routes
app.use("/api/auth", authRoutes);

app.use("/api", healthCheckRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
