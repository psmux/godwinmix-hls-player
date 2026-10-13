// The iframe page: read the query string and put one player on the page.
// A file of its own rather than inline, so the page also runs under a
// Content-Security-Policy that allows scripts from 'self' only, as the
// mixer's does.
// player.html?src=<playlist>&autoplay=1&muted=1&poster=<image>&title=<text>
import { parseParams } from "./embed.js";

const opts = parseParams(location.search, location.href);
if (opts.error) {
  const p = document.createElement("p");
  p.className = "problem";
  p.setAttribute("role", "alert");
  p.textContent = opts.error;
  document.body.appendChild(p);
} else {
  if (opts.title) document.title = opts.title;
  const player = document.createElement("godwinmix-player");
  if (opts.autoplay) player.setAttribute("autoplay", "");
  if (opts.muted) player.setAttribute("muted", "");
  if (opts.poster) player.setAttribute("poster", opts.poster);
  if (opts.title) player.setAttribute("title", opts.title);
  player.setAttribute("src", opts.src);
  document.body.appendChild(player);
}
