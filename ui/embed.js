// The pure half of the player: reading the iframe page's query string and
// writing the snippets a site pastes. No DOM and no network, so the same file
// runs in the page, in the mixer's panel and under `node --test`.

/** Where the hosted copy of the player lives. */
export const PAGES_BASE = "https://psmux.github.io/godwinmix-hls-player/";

const TRUE_WORDS = new Set(["", "1", "true", "yes", "on"]);
const FALSE_WORDS = new Set(["0", "false", "no", "off"]);

/**
 * A flag from a query string or an attribute. Present with no value means on,
 * which is how `?autoplay` and `<godwinmix-player autoplay>` both read.
 * Anything unrecognised falls back to `fallback` rather than guessing.
 */
export function readFlag(value, fallback = false) {
  if (value === null || value === undefined) return fallback;
  const word = String(value).trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return fallback;
}

/**
 * True for an address the player may load: http or https, nothing else. A
 * `javascript:` or `data:` URL in `?src=` must never reach the video element.
 * A relative path is read against `base` when one is given.
 */
export function safeUrl(value, base) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = base ? new URL(value.trim(), base) : new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * What `player.html?...` was asked to do. `search` is `location.search` or
 * any query string; `base` resolves a relative `src` or `poster`.
 *
 * Returns `{src, autoplay, muted, poster, title, error}`. `error` is a
 * sentence for the viewer when there is nothing playable, and null otherwise.
 */
export function parseParams(search, base) {
  const q = new URLSearchParams(search || "");
  const rawSrc = q.get("src");
  const src = safeUrl(rawSrc, base);
  const autoplay = readFlag(q.get("autoplay"), false);
  // A browser only starts a video by itself when it is muted, so autoplay
  // implies muted unless the page said muted=0 outright.
  const muted = readFlag(q.get("muted"), autoplay);
  const poster = safeUrl(q.get("poster"), base);
  const title = (q.get("title") || "").trim().slice(0, 200);
  let error = null;
  if (!rawSrc) error = "No stream address. Add ?src= and the address of an HLS playlist (.m3u8) to the page address.";
  else if (!src) error = "The stream address is not an http or https URL, so it was not loaded. Check the ?src= part of the page address.";
  return { src, autoplay, muted, poster, title, error };
}

/** The iframe player's address for these options. */
export function playerUrl(opts, base = PAGES_BASE) {
  const url = new URL("player.html", base);
  url.searchParams.set("src", opts.src);
  if (opts.autoplay) url.searchParams.set("autoplay", "1");
  if (opts.muted) url.searchParams.set("muted", "1");
  if (opts.poster) url.searchParams.set("poster", opts.poster);
  if (opts.title) url.searchParams.set("title", opts.title);
  return url.href;
}

/** Text made safe to sit inside a double quoted HTML attribute. */
export function attr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * A CSS width, or null. Accepts `640`, `640px`, `100%`, `40rem` and the like,
 * so a value typed into a box cannot close the style attribute.
 */
export function cssWidth(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return `${text}px`;
  if (/^\d+(\.\d+)?(px|%|rem|em|vw)$/.test(text)) return text;
  return null;
}

/**
 * The iframe snippet: a box that keeps 16:9 at any width, with the player
 * filling it. `opts.width` caps the width; without it the box is as wide as
 * whatever it is put in.
 */
export function iframeSnippet(opts, base = PAGES_BASE) {
  const width = cssWidth(opts.width);
  const label = attr(opts.title || "Live video");
  const frame =
    `<iframe src="${attr(playerUrl(opts, base))}" title="${label}" ` +
    `style="position:absolute;inset:0;width:100%;height:100%;border:0" ` +
    `allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  const box = `<div style="position:relative;width:100%;aspect-ratio:16/9">\n  ${frame}\n</div>`;
  if (!width) return box;
  return `<div style="max-width:${width}">\n${indent(box)}\n</div>`;
}

/** The script tag snippet: the player script once, then the element. */
export function scriptSnippet(opts, base = PAGES_BASE) {
  const script = new URL("player.js", base).href;
  const parts = [`src="${attr(opts.src)}"`];
  if (opts.autoplay) parts.push("autoplay");
  if (opts.muted) parts.push("muted");
  if (opts.poster) parts.push(`poster="${attr(opts.poster)}"`);
  if (opts.title) parts.push(`title="${attr(opts.title)}"`);
  const width = cssWidth(opts.width);
  const style = width ? ` style="max-width:${width}"` : "";
  return (
    `<script src="${attr(script)}" defer></script>\n` +
    `<godwinmix-player ${parts.join(" ")}${style}></godwinmix-player>`
  );
}

function indent(text) {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/**
 * Whether a stream address can be watched from a site on the internet, and
 * if not, the sentence that says why. Pure: reads the address and nothing
 * else.
 */
export function reachability(src) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return { public: false, why: "That is not a full address." };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(host)) {
    return {
      public: false,
      why: `${host} is an address on this network only. A site on the internet cannot reach it: put the stream behind a CDN or make the mixer reachable at a public name.`,
    };
  }
  if (url.protocol !== "https:") {
    return {
      public: false,
      why: "The stream is plain http. A site served over https is not allowed to load it: serve the stream over https.",
    };
  }
  return { public: true, why: null };
}

/** Loopback, link local, the private ranges and .local names. */
export function isPrivateHost(host) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".lan") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return h.includes(":");
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
