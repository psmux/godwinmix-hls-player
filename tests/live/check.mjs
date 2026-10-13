// The live check: the player against a real GodwinMix watch link, in a real
// headless Chrome or Edge, and the panel in the real mixer page.
//
//   node tests/live/check.mjs --mixer http://127.0.0.1:22801 --channel web-stream \
//       --browser "C:/Program Files/Google/Chrome/Application/chrome.exe" [--offline] [--shots dir]
//
// It needs a running mixer with the channel fed and a watch link on it, and
// this plugin installed in that mixer. tests/live/README.md says how to get
// there. It exits non zero on the first check that fails.

import { launch, open, sleep, stop } from "./cdp.mjs";
import { serve } from "./serve.mjs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const UI = resolve(HERE, "../../ui");

function args() {
  const a = { mixer: "http://127.0.0.1:22801", channel: "web-stream", link: "watch-link", cdp: 22860, serve: 22850, profile: resolve(HERE, "../../.live/chrome") };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, "");
    if (k === "offline") a.offline = true;
    else a[k] = argv[++i];
  }
  if (!a.browser) throw new Error("--browser <path to chrome or msedge> is required");
  return a;
}

const opts = args();
let failed = 0;
function report(ok, what, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${detail ? `: ${detail}` : ""}`);
  if (!ok) failed += 1;
}

/**
 * Switch the watch link off or on with channel.destination.set over the REST
 * layer, the way any client would. Off, the link answers 404 like a stream
 * that is not on air.
 */
async function setLink(enabled) {
  const res = await fetch(`${opts.mixer}/api/v1/channels/${opts.channel}/destination`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ destination: opts.link, enabled }),
  });
  if (!res.ok) throw new Error(`channel.destination.set answered ${res.status}: ${await res.text()}`);
}

async function watchLink() {
  const list = await (await fetch(`${opts.mixer}/api/v1/channels`)).json();
  const ch = list.channels.find((c) => c.id === opts.channel);
  if (!ch) throw new Error(`the mixer has no channel ${opts.channel}`);
  const d = (ch.destinations || []).find((x) => x.id === opts.link && x.playback);
  if (!d) throw new Error(`channel ${opts.channel} has no watch link`);
  return new URL(d.playback.master_url_path, opts.mixer).href;
}

// The player's own numbers, read through its open shadow root.
const READ = (sel) => `(() => {
  const p = ${sel};
  if (!p) return null;
  const v = p.shadowRoot.querySelector('video');
  return { t: v.currentTime, w: v.videoWidth, h: v.videoHeight, paused: v.paused, muted: v.muted,
    state: p.getAttribute('data-state'), text: p.shadowRoot.querySelector('.state').textContent,
    latency: p.shadowRoot.querySelector('.lat').textContent, hls: !!window.Hls };
})()`;

/** Frames are playing when currentTime moves on by most of the time waited. */
async function plays(page, sel, label) {
  try {
    await page.until(`(() => { const r = ${READ(sel)}; return r && r.t > 0.5 && r.state === 'playing'; })()`, 30000, `${label} to start`);
    // Starting at the live edge is a seek; give it a second to settle.
    await sleep(1000);
  } catch (e) {
    report(false, `${label} plays`, `${e.message}; ${JSON.stringify(await page.eval(READ(sel)))} ${page.logs.slice(-3).join(" | ")}`);
    return null;
  }
  const a = await page.eval(READ(sel));
  await sleep(6000);
  const b = await page.eval(READ(sel));
  const moved = b.t - a.t;
  report(moved > 4, `${label} plays`, `currentTime ${a.t.toFixed(2)} -> ${b.t.toFixed(2)} in 6 s, ${b.w}x${b.h}, state ${b.state}, delay ${b.latency}, hls.js ${b.hls}`);
  return b;
}

async function key(page, k, code) {
  for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: k, code, text: type === "keyDown" && k.length === 1 ? k : undefined });
}

async function playerChecks(src) {
  const base = `http://127.0.0.1:${opts.serve}/`;
  const iframeUrl = `${base}player.html?src=${encodeURIComponent(src)}&autoplay=1&muted=1&title=${encodeURIComponent("Web stream")}`;
  const page = await open(opts.cdp, iframeUrl);
  const sel = "document.querySelector('godwinmix-player')";
  const got = await plays(page, sel, "player.html from another origin");
  if (got) {
    report(got.w === 1280 && got.h === 720, "the picture is the programme's size", `${got.w}x${got.h}`);
    report(got.state === "playing" && /\d+\.\d s/.test(got.latency), "the latency readout shows a delay", got.latency);
    await page.eval(`${sel}.focus()`);
    await key(page, "m", "KeyM");
    report((await page.eval(READ(sel))).muted === false, "M unmutes from the keyboard");
    await key(page, "k", "KeyK");
    await sleep(500);
    report((await page.eval(READ(sel))).paused === true, "K pauses from the keyboard");
    await key(page, "l", "KeyL");
    await sleep(3000);
    const live = await page.eval(READ(sel));
    report(!live.paused && live.state === "playing", "L goes back to live and plays", `state ${live.state}`);
  }
  if (opts.offline && got) await offlineCheck(page, sel);
  if (opts.shots) await page.shot(join(opts.shots, "player.png"));
  await page.close();

  const embed = await open(opts.cdp, `${base}embed-test.html`);
  await plays(embed, "document.getElementById('p')", "the script tag embed");
  if (opts.shots) await embed.shot(join(opts.shots, "embed.png"));
  await embed.close();

  // The mixer's own copy, under its Content-Security-Policy, which is what
  // the panel's Open the player link uses for a link on this network only.
  const own = await open(opts.cdp, `${opts.mixer}/plugins/hls-player/ui/player.html?autoplay=1&src=${encodeURIComponent(new URL(src).pathname + new URL(src).search)}`);
  await plays(own, "document.querySelector('godwinmix-player')", "the mixer's own copy of player.html");
  await own.close();

  const bad = await open(opts.cdp, `${base}player.html?src=${encodeURIComponent("javascript:alert(1)")}`);
  const said = await bad.until(`document.querySelector('.problem') && document.querySelector('.problem').textContent`, 10000);
  report(/not an http or https URL/.test(said), "a script URL in src is refused with a sentence", said);
  await bad.close();
}

