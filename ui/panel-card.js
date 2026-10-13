// One watch link in the panel: the preview, the options and the two
// snippets with their Copy buttons. Built from plain DOM so the panel needs
// nothing from the shell beyond the client it is handed.

import { iframeSnippet, scriptSnippet, playerUrl, reachability } from "./embed.js";

export function h(tag, props = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid !== null && kid !== undefined) node.append(kid);
  return node;
}

/** Copy text, with the textarea selected as a fallback for an http page. */
export async function copyText(text, area) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!area || !area.select) return false;
    area.focus();
    area.select();
    return document.execCommand && document.execCommand("copy");
  }
}

function copyButton(label, area) {
  const button = h("button", { class: "btn", type: "button", text: label });
  button.addEventListener("click", async () => {
    const ok = await copyText(area.value, area);
    button.textContent = ok ? "Copied" : "Select and copy by hand";
    setTimeout(() => (button.textContent = label), 1600);
  });
  return button;
}

/**
 * A card for `link` ({channel, name, destination, path, state, error}).
 * `env` is {localBase, playerHere, options(), onPreview(card)}; `options()` answers the
 * shared form's values at the moment of drawing.
 */
export function linkCard(link, env) {
  const iframeArea = h("textarea", { class: "hlsp-code", rows: "5", readonly: true, spellcheck: "false", "aria-label": `Iframe code for ${link.name}` });
  const scriptArea = h("textarea", { class: "hlsp-code", rows: "3", readonly: true, spellcheck: "false", "aria-label": `Script tag code for ${link.name}` });
  const address = h("code", { class: "hlsp-url" });
  const reach = h("p", { class: "hlsp-note" });
  const open = h("a", { class: "btn", target: "_blank", rel: "noopener noreferrer", text: "Open the player" });
  const stage = h("div", { class: "hlsp-stage" });
  const preview = h("button", { class: "btn primary", type: "button", text: "Preview" });
  const state = h("span", { class: "hlsp-state" });
  const node = h("section", { class: "hlsp-card", "aria-label": `Watch link ${link.name}` }, [
    h("div", { class: "row hlsp-head" }, [h("strong", { class: "grow ellipsis", text: link.name }), state, preview]),
    stage,
    h("div", { class: "hlsp-label", text: "Stream address" }),
    h("div", { class: "row hlsp-wrap" }, [address, copyButton("Copy", { get value() { return address.textContent; } }), open]),
    reach,
    h("div", { class: "hlsp-label", text: "Iframe" }),
    iframeArea,
    copyButton("Copy iframe code", iframeArea),
    h("div", { class: "hlsp-label", text: "Script tag" }),
    scriptArea,
    copyButton("Copy script tag code", scriptArea),
  ]);

  let player = null;
  const card = {
    node,
    link,
    stop() {
      if (player) player.remove();
      player = null;
      preview.textContent = "Preview";
      stage.hidden = true;
    },
    start() {
      env.onPreview(card);
      player = document.createElement("godwinmix-player");
      // The mixer's page forbids blob workers, so hls.js stays on this thread.
      for (const a of ["no-worker", "autoplay", "muted"]) player.setAttribute(a, "");
      player.setAttribute("title", link.name);
      player.setAttribute("src", new URL(link.path, env.localBase).href);
      stage.replaceChildren(player);
      stage.hidden = false;
      preview.textContent = "Stop preview";
    },
    update(next) {
      Object.assign(link, next);
      const o = env.options();
      const src = new URL(link.path, o.publicBase || env.localBase).href;
      const opts = { src, autoplay: o.autoplay, muted: o.muted, poster: o.poster, title: o.title || link.channelName, width: o.width };
      address.textContent = src;
      const r = reachability(src);
      // A public page may not fetch from this network, so a link that only
      // works here opens in the mixer's own copy of the player.
      open.href = r.public ? playerUrl(opts, o.playerBase) : playerUrl({ ...opts, src: new URL(link.path, env.localBase).href }, env.playerHere);
      iframeArea.value = iframeSnippet(opts, o.playerBase);
      scriptArea.value = scriptSnippet(opts, o.playerBase);
      reach.textContent = r.public ? "This address can be reached from the internet, as far as its name tells. The stream still has to send CORS headers (the mixer does)." : r.why;
      reach.classList.toggle("hlsp-warn", !r.public);
      state.textContent = link.state === "live" ? "Live" : link.error || link.state || "";
      state.dataset.state = link.state || "";
      if (player && link.path) player.setAttribute("src", new URL(link.path, env.localBase).href);
    },
  };
  stage.hidden = true;
  preview.addEventListener("click", () => (player ? card.stop() : card.start()));
  card.update({});
  return card;
}
