// What the panel reads out of a `channel.list` answer. Pure, so it is tested
// under node against answers shaped like the mixer's.

/**
 * Every watch link that is switched on, one entry each:
 * `{key, channel, channelName, destination, name, path, state, error}`.
 * `path` is the playback path with its viewer key, or null until the mixer
 * has one to give.
 */
export function watchLinks(answer) {
  const out = [];
  for (const ch of (answer && answer.channels) || []) {
    const hls = (ch.destinations || []).filter((d) => d.platform === "hls" && d.enabled !== false);
    for (const d of hls) {
      const label = d.label && d.label !== "Watch link" && hls.length > 1 ? ` (${d.label})` : "";
      out.push({
        key: `${ch.id}/${d.id}`,
        channel: ch.id,
        channelName: ch.name || ch.id,
        destination: d.id,
        name: `${ch.name || ch.id}${label}`,
        path: (d.playback && d.playback.master_url_path) || null,
        state: d.state || "",
        error: d.error || null,
      });
    }
  }
  return out;
}

/** Channels that have no watch link switched on, as `{id, name}`. */
export function channelsWithoutLink(answer) {
  return ((answer && answer.channels) || [])
    .filter((ch) => !(ch.destinations || []).some((d) => d.platform === "hls" && d.enabled !== false))
    .map((ch) => ({ id: ch.id, name: ch.name || ch.id }));
}

const LOOPBACK = /^(127\.|localhost$|\[?::1\]?$)/;

/**
 * The address other machines reach the mixer at. The page may be open on
 * 127.0.0.1, so the first of `channel.list`'s `hosts` replaces a loopback
 * host when there is one.
 */
export function lanBase(origin, answer) {
  const url = new URL(origin);
  const hosts = (answer && answer.hosts) || [];
  const other = hosts.find((h) => !LOOPBACK.test(h));
  if (LOOPBACK.test(url.hostname) && other) url.hostname = other;
  return url.origin + "/";
}