/** The stream goes off the air and comes back; the player has to say so and recover. */
async function offlineCheck(page, sel) {
  await setLink(false);
  let seen = "";
  try {
    seen = await page.until(`(() => { const r = ${READ(sel)}; return r && /Offline|Reconnecting/.test(r.text) ? r.text : ""; })()`, 60000, "the offline state");
    report(true, "a stream gone off the air shows as offline or reconnecting", seen);
  } catch (e) {
    report(false, "a stream gone off the air shows as offline or reconnecting", e.message);
  }
  if (opts.shots) await page.shot(join(opts.shots, "offline.png"));
  await setLink(true);
  try {
    await page.until(`(() => { const r = ${READ(sel)}; return r && r.state === 'playing'; })()`, 90000, "playing again");
    // A link that has just come back has one or two segments; let it fill.
    await sleep(4000);
    const a = await page.eval(READ(sel));
    await sleep(6000);
    const b = await page.eval(READ(sel));
    report(b.t - a.t > 4, "it plays again by itself once the stream is back", `currentTime ${a.t.toFixed(1)} -> ${b.t.toFixed(1)} in 6 s, state ${b.state}`);
  } catch (e) {
    report(false, "it plays again by itself once the stream is back", e.message);
  }
}

async function panelCheck() {
  const page = await open(opts.cdp, `${opts.mixer}/`, { width: 1600, height: 1000 });
  try {
    await page.until(`customElements.get('gmx-hls-player-embed')`, 20000, "the panel to register");
    report(true, "the plugin's panel registered in the mixer page");
  } catch (e) {
    report(false, "the plugin's panel registered in the mixer page", e.message);
    await page.close();
    return;
  }
  await page.until(`[...document.querySelectorAll('[role=tab]')].find(t => t.textContent.trim() === 'HLS Player')`, 10000, "the panel's tab");
  await page.eval(`[...document.querySelectorAll('[role=tab]')].find(t => t.textContent.trim() === 'HLS Player').click()`);
  const name = await page.until(`(() => { const e = document.querySelector('gmx-hls-player-embed .hlsp-card:not([hidden]) strong'); return e && e.textContent; })()`, 15000, "a watch link in the panel");
  report(!!name, "the panel lists the channel's watch link", name);
  const code = await page.eval(`document.querySelector('gmx-hls-player-embed .hlsp-code').value`);
  report(code.includes("player.html?src=") && code.includes(encodeURIComponent(`/hls/channel/${opts.channel}/`)), "the iframe code names the watch link", code.split("\n")[1]?.slice(0, 120));
  await page.eval(`[...document.querySelectorAll('gmx-hls-player-embed button')].find(b => b.textContent === 'Preview').click()`);
  await plays(page, "document.querySelector('gmx-hls-player-embed godwinmix-player')", "the panel's preview");
  if (opts.shots) await page.shot(join(opts.shots, "panel-in-mixer.png"));
  report(page.failures.length === 0, "the mixer page had no failed requests", page.failures.slice(0, 3).join(" | "));
  await page.close();
}

const browser = launch(opts.browser, opts.cdp, opts.profile);
let server = null;
try {
  if (opts.shots) mkdirSync(opts.shots, { recursive: true });
  const src = await watchLink();
  console.log(`watch link: ${src}`);
  server = await serve(UI, Number(opts.serve), src);
  await playerChecks(src);
  await panelCheck();
} catch (e) {
  report(false, "the live check ran", e.stack || e.message);
} finally {
  if (server) server.close();
  stop(browser);
}
console.log(failed ? `${failed} check(s) failed` : "every live check passed");
process.exit(failed ? 1 : 0);
