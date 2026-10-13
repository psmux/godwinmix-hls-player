// Just enough of the Chrome DevTools protocol to open a page, run code in it
// and take a picture, over the WebSocket node 22 and later has built in. No
// dependency, so the live check needs only node and a Chrome or Edge.

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Start a headless browser on `port`, with its profile in `profile`. */
export function launch(binary, port, profile) {
  mkdirSync(profile, { recursive: true });
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-component-update",
    "--mute-audio",
    "--window-size=1280,720",
    "about:blank",
  ];
  const child = spawn(binary, args, { stdio: "ignore" });
  return child;
}

/** Open `url` in a new tab and answer a handle to it. */
export async function open(port, url, { width = 1280, height = 720 } = {}) {
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
      target = await res.json();
    } catch {
      await sleep(200);
    }
  }
  if (!target) throw new Error(`no browser answered on DevTools port ${port}`);
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    socket.addEventListener("open", res, { once: true });
    socket.addEventListener("error", rej, { once: true });
  });
  let id = 0;
  const waiting = new Map();
  const logs = [];
  const failures = [];
  socket.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) {
      waiting.get(m.id)(m);
      waiting.delete(m.id);
    } else if (m.method === "Runtime.consoleAPICalled") {
      logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      logs.push("[exception] " + (d.exception?.description || d.text));
    } else if (m.method === "Network.loadingFailed" && !m.params.canceled) {
      failures.push(m.params.errorText);
    } else if (m.method === "Network.responseReceived" && m.params.response.status >= 400) {
      failures.push(`${m.params.response.status} ${m.params.response.url}`);
    }
  });
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      waiting.set(++id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });

  const page = {
    logs,
    failures,
    send,
    /** Run an expression in the page and answer its value. */
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    /** Wait until `expression` is truthy, or throw after `ms`. */
    async until(expression, ms = 20000, what = expression) {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        try {
          const v = await page.eval(expression);
          if (v) return v;
        } catch {
          /* the page is still loading */
        }
        await sleep(250);
      }
      throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    },
    async shot(file, clip) {
      const r = await send("Page.captureScreenshot", clip ? { format: "png", clip: { ...clip, scale: 1 } } : { format: "png" });
      writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    async close() {
      try {
        await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`, { method: "PUT" });
      } catch {
        /* the browser went first */
      }
      socket.close();
    },
  };
  return page;
}
