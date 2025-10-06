require("dotenv").config();

function warnMissing(name) {
  console.warn(`[SOCP] Warning: Missing env ${name}`);
}

function get(name, fallback = undefined) {
  const v = process.env[name];
  if (v == null || v === "") {
    if (fallback === undefined) warnMissing(name);
    return fallback;
  }
  return v;
}

function toInt(name, fallback) {
  const raw = get(name, String(fallback));
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntroducers() {
  const raw = get("INTRODUCERS_JSON", "[]");
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    console.warn("[SOCP] INTRODUCERS_JSON is not valid JSON, using []");
    return [];
  }
}

function toBool(name, fallback = false) {
  const v = (process.env[name] || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  if (v === "0" || v === "false" || v === "no") return false;
  return fallback;
}

module.exports = {
  SERVER_ID: get("SERVER_ID"),
  SERVER_PRIVATE_KEY_B64URL: get("SERVER_PRIVATE_KEY_B64URL"),
  SERVER_PUBLIC_KEY_B64URL: get("SERVER_PUBLIC_KEY_B64URL"),
  SERVER_HOST: get("SERVER_HOST", "127.0.0.1"),

  HEARTBEAT_MS: toInt("HEARTBEAT_MS", 15000),
  PEER_DEAD_MS: toInt("PEER_DEAD_MS", 45000),

  MESH_WS_PORT: toInt("MESH_WS_PORT", 7081),

  MAX_WS_PAYLOAD_BYTES: toInt("MAX_WS_PAYLOAD_BYTES", 1024 * 1024), // 1MB default
  DEV_ALLOW_DUMMY_KEYS: toBool("SOCP_DEV_ALLOW_DUMMY_KEYS", true), // let "dummy" pass in dev

  INTRODUCERS: parseIntroducers(),
};
