// backend/models/fileTransferModel.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const FileTransferSchema = new Schema({
  file_id: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  mode: { type: String, enum: ["dm", "group"], default: "dm" },
  group_id: { type: String, default: null },
  name: String,
  size: Number,
  sha256: String,
  expected_chunks: Number,
  chunk_size: Number,
  // received stores 'index' => true
  received: { type: Map, of: Boolean, default: {} },
  temp_dir: String,
  created_at: { type: Date, default: Date.now },
  last_activity: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["in_progress", "complete", "failed", "timed_out"],
    default: "in_progress",
  },
});

module.exports = mongoose.model("FileTransfer", FileTransferSchema);
