import https from "node:https";
import http from "node:http";
import dns from "node:dns";
import net from "node:net";

/* ------------------------------------------------------------------ *
 * SAFE OUTBOUND FETCH
 *
 * The destination link is supplied by the buyer, and we fetch it from
 * inside our own network. That is a server-side request forgery hole by
 * construction: a link pointing at 169.254.169.254 asks our metadata
 * server for a service-account token on the buyer's behalf.
 *
 * So: we resolve the host ourselves, refuse every private range, and
 * hand the vetted IP to the connection through a custom `lookup`. The
 * IP that was checked is the IP that gets dialled — no DNS rebinding
 * window between the check and the connect. Every redirect hop repeats
 * the whole check.
 * ------------------------------------------------------------------ */

const BLOCKED_V4 = [
  [0, 8],          // 0.0.0.0/8      this network
  [10, 8],         // 10/8           private
  [100, 10, 64],   // 100.64/10      CGNAT
  [127, 8],        // 127/8          loopback
  [169, 16, 254],  // 169.254/16     link-local + cloud metadata
  [172, 12, 16],   // 172.16/12      private
  [192, 16, 168],  // 192.168/16     private
  [198, 15, 18],   // 198.18/15      benchmarking
  [224, 4],        // 224/4          multicast
  [240, 4],        // 240/4          reserved
];

export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    for (const [a, bits, b] of BLOCKED_V4) {
      if (bits <= 8) { if (p[0] === a) return true; continue; }
      if (bits === 10 && p[0] === a && (p[1] & 0xc0) === b) return true;
      if (bits === 12 && p[0] === a && (p[1] & 0xf0) === b) return true;
      if (bits === 15 && p[0] === a && (p[1] & 0xfe) === b) return true;
      if (bits === 16 && p[0] === a && p[1] === b) return true;
      if (bits === 4 && (p[0] & 0xf0) === (a & 0xf0)) return true;
    }
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
    if (s === "::" || s === "::1") return true;
    if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true; // fe80::/10
    if (s.startsWith("fc") || s.startsWith("fd")) return true;   // unique local
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true; // not an IP at all → refuse
}

/**
 * Resolve a hostname to one vetted public address, IPv4 first.
 *
 * IPv4 first is not cosmetic: Cloud Run has no IPv6 egress. Hand it the
 * AAAA record of a host that publishes both and the connection hangs
 * until it times out — the link then reports "no response", the gate
 * refuses the entry, and nothing anywhere tells you the internet was
 * never the problem.
 */
function resolvePublic(hostname) {
  return new Promise((resolve, reject) => {
    if (net.isIP(hostname)) {
      if (isPrivateAddress(hostname)) return reject(new UnsafeUrlError("private_address"));
      return resolve(hostname);
    }
    dns.lookup(hostname, { all: true }, (err, addresses) => {
      if (err) return reject(err);
      const list = Array.isArray(addresses) ? addresses : [addresses];
      const usable = list.filter((a) => a && typeof a.address === "string" && !isPrivateAddress(a.address));
      if (!usable.length) return reject(new UnsafeUrlError("private_address"));
      const pick = usable.find((a) => a.family === 4) || usable[0];
      resolve(pick.address);
    });
  });
}

export class UnsafeUrlError extends Error {}

/** Structural check before any packet leaves. */
export function vetUrl(raw, { allowHttp = false } = {}) {
  let u;
  try { u = new URL(raw); } catch { throw new UnsafeUrlError("malformed"); }
  if (u.protocol !== "https:" && !(allowHttp && u.protocol === "http:")) throw new UnsafeUrlError("not_https");
  if (u.username || u.password) throw new UnsafeUrlError("credentials_in_url");
  const port = u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : 80);
  if (port !== 443 && port !== 80) throw new UnsafeUrlError("nonstandard_port");
  if (net.isIP(u.hostname) && isPrivateAddress(u.hostname)) throw new UnsafeUrlError("private_address");
  if (u.hostname === "localhost" || u.hostname.endsWith(".localhost") || u.hostname.endsWith(".internal")) {
    throw new UnsafeUrlError("internal_hostname");
  }
  return u;
}

/**
 * Deux URL vivent-elles chez le même opérateur ?
 *
 * Existe parce qu'un lien qui part de `https://c4t.cat` et arrive sur
 * `https://c4t.cat/` a été publié comme « The link redirects before it
 * lands (ends at c4t.cat) » — une phrase qui, lue par la personne dont
 * c'est le site, ne peut produire qu'une réaction : ces gens ne savent
 * pas ce qu'ils mesurent.
 *
 * http → https, apex → www, apex → sous-domaine : c'est le même
 * opérateur, et ce n'est pas un constat sur l'endroit où le lien
 * atterrit. Un saut vers un AUTRE domaine, si.
 *
 * Échoue fermé : une URL illisible n'est pas déclarée « même site ».
 */
export function sameSite(a, b) {
  try {
    const h = (u) => new URL(u).hostname.replace(/^www\./i, "").toLowerCase();
    const ha = h(a), hb = h(b);
    if (!ha || !hb) return false;
    return ha === hb || ha.endsWith("." + hb) || hb.endsWith("." + ha);
  } catch { return false; }
}

/**
 * GET a buyer-supplied URL. Returns { status, finalUrl, hops }.
 * Never throws for a normal HTTP failure — only for an unsafe target.
 */
export function safeGet(raw, { timeoutMs = 1500, maxRedirects = 3, maxBytes = 65536, allowHttp = false } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let hops = 0;

    const go = async (target) => {
      let u;
      try { u = vetUrl(target, { allowHttp }); }
      catch (e) { return reject(e); }

      const left = timeoutMs - (Date.now() - started);
      if (left <= 0) return reject(new Error("link check timed out"));

      /* Dial the address we checked, not the name. The IP is pinned for
       * this connection, so there is no window between the check and the
       * connect for DNS to change its mind — and TLS still validates the
       * certificate against the real hostname through servername. */
      let ip;
      try { ip = await resolvePublic(u.hostname); }
      catch (e) { return reject(e); }

      const isHttps = u.protocol === "https:";
      const lib = isHttps ? https : http;
      const port = u.port ? Number(u.port) : (isHttps ? 443 : 80);

      const req = lib.request(
        {
          host: ip,
          port,
          path: u.pathname + u.search,
          method: "GET",
          ...(isHttps ? { servername: u.hostname } : {}),
          headers: {
            host: u.host,
            "user-agent": "thewall-linkcheck/1.0 (+link verification)",
            accept: "*/*",
          },
          timeout: left,
        },
        (res) => {
          const code = res.statusCode || 0;
          const loc = res.headers.location;
          if (code >= 300 && code < 400 && loc) {
            res.resume();
            if (hops >= maxRedirects) return resolve({ status: 0, finalUrl: u.href, hops, note: "too_many_redirects" });
            hops += 1;
            let next;
            try { next = new URL(loc, u).href; } catch { return resolve({ status: 0, finalUrl: u.href, hops, note: "bad_redirect" }); }
            return go(next);
          }
          let seen = 0;
          res.on("data", (c) => { seen += c.length; if (seen > maxBytes) req.destroy(); });
          res.on("end", () => resolve({ status: code, finalUrl: u.href, hops }));
          res.on("error", () => resolve({ status: code, finalUrl: u.href, hops }));
        }
      );
      req.on("timeout", () => req.destroy(new Error("link check timed out")));
      req.on("error", (e) => reject(e));
      req.end();
    };

    go(raw);
  });
}
