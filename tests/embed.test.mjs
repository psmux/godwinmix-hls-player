// node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseParams, readFlag, safeUrl, playerUrl, iframeSnippet, scriptSnippet,
  cssWidth, attr, reachability, isPrivateHost, PAGES_BASE,
} from "../ui/embed.js";

const STREAM = "https://cdn.example.com/live/index.m3u8?key=abc&x=1";

test("a full query string is read", () => {
  const q = "?src=" + encodeURIComponent(STREAM) + "&autoplay=1&muted=1&poster=https%3A%2F%2Fexample.com%2Fp.jpg&title=Sunday%20service";
  assert.deepEqual(parseParams(q), {
    src: STREAM,
    autoplay: true,
    muted: true,
    poster: "https://example.com/p.jpg",
    title: "Sunday service",
    error: null,
  });
});

test("autoplay implies muted unless muted=0 is given", () => {
  const src = "src=https://a.example/x.m3u8";
  assert.equal(parseParams(`?${src}&autoplay=1`).muted, true);
  assert.equal(parseParams(`?${src}&autoplay=1&muted=0`).muted, false);
  assert.equal(parseParams(`?${src}`).muted, false);
  assert.equal(parseParams(`?${src}`).autoplay, false);
});

test("a bare flag counts as on", () => {
  const p = parseParams("?src=https://a.example/x.m3u8&autoplay&muted");
  assert.equal(p.autoplay, true);
  assert.equal(p.muted, true);
});

test("flags read the usual words and leave nonsense at the fallback", () => {
  for (const w of ["1", "true", "YES", "on", ""]) assert.equal(readFlag(w), true, w);
  for (const w of ["0", "false", "No", "off"]) assert.equal(readFlag(w, true), false, w);
  assert.equal(readFlag("maybe", true), true);
  assert.equal(readFlag("maybe", false), false);
  assert.equal(readFlag(null, true), true);
});

test("no src says what to add", () => {
  const p = parseParams("?autoplay=1");
  assert.equal(p.src, null);
  assert.match(p.error, /\?src=/);
});

test("a script URL in src is refused, not loaded", () => {
  const p = parseParams("?src=" + encodeURIComponent("javascript:alert(1)"));
  assert.equal(p.src, null);
  assert.match(p.error, /not an http or https URL/);
  assert.equal(parseParams("?src=x&poster=" + encodeURIComponent("data:image/png;base64,AA")).poster, null);
});

test("a relative src is read against the page", () => {
  const p = parseParams("?src=/hls/channel/live/watch/index.m3u8", "http://192.168.1.20:8080/plugins/hls-player/ui/player.html");
  assert.equal(p.src, "http://192.168.1.20:8080/hls/channel/live/watch/index.m3u8");
});

test("a long title is cut at 200 characters", () => {
  const p = parseParams("?src=https://a.example/x.m3u8&title=" + "a".repeat(300));
  assert.equal(p.title.length, 200);
});

test("safeUrl takes http and https only", () => {
  assert.equal(safeUrl("http://a.example/x"), "http://a.example/x");
  assert.equal(safeUrl("ftp://a.example/x"), null);
  assert.equal(safeUrl("not a url"), null);
  assert.equal(safeUrl(""), null);
});

test("the player address carries every option and round trips", () => {
  const opts = { src: STREAM, autoplay: true, muted: true, poster: "https://example.com/p.jpg", title: "Sunday & friends" };
  const url = playerUrl(opts);
  assert.ok(url.startsWith(PAGES_BASE + "player.html?src="));
  const back = parseParams(new URL(url).search);
  assert.deepEqual(back, { ...opts, error: null });
});

test("options left off stay out of the address", () => {
  const url = playerUrl({ src: "https://a.example/x.m3u8" }, "https://player.example/sub/");
  assert.equal(url, "https://player.example/sub/player.html?src=https%3A%2F%2Fa.example%2Fx.m3u8");
});

test("the iframe snippet is a 16:9 box with the player filling it", () => {
  const code = iframeSnippet({ src: "https://a.example/x.m3u8", autoplay: true, muted: true, title: "Live" });
  assert.equal(
    code,
    '<div style="position:relative;width:100%;aspect-ratio:16/9">\n' +
      '  <iframe src="https://psmux.github.io/godwinmix-hls-player/player.html?src=https%3A%2F%2Fa.example%2Fx.m3u8&amp;autoplay=1&amp;muted=1&amp;title=Live" title="Live" ' +
      'style="position:absolute;inset:0;width:100%;height:100%;border:0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>\n' +
      "</div>",
  );
});

test("a width wraps the box in a max-width", () => {
  const code = iframeSnippet({ src: "https://a.example/x.m3u8", width: "640" });
  assert.ok(code.startsWith('<div style="max-width:640px">\n  <div style="position:relative'));
  assert.ok(code.endsWith("\n  </div>\n</div>"));
});

test("the script snippet loads the player once and names the stream", () => {
  const code = scriptSnippet({ src: "https://a.example/x.m3u8?key=1&b=2", autoplay: true, muted: true, poster: "https://a.example/p.jpg", title: 'Say "hi"', width: "50%" });
  assert.equal(
    code,
    '<script src="https://psmux.github.io/godwinmix-hls-player/player.js" defer></script>\n' +
      '<godwinmix-player src="https://a.example/x.m3u8?key=1&amp;b=2" autoplay muted poster="https://a.example/p.jpg" title="Say &quot;hi&quot;" style="max-width:50%"></godwinmix-player>',
  );
});

test("the script snippet honours another player address", () => {
  const code = scriptSnippet({ src: "https://a.example/x.m3u8" }, "https://mine.example/player/");
  assert.ok(code.startsWith('<script src="https://mine.example/player/player.js" defer></script>'));
});

test("a width that would break out of the style is refused", () => {
  assert.equal(cssWidth("640"), "640px");
  assert.equal(cssWidth("100%"), "100%");
  assert.equal(cssWidth("40rem"), "40rem");
  assert.equal(cssWidth('1px;background:url(x)"'), null);
  assert.equal(cssWidth(""), null);
  assert.equal(iframeSnippet({ src: "https://a.example/x.m3u8", width: "1px;x" }).startsWith('<div style="position'), true);
});

test("attr escapes what could close an attribute", () => {
  assert.equal(attr(`<a href="x">&`), "&lt;a href=&quot;x&quot;&gt;&amp;");
});

test("private and loopback hosts are not public", () => {
  for (const h of ["127.0.0.1", "10.1.2.3", "192.168.1.20", "172.16.0.1", "172.31.255.1", "169.254.1.1", "100.64.0.1", "localhost", "mixer.local", "::1", "fd00::1"]) {
    assert.equal(isPrivateHost(h), true, h);
  }
  for (const h of ["8.8.8.8", "172.32.0.1", "cdn.example.com", "fcbarcelona.com"]) assert.equal(isPrivateHost(h), false, h);
});

test("reachability names the reason a site could not play it", () => {
  assert.equal(reachability("https://cdn.example.com/x.m3u8").public, true);
  const lan = reachability("http://192.168.1.20:8080/hls/x.m3u8");
  assert.equal(lan.public, false);
  assert.match(lan.why, /192\.168\.1\.20 is an address on this network only/);
  const plain = reachability("http://stream.example.com/x.m3u8");
  assert.equal(plain.public, false);
  assert.match(plain.why, /plain http/);
});
