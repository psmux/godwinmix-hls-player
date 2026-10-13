---
name: hls-player-embed
description: Put a GodwinMix channel's watch link, or any HLS stream, on a website. Use when an operator asks for embed code, an iframe or a script tag for a live stream, wants to preview a watch link, or asks why an embedded player stays offline. Covers the player's URL parameters, the two snippet forms, and what a public site needs (a public https address and CORS).
---

# HLS Player

The panel is in the mixer's page under **HLS Player**. It lists every channel
watch link that is switched on, plays a preview of one at a time, and has a
Copy button for the iframe code and the script tag code of each.

## Making a link to embed

A watch link is a channel destination with platform `hls`:

```
channel.destination.add {"id": "live", "platform": "hls"}
```

`channel.list` then carries `destinations[].playback.master_url_path`, the
path with its viewer key. The panel reads only that.

## The player

```
https://psmux.github.io/godwinmix-hls-player/player.html?src=<playlist>&autoplay=1&muted=1&poster=<image>&title=<text>
```

or

```html
<script src="https://psmux.github.io/godwinmix-hls-player/player.js" defer></script>
<godwinmix-player src="<playlist>" autoplay muted></godwinmix-player>
```

`autoplay` implies `muted` unless `muted=0` is given, since browsers only
start a muted video by themselves. Keys: Space or K plays and pauses, M mutes,
F is full screen, L goes back to live.

## When it stays offline on another site

* The stream address must be reachable from the viewer: a LAN address such as
  `192.168.1.20` is not. Put a CDN or a reverse proxy with a public name in
  front, and type that address in the panel's Public address field.
* A site served over https cannot load an http stream. Serve it over https.
* The stream must answer with `Access-Control-Allow-Origin`. GodwinMix sends
  `*` on its watch links; a proxy in front must keep the header.
