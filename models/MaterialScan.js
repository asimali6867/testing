const mongoose = require("mongoose");

const materialScanSchema = new mongoose.Schema(
  {
    mainHeader: {
      type: String,
      required: true,
      default: "Building Materials & Components 🧱",
    },
    subHeader: {
      type: String,
      required: true,
      default: "Building Materials & Components 🧱",
    },
    imageUrl: {
      type: String,
      required: true,
    },

    materialName: {
      type: String,
      default: "",
    },
    materialCategory: {
      type: String,
      default: "",
    },
    materialDescription: {
      type: String,
      default: "",
    },
    applications: {
      type: [String],
      default: "",
    },
    handlingNotes: {
      type: [String],
      default: "",
    },
    environmentalImpact: {
      type: [String],
      default: "",
    },
    manufacturersName: {
      type: [String],
      default: [],
    },
    videosGuide: {
      type: [String],
      default: [],
    },
    specsName: {
      type: [String],
      default: "",
    },
    relatedCourses: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

const MaterialScan = mongoose.model("MaterialScan", materialScanSchema);
module.exports = MaterialScan;
