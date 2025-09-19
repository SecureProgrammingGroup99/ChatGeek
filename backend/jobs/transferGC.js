// backend/jobs/transferGC.js
// Garbage Collection
const FileTransfer = require("../models/fileTransferModel");
const fs = require("fs-extra"); // optionally install fs-extra: npm i fs-extra

const STALE_MS = 60 * 1000; // 60s threshold. This is modifiable, we can change as we need.
const GC_INTERVAL = 60 * 1000; // run every minute

async function runGC() {
  try {
    const cutoff = new Date(Date.now() - STALE_MS);
    const stale = await FileTransfer.find({
      status: "in_progress",
      last_activity: { $lt: cutoff },
    }).exec();
    for (const rec of stale) {
      console.log("GC cleaning stale transfer", rec.file_id);
      try {
        await fs.remove(rec.temp_dir);
      } catch (e) {
        console.warn("failed remove temp_dir", e);
      }
      rec.status = "timed_out";
      await rec.save();
    }
  } catch (e) {
    console.error("transferGC error", e);
  }
}

setInterval(runGC, GC_INTERVAL);
module.exports = { runGC };
