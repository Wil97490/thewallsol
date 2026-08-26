import { audit } from "./guardrails.js";
import { getState, setState } from "./storage.js";

/* ------------------------------------------------------------------ *
 * OUTBOUND — the two things the site says out loud.
 *
 * Both are deliberately thin. Posts are kept in storage and served by
 * the site itself, so there is no third party in the path of the tape.
 * Email needs a provider: set RESEND_API_KEY and it sends, otherwise it
 * records what it would have sent and says so, rather than pretending.
 * ------------------------------------------------------------------ */

const POSTS_KEY = "tape_posts";
const MAX_POSTS = 200;

export async function publishPost(text) {
  const posts = (await getState(POSTS_KEY)) || [];
  posts.unshift({ at: new Date().toISOString(), text });
  await setState(POSTS_KEY, posts.slice(0, MAX_POSTS));
  await audit("tape", "post_stored", { text });
  return text;
}

export async function recentPosts(limit = 20) {
  const posts = (await getState(POSTS_KEY)) || [];
  return posts.slice(0, limit);
}

export async function sendEmail(to, subject, body) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || "The Wall <wall@example.com>";
  if (!key) {
    await audit("reporter", "email_not_configured", { to, subject });
    return { sent: false, reason: "RESEND_API_KEY not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, text: body }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
    await audit("reporter", "email_sent", { to, subject });
    return { sent: true };
  } catch (err) {
    await audit("reporter", "email_failed", { to, subject, err: String(err.message || err) });
    return { sent: false, reason: String(err.message || err) };
  }
}

export const store = { publishPost, sendEmail };
