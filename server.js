// ============================================================
//  WhatsApp Bridge Server — Nmod / PenguinMod <-> WAHA
// ============================================================
//  This server sits between your Scratch extension and a WAHA
//  (WhatsApp HTTP API) instance running in the same Fly.io app.
//  It exposes a simple, stable REST API that the .js extension
//  calls, so if WAHA's own API ever changes, you only update
//  this file — not the extension or people's projects.
// ============================================================

import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import multer from "multer";
import FormData from "form-data";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ---- Config -------------------------------------------------
// WAHA runs on localhost inside the same Fly.io machine (see fly.toml + Dockerfile).
const WAHA_URL = process.env.WAHA_URL || "http://localhost:3000";
const WAHA_SESSION = process.env.WAHA_SESSION || "default";
// Must match WHATSAPP_API_KEY set for the waha process in supervisord.conf
const WAHA_API_KEY = process.env.WAHA_API_KEY || "internal-waha-key-do-not-share";
// Simple shared-secret so random people on the internet can't use your bridge.
const BRIDGE_API_KEY = process.env.BRIDGE_API_KEY || "changeme";

function checkAuth(req, res, next) {
  const key = req.header("x-api-key") || req.query.apikey;
  if (key !== BRIDGE_API_KEY) {
    return res.status(401).json({ ok: false, error: "Invalid or missing API key" });
  }
  next();
}

function toChatId(phone) {
  // Accepts "40712345678" or "+40 712 345 678" -> normalizes to WAHA chatId format
  const digits = String(phone).replace(/[^\d]/g, "");
  return `${digits}@c.us`;
}

// ---- Health / status -----------------------------------------
app.get("/health", (req, res) => res.json({ ok: true }));

async function ensureSession() {
  // Try to start the session; WAHA returns 422 if it already exists, which is fine.
  try {
    await fetch(`${WAHA_URL}/api/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({ name: WAHA_SESSION }),
    });
  } catch (err) {
    // ignore — session may already exist or be starting
  }
}

app.get("/status", checkAuth, async (req, res) => {
  try {
    await ensureSession();
    const r = await fetch(`${WAHA_URL}/api/sessions/${WAHA_SESSION}`, {
      headers: { "X-Api-Key": WAHA_API_KEY },
    });
    const data = await r.json();
    res.json({ ok: true, status: data.status || "UNKNOWN", raw: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/qr", checkAuth, async (req, res) => {
  try {
    await ensureSession();
    const r = await fetch(`${WAHA_URL}/api/${WAHA_SESSION}/auth/qr`, {
      headers: { "X-Api-Key": WAHA_API_KEY },
    });
    const buffer = await r.buffer();
    res.set("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Send text message ----------------------------------------
app.post("/send-text", checkAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ ok: false, error: "phone and message are required" });
  }
  try {
    const r = await fetch(`${WAHA_URL}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({
        session: WAHA_SESSION,
        chatId: toChatId(phone),
        text: message,
      }),
    });
    const data = await r.json();
    res.json({ ok: r.ok, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Send attachment (image, document, etc.) via URL -----------
app.post("/send-file-url", checkAuth, async (req, res) => {
  const { phone, fileUrl, filename, caption } = req.body;
  if (!phone || !fileUrl) {
    return res.status(400).json({ ok: false, error: "phone and fileUrl are required" });
  }
  try {
    const r = await fetch(`${WAHA_URL}/api/sendFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({
        session: WAHA_SESSION,
        chatId: toChatId(phone),
        file: { url: fileUrl, filename: filename || "file" },
        caption: caption || "",
      }),
    });
    const data = await r.json();
    res.json({ ok: r.ok, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---- Send attachment (raw upload from the extension) -----------
app.post("/send-file-upload", checkAuth, upload.single("file"), async (req, res) => {
  const { phone, caption } = req.body;
  if (!phone || !req.file) {
    return res.status(400).json({ ok: false, error: "phone and file are required" });
  }
  try {
    const base64 = req.file.buffer.toString("base64");
    const r = await fetch(`${WAHA_URL}/api/sendFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({
        session: WAHA_SESSION,
        chatId: toChatId(phone),
        file: {
          mimetype: req.file.mimetype,
          filename: req.file.originalname,
          data: base64,
        },
        caption: caption || "",
      }),
    });
    const data = await r.json();
    res.json({ ok: r.ok, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Bridge server listening on port ${PORT}`));
