/*! GodwinMix HLS player 1.0.0. MIT licence, https://github.com/psmux/godwinmix-hls-player */
// <godwinmix-player src="https://example.com/live/index.m3u8" autoplay muted>
//
// One custom element that plays a live HLS stream. hls.js (vendor/, Apache
// 2.0) is fetched from beside this file only when the browser has Media
// Source Extensions; a browser without them that plays HLS by itself (Safari
// on older iPhones) gets the playlist on a plain <video>. The element makes
// no request other than the stream, its poster and that one script.
(function () {
  "use strict";
  if (!window.customElements || customElements.get("godwinmix-player")) return;

  var VERSION = "1.0.0";
  var SCRIPT = document.currentScript;
  var BASE = SCRIPT && SCRIPT.src ? new URL(".", SCRIPT.src).href : new URL(".", location.href).href;
  var HLS_FILE = "vendor/hls.min.js";
  var RETRY_STEPS = [1, 2, 4, 8, 10];
  var STALL_SECONDS = 15;
  var hlsPromise = null;

  /** hls.js, loaded once per page however many players there are. */
  function loadHls(base) {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsPromise) return hlsPromise;
    hlsPromise = new Promise(function (resolve, reject) {
      var tag = document.createElement("script");
      tag.src = new URL(HLS_FILE, base).href;
      tag.async = true;
      tag.onload = function () {
        window.Hls ? resolve(window.Hls) : reject(new Error("hls.js loaded but did not define Hls"));
      };
      tag.onerror = function () {
        hlsPromise = null;
        reject(new Error("could not load " + tag.src));
      };
      document.head.appendChild(tag);
    });
    return hlsPromise;
  }

  function hasMse() {
    var MS = window.ManagedMediaSource || window.MediaSource;
    return !!(MS && MS.isTypeSupported && MS.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
  }

  function safeUrl(value) {
    if (!value) return null;
    try {
      var url = new URL(value, location.href);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function flag(el, name) {
    if (!el.hasAttribute(name)) return false;
    var v = (el.getAttribute(name) || "").toLowerCase();
    return v !== "false" && v !== "0" && v !== "no" && v !== "off";
  }

  var ICON = {
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    sound: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>',
    mute: '<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>',
    full: '<path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z"/>',
  };

  function svg(name) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor">' + ICON[name] + "</svg>";
  }

  var CSS =
    ":host{display:block;position:relative;width:100%;aspect-ratio:16/9;background:#000;color:#fff;" +
    "font:14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:hidden;outline:none}" +
    ":host(:focus-visible){box-shadow:0 0 0 3px #4da3ff}" +
    "@supports not (aspect-ratio:16/9){:host{height:0;padding-top:56.25%}}" +
    ".box{position:absolute;inset:0}video{position:absolute;inset:0;width:100%;height:100%;background:#000}" +
    ".title{position:absolute;top:0;left:0;right:0;padding:10px 12px;background:linear-gradient(#000a,#0000);" +
    "font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}" +
    ".state{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:80%;text-align:center;" +
    "background:#000b;padding:10px 14px;border-radius:8px}.state:empty{display:none}" +
    ".big{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:72px;height:72px;border-radius:50%;" +
    "border:0;background:#000a;color:#fff;cursor:pointer}.big svg{width:40px;height:40px}" +
    ".bar{position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:4px;padding:6px 8px;" +
    "background:linear-gradient(#0000,#000c);transition:opacity .2s}" +
    ":host([data-idle]) .bar,:host([data-idle]) .title{opacity:0}" +
    "button,select{font:inherit;color:#fff;background:transparent;border:0;border-radius:4px;padding:4px 6px;cursor:pointer;min-height:32px}" +
    "button:hover,select:hover{background:#ffffff26}button:focus-visible,select:focus-visible{outline:2px solid #4da3ff;outline-offset:1px}" +
    "select{background:#0008}option{color:#000}.grow{flex:1}" +
    ".live{display:inline-flex;align-items:center;gap:6px;padding:0 6px;font-variant-numeric:tabular-nums;white-space:nowrap}" +
    ".dot{width:9px;height:9px;border-radius:50%;background:#888}.live[data-on] .dot{background:#e53935}" +
    ".golive{font-weight:600}.golive[hidden],.big[hidden],select[hidden]{display:none}" +
    ".unmute{position:absolute;top:44px;right:10px;background:#000b;border:1px solid #fff6}" +
    "@media (max-width:420px){.lat{display:none}}";

  var TEMPLATE =
    "<style>" + CSS + "</style>" +
    '<div class="box">' +
    '<video playsinline webkit-playsinline preload="none"></video>' +
    '<div class="title" part="title"></div>' +
    '<div class="state" role="status" aria-live="polite"></div>' +
    '<button class="big" type="button" aria-label="Play" hidden>' + svg("play") + "</button>" +
    '<button class="unmute" type="button" hidden>Sound is off. Press to unmute</button>' +
    '<div class="bar" part="controls">' +
    '<button class="play" type="button" aria-label="Play">' + svg("play") + "</button>" +
    '<button class="mute" type="button" aria-label="Mute" aria-pressed="false">' + svg("sound") + "</button>" +
    '<span class="live" title="How far behind the live edge this player is"><span class="dot"></span><span class="lbl">LIVE</span><span class="lat"></span></span>' +
    '<button class="golive" type="button" hidden>Go live</button>' +
    '<span class="grow"></span>' +
    '<select class="quality" aria-label="Quality" hidden></select>' +
    '<button class="full" type="button" aria-label="Full screen">' + svg("full") + "</button>" +
    "</div></div>";

  class GodwinMixPlayer extends HTMLElement {
    static get observedAttributes() {
      return ["src", "poster", "title", "muted"];
    }

    constructor() {
      super();
      var root = this.attachShadow({ mode: "open" });
      root.innerHTML = TEMPLATE;
      var q = function (s) { return root.querySelector(s); };
      this.video = q("video");
      this.ui = {
        title: q(".title"), state: q(".state"), big: q(".big"), unmute: q(".unmute"), play: q(".play"),
        mute: q(".mute"), live: q(".live"), lbl: q(".lbl"), lat: q(".lat"), golive: q(".golive"),
        quality: q(".quality"), full: q(".full"),
      };
      this.hls = null;
      this.attempt = 0;
      this.timers = {};
      this.state = "idle";
      this.wire();
    }

    connectedCallback() {
      if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
      if (!this.hasAttribute("role")) this.setAttribute("role", "region");
      this.setAttribute("aria-label", this.getAttribute("title") || "Live video player");
      this.applyLooks();
      this.start();
    }

    disconnectedCallback() {
      this.teardown();
      this.setState("idle", "");
    }

    attributeChangedCallback(name, before, after) {
      if (!this.isConnected || before === after) return;
      if (name === "src") this.start();
      else this.applyLooks();
    }

    /** Title, poster and mute, which never need the stream reloaded. */
    applyLooks() {
      var title = this.getAttribute("title") || "";
      this.ui.title.textContent = title;
      this.ui.title.hidden = !title;
      var poster = safeUrl(this.getAttribute("poster"));
      if (poster) this.video.poster = poster;
      else this.video.removeAttribute("poster");
      this.video.muted = flag(this, "muted");
      this.paintMute();
    }

    // ------------------------------------------------------------ loading

    start() {
      this.teardown();
      var src = safeUrl(this.getAttribute("src"));
      if (!src) {
        this.setState("error", this.getAttribute("src") ? "The stream address is not an http or https URL." : "No stream address. Set src to an HLS playlist (.m3u8).");
        return;
      }
      this.src = src;
      this.wanted = flag(this, "autoplay");
      this.ui.big.hidden = this.wanted;
      this.setState("loading", this.wanted ? "Connecting" : "");
      if (!this.wanted) return this.idleUntilPlay();
      this.open();
    }

    /** Nothing is fetched until the viewer presses play, unless autoplay. */
    idleUntilPlay() {
      this.setState("ready", "");
      this.ui.big.hidden = false;
    }

    open() {
      var self = this;
      clearTimeout(this.timers.retry);
      this.opened = true;
      this.video.preload = "auto";
      if (hasMse()) {
        loadHls(this.getAttribute("hls-src") ? new URL(".", safeUrl(this.getAttribute("hls-src"))).href : BASE)
          .then(function (Hls) { if (self.opened) self.openHls(Hls); })
          .catch(function (e) { self.setState("error", "The player could not load hls.js: " + e.message); });
      } else if (this.video.canPlayType("application/vnd.apple.mpegurl")) {
        this.native = true;
        this.video.src = this.src;
        this.playWhenReady();
      } else {
        this.setState("error", "This browser cannot play HLS video.");
      }
      this.watch();
    }

    openHls(Hls) {
      var self = this;
      var hls = new Hls({
        lowLatencyMode: true,
        enableWorker: !this.hasAttribute("no-worker"),
        backBufferLength: 30,
        manifestLoadingMaxRetry: 1,
        levelLoadingMaxRetry: 2,
        fragLoadingMaxRetry: 3,
      });
      this.hls = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, function () { self.fillQuality(); self.playWhenReady(); });
      hls.on(Hls.Events.LEVEL_SWITCHED, function () { self.paintQuality(); });
      hls.on(Hls.Events.ERROR, function (_e, data) { if (data.fatal) self.fatal(Hls, data); });
      hls.loadSource(this.src);
      hls.attachMedia(this.video);
    }

    fatal(Hls, data) {
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.recovered) {
        this.recovered = true;
        this.hls.recoverMediaError();
        return;
      }
      var code = data.response && data.response.code;
      var why = code === 401 || code === 403 ? "The stream refused this player (" + code + "). Check the key in the address."
        : code === 404 ? "The stream is not on air."
        : "The stream cannot be reached.";
      this.retryLater(why);
    }

    playWhenReady() {
      if (!this.wanted) return;
      var self = this;
      var p = this.video.play();
      if (!p || !p.catch) return;
      p.catch(function (e) {
        if (e && e.name === "NotAllowedError" && !self.video.muted) {
          // The browser will not start sound by itself. Start silent and say so.
          self.video.muted = true;
          self.paintMute();
          self.ui.unmute.hidden = false;
          self.video.play().catch(function () { self.askToPlay(); });
        } else if (e && e.name === "NotAllowedError") {
          self.askToPlay();
        }
      });
    }

    askToPlay() {
      this.wanted = false;
      this.ui.big.hidden = false;
      this.setState("ready", "");
    }

    /** Offline: tear down, count down, and open again by itself. */
    retryLater(why) {
      this.teardown();
      var wait = RETRY_STEPS[Math.min(this.attempt, RETRY_STEPS.length - 1)];
      this.attempt += 1;
      var self = this;
      var left = wait;
      var tick = function () {
        if (left <= 0) {
          self.setState("loading", "Reconnecting");
          self.open();
          return;
        }
        self.setState("offline", "Offline. " + why + " Trying again in " + left + " s.");
        left -= 1;
        self.timers.retry = setTimeout(tick, 1000);
      };
      tick();
    }

    /** Once a second while open: the latency readout and the stall check. */
    watch() {
      var self = this;
      var last = -1;
      var still = 0;
      clearInterval(this.timers.watch);
      this.timers.watch = setInterval(function () {
        var t = self.video.currentTime;
        var moving = t !== last && !self.video.paused;
        if (moving) {
          still = 0;
          self.attempt = 0;
          self.recovered = false;
          if (self.state !== "playing") self.setState("playing", "");
        } else if (!self.video.paused && self.wanted) {
          still += 1;
          if (still === 4 && self.state === "playing") self.setState("loading", "Buffering");
          if (still >= STALL_SECONDS) {
            still = 0;
            self.retryLater("Nothing new has arrived for " + STALL_SECONDS + " s.");
            return;
          }
        }
        last = t;
        self.paintLatency();
      }, 1000);
    }

    teardown() {
      clearInterval(this.timers.watch);
      clearTimeout(this.timers.retry);
      clearTimeout(this.timers.idle);
      this.opened = false;
      if (this.hls) {
        this.hls.destroy();
        this.hls = null;
      }
      this.native = false;
      if (this.video.getAttribute("src")) {
        this.video.removeAttribute("src");
        this.video.load();
      }
      this.ui.quality.hidden = true;
      this.ui.golive.hidden = true;
    }

    // ------------------------------------------------------------ reading

    /** Seconds behind the live edge, or null when it cannot be told. */
    get latency() {
      if (this.hls && typeof this.hls.latency === "number" && isFinite(this.hls.latency) && this.hls.latency > 0) return this.hls.latency;
      var s = this.video.seekable;
      if (this.native && s && s.length) return Math.max(0, s.end(s.length - 1) - this.video.currentTime);
      return null;
    }

    get target() {
      return this.hls && this.hls.targetLatency ? this.hls.targetLatency : 6;
    }

    goLive() {
      if (this.hls && this.hls.liveSyncPosition) this.video.currentTime = this.hls.liveSyncPosition;
      else if (this.video.seekable.length) this.video.currentTime = Math.max(0, this.video.seekable.end(this.video.seekable.length - 1) - 3);
      this.play();
    }

    play() {
      this.wanted = true;
      this.ui.big.hidden = true;
      if (!this.opened) {
        this.setState("loading", "Connecting");
        this.open();
      } else {
        this.playWhenReady();
      }
    }

    pause() {
      this.wanted = false;
      this.video.pause();
    }

    // ------------------------------------------------------------ painting

    setState(state, text) {
      this.state = state;
      this.ui.state.textContent = text || "";
      this.setAttribute("data-state", state);
      this.dispatchEvent(new CustomEvent("statechange", { detail: { state: state, text: text || "" } }));
    }

    paintLatency() {
      var lat = this.latency;
      var behind = lat !== null && lat > this.target + 4;
      var playing = this.state === "playing";
      this.ui.live.toggleAttribute("data-on", playing && !behind);
      this.ui.lbl.textContent = behind ? "Behind live" : "LIVE";
      this.ui.lat.textContent = lat === null ? "" : lat.toFixed(1) + " s";
      this.ui.golive.hidden = !(behind || (this.video.paused && this.opened));
    }

    paintPlay() {
      var paused = this.video.paused;
      this.ui.play.innerHTML = svg(paused ? "play" : "pause");
      this.ui.play.setAttribute("aria-label", paused ? "Play" : "Pause");
    }

    paintMute() {
      var m = this.video.muted;
      this.ui.mute.innerHTML = svg(m ? "mute" : "sound");
      this.ui.mute.setAttribute("aria-label", m ? "Unmute" : "Mute");
      this.ui.mute.setAttribute("aria-pressed", String(m));
      if (!m) this.ui.unmute.hidden = true;
    }

    fillQuality() {
      var levels = (this.hls && this.hls.levels) || [];
      var select = this.ui.quality;
      select.textContent = "";
      var auto = document.createElement("option");
      auto.value = "-1";
      auto.textContent = "Auto";
      select.appendChild(auto);
      levels
        .map(function (l, i) { return { i: i, l: l }; })
        .sort(function (a, b) { return (b.l.height || 0) - (a.l.height || 0) || (b.l.bitrate || 0) - (a.l.bitrate || 0); })
        .forEach(function (x) {
          var o = document.createElement("option");
          o.value = String(x.i);
          o.textContent = levelName(x.l);
          select.appendChild(o);
        });
      select.value = "-1";
      select.hidden = levels.length < 2;
    }

    paintQuality() {
      var hls = this.hls;
      if (!hls || this.ui.quality.hidden) return;
      var auto = this.ui.quality.querySelector('option[value="-1"]');
      var now = hls.levels[hls.currentLevel];
      auto.textContent = hls.autoLevelEnabled && now ? "Auto (" + levelName(now) + ")" : "Auto";
    }

    // ------------------------------------------------------------ input

    wire() {
      var self = this;
      var ui = this.ui;
      var v = this.video;
      ui.big.onclick = function () { self.play(); };
      ui.play.onclick = function () { v.paused ? self.play() : self.pause(); };
      ui.mute.onclick = function () { self.toggleMute(); };
      ui.unmute.onclick = function () { self.toggleMute(); };
      ui.golive.onclick = function () { self.goLive(); };
      ui.full.onclick = function () { self.toggleFullscreen(); };
      ui.quality.onchange = function () {
        if (self.hls) self.hls.currentLevel = Number(ui.quality.value);
        self.paintQuality();
      };
      v.addEventListener("play", function () { self.paintPlay(); });
      v.addEventListener("pause", function () {
        self.paintPlay();
        if (self.opened && self.state === "playing") self.setState("paused", "");
        self.paintLatency();
      });
      v.addEventListener("volumechange", function () { self.paintMute(); });
      v.addEventListener("click", function () { v.paused ? self.play() : self.pause(); });
      v.addEventListener("error", function () { if (self.native) self.retryLater("The stream cannot be played."); });
      this.addEventListener("keydown", function (e) { self.key(e); });
      this.addEventListener("pointermove", function () { self.wake(); });
      this.addEventListener("focusin", function () { self.wake(); });
    }

    key(e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var inSelect = e.composedPath()[0] && e.composedPath()[0].tagName === "SELECT";
      var onButton = e.composedPath()[0] && e.composedPath()[0].tagName === "BUTTON";
      var k = e.key.toLowerCase();
      if (inSelect) return;
      if ((k === " " && !onButton) || k === "k") this.video.paused ? this.play() : this.pause();
      else if (k === "m") this.toggleMute();
      else if (k === "f") this.toggleFullscreen();
      else if (k === "l" || k === "end") this.goLive();
      else return;
      e.preventDefault();
    }

    toggleMute() {
      this.video.muted = !this.video.muted;
      if (!this.video.muted && this.video.volume === 0) this.video.volume = 1;
    }

    toggleFullscreen() {
      var doc = document;
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      } else if (this.requestFullscreen) {
        this.requestFullscreen().catch(function () {});
      } else if (this.webkitRequestFullscreen) {
        this.webkitRequestFullscreen();
      } else if (this.video.webkitEnterFullscreen) {
        this.video.webkitEnterFullscreen();
      }
    }

    /** Controls fade after three seconds of no pointer while playing. */
    wake() {
      var self = this;
      this.removeAttribute("data-idle");
      clearTimeout(this.timers.idle);
      this.timers.idle = setTimeout(function () {
        if (!self.video.paused && !self.matches(":focus-within")) self.setAttribute("data-idle", "");
      }, 3000);
    }
  }

  function levelName(l) {
    var kbps = l.bitrate ? Math.round(l.bitrate / 1000) : 0;
    if (l.height) return l.height + "p" + (kbps ? " (" + (kbps >= 1000 ? (kbps / 1000).toFixed(1) + " Mb/s" : kbps + " kb/s") + ")" : "");
    return kbps ? kbps + " kb/s" : "Level";
  }

  customElements.define("godwinmix-player", GodwinMixPlayer);
  window.GodwinMixPlayer = { version: VERSION, base: BASE, element: GodwinMixPlayer };
})();
