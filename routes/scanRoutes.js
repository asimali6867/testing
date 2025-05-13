const express = require("express");
const router = express.Router();
const { scanImage } = require("../controllers/scanController");

router.post("/", scanImage);

module.exports = router;
