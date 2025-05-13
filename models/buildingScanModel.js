const mongoose = require("mongoose");

const buildingSchema = new mongoose.Schema({
  // Basic info
  mainHeader: {
    type: String,
    required: true,
    default: "Building Materials & Components🧱",
  },
  subHeader: {
    type: String,
    required: true,
    default: "Building Materials & Components🧱",
  },
  imageUrl: String,

  // Building Data
  cleanedTitle: String,

  buildingType: String,

  description: String,
  keyFeatures: String,
  yearBuilt: String,
  historicalSignificance: String,
  architectDesigner: String,
  buildingMaterialsUsed: String,
  relatedBuildingCodes: String,
  similarFamousBuildings: String,
  specializedCourseUrls: [String],
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("BuildingScan", buildingSchema);
