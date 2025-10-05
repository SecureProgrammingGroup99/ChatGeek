// backend/routes/fileRoutes.js
const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const {
  handleFileStart,
  handleFileChunk,
  handleFileEnd,
} = require("../controllers/fileControllers");

const router = express.Router();

router.post("/start", protect, handleFileStart);
router.post("/chunk", protect, handleFileChunk);
router.post("/end", protect, handleFileEnd);

module.exports = router;
