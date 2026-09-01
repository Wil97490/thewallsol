import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* ---- small HTTP helpers, kept out of the routing table ------------- */

export const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=()",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export function json(res, code, body) {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...SECURITY_HEADERS });
  res.end(JSON.stringify(body));
}

export function text(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "content-type": type, ...SECURITY_HEADERS });
  res.end(body);
}

/** Serves public/ only. A path that escapes it is a 404, not a file. */
export function serveStatic(res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, "")) || "index.html";
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && full !== path.resolve(PUBLIC_DIR, "index.html")) {
    return json(res, 404, { error: "not found" });
  }
  let stat;
  try { stat = fs.statSync(full); } catch { return json(res, 404, { error: "not found" }); }
  if (stat.isDirectory()) return serveStatic(res, path.join(rel, "index.html"));

  const type = TYPES[path.extname(full).toLowerCase()] || "application/octet-stream";
  const immutable = /\.(css|js|mjs|svg|png|jpg|jpeg|webp|woff2?)$/i.test(full);
  const cache = immutable ? "public, max-age=31536000, immutable" : "public, max-age=86400";
  const headers = { "content-type": type, "cache-control": cache, ...SECURITY_HEADERS };
  res.writeHead(200, headers);
  fs.createReadStream(full).pipe(res);
}
