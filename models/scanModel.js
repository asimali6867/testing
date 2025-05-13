const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema({
  mainHeader: {
    type: String,
    required: true,
    default: "Construction Tools & Equipment🛠️", // Default value if none is provided
  },

  subHeader: {
    type: String,
    required: true,
    default: "Tools & Equipment", // Default value if none is provided
  },

  imageUrl: String,

  // detailedView section
  toolName: String,
  category: String,
  description: String,
  primaryUses: [String],
  skillLevel: String,
  manufacturers: [String],
  safetyGuidelines: String,
  tutorial: String,
  specificationSheet: String,
  certificationCourses: String,
  purchaseRentalOptions: String,
  tutorialUrls: [String],
  specSheetUrls: [String],
  certificationCoursesUrls: [String],
  purchaseRentalUrls: [String],
  found: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Scan", scanSchema);
