// The HLS Player panel: the mixer's watch links, a preview of each in the
// same player a website gets, and the code to put it on a page.
//
// It reads `channel.list` and listens for `channel.*` events through the
// client the shell hands it, the same public protocol any other client uses.
// Nothing is polled, and a preview plays only while someone asked for one.

import { PAGES_BASE } from "./embed.js";
import { watchLinks, channelsWithoutLink, lanBase } from "./links.js";
import { h, linkCard } from "./panel-card.js";

const HERE = new URL(".", import.meta.url).href;
const STORE = "hls-player.options";

function loadPlayerScript() {
  if (customElements.get("godwinmix-player")) return;
  if (document.querySelector("script[data-hls-player]")) return;
  const tag = document.createElement("script");
  tag.src = new URL("player.js", HERE).href;
  tag.dataset.hlsPlayer = "";
  document.head.appendChild(tag);
}

function savedOptions() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}");
  } catch {
    return {};
  }
}

class HlsPlayerPanel extends HTMLElement {
  static get panel() {
    return { id: "hls-player/embed", title: "HLS Player", slots: ["main", "sidebar"] };
  }

  setClient(client) {
    this.client = client;
  }

  connectedCallback() {
    loadPlayerScript();
    this.cards = new Map();
    this.answer = null;
    this.build();
    const c = this.client;
    this.offs = [];
    if (c.listen) this.offs.push(c.listen("channel.*"));
    if (c.on) {
      this.offs.push(c.on("event", (e) => this.event(e)));
      this.offs.push(c.on("open", () => this.load()));
    }
    this.load();
  }

  disconnectedCallback() {
    for (const off of this.offs || []) if (typeof off === "function") off();
    for (const card of this.cards.values()) card.stop();
    clearTimeout(this.later);
  }

  event({ name } = {}) {
    if (name !== "channel.changed" && name !== "channel.removed") return;
    // A burst of changes (a stream going live touches every destination)
    // is read once.
    clearTimeout(this.later);
    this.later = setTimeout(() => this.load(), 400);
  }

  async load() {
    try {
      this.answer = await this.client.call("channel.list", {});
      this.problem.hidden = true;
    } catch (e) {
      this.answer = null;
      this.problem.hidden = false;
      this.problem.textContent =
        e && e.code === -32601
          ? "This mixer has no channels: install the ingest plugin from the Plugins page, then make a channel with a watch link."
          : `Could not read the channels: ${(e && e.message) || e}`;
    }
    this.draw();
  }

  options() {
    const f = this.form;
    return {
      autoplay: f.autoplay.checked,
      muted: f.muted.checked,
      poster: f.poster.value.trim(),
      width: f.width.value.trim(),
      title: f.title.value.trim(),
      publicBase: f.publicBase.value.trim() || this.lan,
      playerBase: f.playerBase.value.trim() || PAGES_BASE,
    };
  }

  remember() {
    const o = this.options();
    const keep = { autoplay: o.autoplay, muted: o.muted, poster: o.poster, width: o.width, title: o.title };
    keep.publicBase = this.form.publicBase.value.trim();
    keep.playerBase = this.form.playerBase.value.trim();
    try {
      localStorage.setItem(STORE, JSON.stringify(keep));
    } catch {
      /* private mode: the options last as long as the page */
    }
    for (const card of this.cards.values()) card.update({});
  }

  draw() {
    this.lan = lanBase(location.origin, this.answer);
    this.form.publicBase.placeholder = this.lan;
    const links = watchLinks(this.answer);
    const seen = new Set();
    for (const link of links) {
      seen.add(link.key);
      let card = this.cards.get(link.key);
      if (!card) {
        card = linkCard(link, { localBase: location.origin + "/", options: () => this.options(), onPreview: (c) => this.only(c) });
        this.cards.set(link.key, card);
      }
      card.update(link);
      card.node.hidden = !link.path;
      this.list.append(card.node);
    }
    for (const [key, card] of this.cards) {
      if (seen.has(key)) continue;
      card.stop();
      card.node.remove();
      this.cards.delete(key);
    }
    this.drawWaiting(links.filter((l) => !l.path));
    this.drawMissing(channelsWithoutLink(this.answer));
  }

  /** One preview at a time: a second one would double what the page decodes. */
  only(keep) {
    for (const card of this.cards.values()) if (card !== keep) card.stop();
  }

  drawWaiting(waiting) {
    this.waiting.replaceChildren(
      ...waiting.map((l) => h("p", { class: "hlsp-note", text: `${l.name}: the watch link appears once the channel is live (${l.error || l.state || "waiting"}).` })),
    );
  }

  drawMissing(channels) {
    const rows = channels.map((ch) => {
      const make = h("button", { class: "btn", type: "button", text: "Make a watch link" });
      make.addEventListener("click", () => this.makeLink(ch, make));
      return h("div", { class: "row" }, [h("span", { class: "grow ellipsis", text: ch.name }), make]);
    });
    this.missing.replaceChildren(...rows);
    this.missingBox.hidden = !rows.length;
    this.empty.hidden = !!(this.answer && watchLinks(this.answer).length) || !this.answer;
  }

  async makeLink(ch, button) {
    button.disabled = true;
    try {
      await this.client.call("channel.destination.add", { id: ch.id, platform: "hls" });
      await this.load();
    } catch (e) {
      button.disabled = false;
      button.textContent = "Try again";
      this.problem.hidden = false;
      this.problem.textContent = (e && e.message) || String(e);
    }
  }

