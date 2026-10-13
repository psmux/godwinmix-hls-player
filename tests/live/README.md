# The live check

`check.mjs` plays a real GodwinMix watch link in a real headless Chrome or
Edge and opens the plugin's panel in the real mixer page. It needs node 22 or
later and nothing installed from npm.

## What it checks

* `player.html` served from another origin (a small static server on port
  22850 stands in for GitHub Pages) plays the watch link: the video's
  `currentTime` moves on by more than 4 seconds in 6, at the programme's size.
* the latency readout shows a delay; M unmutes, K pauses and L goes back to
  live from the keyboard.
* with `--offline`, the watch link switched off shows Offline, and switched on
  again plays without anyone touching the page.
* the script tag form plays the same way.
* a `javascript:` URL in `?src=` is refused with a sentence.
* the panel registers in the mixer page, lists the channel's watch link, writes
  iframe code that names it, and its preview plays.

## Getting a mixer ready

1. Start GodwinMix with the ingest plugin installed and something on the
   programme.
2. Make a channel fed by the programme and give it a watch link:

   ```sh
   gmx ctl rpc channel.add '{"name": "Web stream", "feed": {"kind": "programme"}}'
   gmx ctl rpc channel.destination.add '{"id": "web-stream", "platform": "hls"}'
   ```

3. Install this plugin into that mixer: `gmx plugin add <this folder>`. On
   GodwinMix 0.3.9 also copy `ui` up one level, as the main README's Known
   issues says.
4. Run the check:

   ```sh
   node tests/live/check.mjs --mixer http://127.0.0.1:8080 --channel web-stream \
       --browser "C:/Program Files/Google/Chrome/Application/chrome.exe" --offline
   ```

`--shots <folder>` also saves a picture of each page. `--cdp` and `--serve`
change the two local ports it uses (22860 and 22850).
