# Details of things added

## 1- Backend server

Want the backend to:
* Listen for FILE_START, FILE_CHUNK, FILE_END over existing WS/socket layer.
* Validate sig (transport signature) if present.
* Create and persist a transfer record (metadata only).
* Store raw chunk bytes on disk under /tmp/transfers/<file_id>/.
* Deduplicate chunks and forward messages to remote servers if recipient is remote.

On FILE_END, check completeness and update status.
1. `backend/server.js`
* the entrypoint, already handling socket io / WebSocket events.
* What to do:
    Add new socket event listeners for:

    FILE_START

    FILE_CHUNK

    FILE_END

    Each should forward work to a new controller (fileTransferController.js).

2. `backend/controllers/fileTransferController.js`
Why: Keep logic clean and separate.

What to do:
* Implement the server’s responsibilities:
    * Validate sig (if present).
    * Validate file_id uniqueness.
    * Create transfer record (store metadata in DB + temp storage path).* On FILE_CHUNK: validate, deduplicate, store chunk to /tmp/transfers/<file_id>/.
    * On FILE_END: check all chunks received, update status, forward notification.
    * Handle timeout / cleanup.
* This does not decrypt chunks, only store and forward.

3. `backend/models/fileTransferModel.js` 
Why: Track transfer state in MongoDB.
Schema Example:
```js
const mongoose = require('mongoose');

const fileTransferSchema = new mongoose.Schema({
  file_id: { type: String, unique: true },
  from: String,
  to: String,
  mode: { type: String, enum: ['dm', 'group'] },
  group_id: String,
  name: String,
  size: Number,
  sha256: String,
  expected_chunks: Number,
  received: { type: Map, of: Boolean }, 
  temp_dir: String,
  status: { type: String, enum: ['in_progress', 'complete', 'failed', 'timed_out'] },
  created_at: { type: Date, default: Date.now },
  last_activity: Date
});

module.exports = mongoose.model('FileTransfer', fileTransferSchema);
```

4. Storage
* Temp directory: /tmp/transfers/<file_id>/ for chunks.
* Cleanup: add a periodic cleanup script or middleware for timeout transfers.

5. Add background GC job: `backend/jobs/transferGC.js`
Create a tiny periodic janitor that marks stale transfers timed out and cleans temp dirs.

6. Add helper for verifying transport signatures: `backend/utils/cryptoHelpers.js`
This only verifies sig on envelopes. It does not decrypt payloads.