  build() {
    const saved = savedOptions();
    const field = (name, label, props) => {
      const input = h("input", Object.assign({ name, id: `hlsp-${name}` }, props));
      return [input, h("label", { for: `hlsp-${name}`, text: label })];
    };
    const [autoplay, autoplayLabel] = field("autoplay", "Start playing by itself", { type: "checkbox" });
    const [muted, mutedLabel] = field("muted", "Start muted", { type: "checkbox" });
    const [poster, posterLabel] = field("poster", "Poster image address", { type: "url", placeholder: "https://example.com/poster.jpg" });
    const [width, widthLabel] = field("width", "Width", { type: "text", placeholder: "100% (or 640)" });
    const [title, titleLabel] = field("title", "Title", { type: "text", placeholder: "the channel's name" });
    const [publicBase, publicLabel] = field("publicBase", "Public address of this mixer", { type: "url" });
    const [playerBase, playerLabel] = field("playerBase", "Player address", { type: "url", placeholder: PAGES_BASE });
    autoplay.checked = saved.autoplay !== false;
    muted.checked = saved.muted !== false;
    for (const [input, key] of [[poster, "poster"], [width, "width"], [title, "title"], [publicBase, "publicBase"], [playerBase, "playerBase"]]) input.value = saved[key] || "";
    this.form = { autoplay, muted, poster, width, title, publicBase, playerBase };
    for (const input of Object.values(this.form)) input.addEventListener("input", () => this.remember());

    this.problem = h("p", { class: "hlsp-note hlsp-warn", role: "alert", hidden: true });
    this.list = h("div", { class: "hlsp-list" });
    this.waiting = h("div");
    this.empty = h("p", { class: "hlsp-note", hidden: true, text: "No channel has a watch link yet. Make one below, or on the Channels tab with Watch link." });
    this.missing = h("div", { class: "col" });
    this.missingBox = h("div", { class: "hlsp-missing", hidden: true }, [h("div", { class: "hlsp-label", text: "Channels with no watch link" }), this.missing]);
    const options = h("details", { class: "hlsp-options", open: true }, [
      h("summary", { text: "Embed options" }),
      h("div", { class: "hlsp-grid" }, [
        h("div", { class: "row" }, [autoplay, autoplayLabel]),
        h("div", { class: "row" }, [muted, mutedLabel]),
        posterLabel, poster, widthLabel, width, titleLabel, title, publicLabel, publicBase, playerLabel, playerBase,
      ]),
    ]);
    this.replaceChildren(
      h("style", { text: STYLE }),
      h("div", { class: "hlsp pad col" }, [
        h("p", { class: "hlsp-note", text: "Put any channel's watch link on a website. Preview it here, then copy the iframe or the script tag." }),
        publicNote(),
        options,
        this.problem,
        this.empty,
        this.list,
        this.waiting,
        this.missingBox,
      ]),
    );
  }
}

function publicNote() {
  return h("details", { class: "hlsp-public" }, [
    h("summary", { text: "Before you put it on a public site" }),
    h("p", {
      text:
        "A viewer's browser fetches the stream itself, so it needs an address it can reach. A site outside this network needs the stream at a public https address: a CDN in front of the mixer, or the mixer reachable from the internet behind a reverse proxy with a certificate. Type that address in Public address of this mixer and the code below follows.",
    }),
    h("p", {
      text:
        "The player on another site loads the stream across origins, so the stream has to send an Access-Control-Allow-Origin header. This mixer sends one on its watch links. A CDN or proxy in front of it has to keep that header.",
    }),
  ]);
}

const STYLE = `
.hlsp { gap: 10px; }
.hlsp-note { margin: 0; opacity: .8; font-size: .92em; }
.hlsp-warn { color: var(--warn, #e0a030); opacity: 1; }
.hlsp-card { border: 1px solid var(--line, #8884); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.hlsp-head { gap: 8px; align-items: center; }
.hlsp-state { font-size: .85em; opacity: .8; }
.hlsp-state[data-state="live"] { color: var(--live, #e53935); opacity: 1; font-weight: 600; }
.hlsp-stage godwinmix-player { border-radius: 6px; }
.hlsp-label { font-size: .8em; text-transform: uppercase; letter-spacing: .04em; opacity: .7; margin-top: 4px; }
.hlsp-url { word-break: break-all; font-size: .85em; flex: 1; min-width: 12em; }
.hlsp-wrap { flex-wrap: wrap; gap: 6px; align-items: center; }
.hlsp-code { width: 100%; box-sizing: border-box; font: 12px/1.4 ui-monospace, Consolas, monospace; resize: vertical; background: var(--bg2, #0002); color: inherit; border: 1px solid var(--line, #8884); border-radius: 4px; padding: 6px; }
.hlsp-grid { display: grid; grid-template-columns: max-content 1fr; gap: 6px 10px; align-items: center; margin-top: 6px; }
.hlsp-grid > .row { grid-column: 1 / -1; gap: 6px; }
.hlsp-grid input[type=url], .hlsp-grid input[type=text] { min-width: 0; }
.hlsp-public p { margin: 6px 0; font-size: .92em; }
.hlsp summary { cursor: pointer; font-weight: 600; }
`;

customElements.define("gmx-hls-player-embed", HlsPlayerPanel);
window.godwinmixPanels = window.godwinmixPanels || [];
window.godwinmixPanels.push(HlsPlayerPanel);
