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

// CSS/JS sont revalidés à chaque fois (voir plus bas) mais n'avaient
// jusqu'ici aucun validateur à revalider CONTRE — no-cache dégénérait en
// no-store, un retéléchargement complet à chaque requête. L'ETag (hash du
// contenu) rend cette revalidation gratuite quand rien n'a changé, sans
// toucher à la politique no-cache elle-même : un contenu différent produit
// toujours un ETag différent, donc toujours un 200 frais.
//
// Mis en cache en mémoire par chemin de fichier, le conteneur Cloud Run
// étant immuable pendant la durée de vie d'une révision — mais invalidé
// sur changement de mtime, pour que `npm run dev` (qui ne redémarre pas
// sur une simple édition de public/*.css) ne serve jamais un fichier
// modifié sur disque sans le relire.
const validatorCache = new Map();
function staticValidators(full, mtimeMs) {
  const cached = validatorCache.get(full);
  if (cached && cached.mtimeMs === mtimeMs) return cached;
  const hash = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  const entry = { mtimeMs, etag: `"${hash}"`, lastModified: new Date(mtimeMs).toUTCString() };
  validatorCache.set(full, entry);
  return entry;
}
const CONDITIONAL_EXTS = new Set([".css", ".js", ".mjs"]);

/** Serves public/ only. A path that escapes it is a 404, not a file. */
export function serveStatic(req, res, urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/+/, "")) || "index.html";
  const full = path.resolve(PUBLIC_DIR, rel);
  if (!full.startsWith(path.resolve(PUBLIC_DIR) + path.sep) && full !== path.resolve(PUBLIC_DIR, "index.html")) {
    return json(res, 404, { error: "not found" });
  }
  let stat;
  try { stat = fs.statSync(full); } catch { return json(res, 404, { error: "not found" }); }
  if (stat.isDirectory()) return serveStatic(req, res, path.join(rel, "index.html"));

  const type = TYPES[path.extname(full).toLowerCase()] || "application/octet-stream";
  // Le HTML, le JS et le CSS sont revalidés à chaque fois. Sans ça, un
  // déploiement laisse pendant cinq minutes des visiteurs avec un
  // client d'une version et un serveur d'une autre — et les bugs que
  // ça produit ressemblent à des bugs de logique, pas de cache.
  // Les images et les polices, elles, ne changent jamais en silence.
  const ext = path.extname(full).toLowerCase();
  const revalidate = ext === ".html" || ext === ".js" || ext === ".mjs" || ext === ".css";
  // Un média ne change jamais sans changer de nom. Un an au CDN plutôt
  // qu'un jour : la vidéo pèse 250 ko et se retéléchargerait chaque
  // matin pour rien.
  const media = ext === ".mp4" || ext === ".webm" || ext === ".jpg" || ext === ".png" || ext === ".webp";
  const cache = revalidate ? "no-cache"
    : media ? "public, max-age=31536000, immutable"
    : "public, max-age=86400";

  if (CONDITIONAL_EXTS.has(ext)) {
    const { etag, lastModified } = staticValidators(full, stat.mtimeMs);
    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];
    let notModified = false;
    if (ifNoneMatch) {
      notModified = ifNoneMatch === "*" || ifNoneMatch === etag;
    } else if (ifModifiedSince) {
      const since = Date.parse(ifModifiedSince);
      notModified = !Number.isNaN(since) && Math.floor(stat.mtimeMs / 1000) * 1000 <= since;
    }
    if (notModified) {
      res.writeHead(304, { "cache-control": cache, etag, "last-modified": lastModified, ...SECURITY_HEADERS });
      return res.end();
    }
    res.writeHead(200, { "content-type": type, "cache-control": cache, etag, "last-modified": lastModified, ...SECURITY_HEADERS });
    return fs.createReadStream(full).pipe(res);
  }

  res.writeHead(200, { "content-type": type, "cache-control": cache, ...SECURITY_HEADERS });
  fs.createReadStream(full).pipe(res);
}

export function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > limit) { req.destroy(); reject(new Error("body too large")); }
    });
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}

export async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error("body is not JSON"); }
}

/** Constant time, and never true for an unset secret. */
export function secretEquals(provided, expected) {
  if (!expected || typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);              // keep the timing flat anyway
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd) return fwd.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

/* ---- per-instance throttle for public endpoints -------------------- */
const hits = new Map();
export function throttle(key, max, windowMs) {
  const now = Date.now();
  const b = hits.get(key);
  if (!b || now - b.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
  if (b.n >= max) return false;
  b.n += 1;
  if (hits.size > 5000) hits.clear();          // crude, bounded, good enough
  return true;
}

/**
 * Serve a static HTML file with marker substitution.
 *
 * Used by exactly one page, and reluctantly. /terms is a hand-written
 * document and should stay one — moving it into a template would mean
 * maintaining its prose in a JS string. But its publisher block has to
 * come from config, or it drifts from the truth the moment anything
 * changes. So the file keeps its markers and the server fills them.
 *
 * Not cached: the block it renders depends on the environment, not on
 * the file's mtime, so an ETag off the file would be a lie.
 */
export function serveHtml(res, relPath, subs = {}) {
  const full = path.resolve(PUBLIC_DIR, relPath.replace(/^\/+/, ""));
  if (!full.startsWith(path.resolve(PUBLIC_DIR) + path.sep)) {
    return json(res, 404, { error: "not found" });
  }
  let html;
  try { html = fs.readFileSync(full, "utf8"); }
  catch { return json(res, 404, { error: "not found" }); }

  for (const [key, value] of Object.entries(subs)) {
    html = html.split(`<!--${key}-->`).join(value);
  }

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-cache",
    ...SECURITY_HEADERS,
  });
  res.end(html);
}
