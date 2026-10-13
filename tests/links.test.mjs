import test from "node:test";
import assert from "node:assert/strict";
import { watchLinks, channelsWithoutLink, lanBase } from "../ui/links.js";

// Shaped like a channel.list answer from GodwinMix 0.3.9.
const ANSWER = {
  hosts: ["192.168.77.106", "127.0.0.1"],
  channels: [
    {
      id: "live",
      name: "Live",
      destinations: [
        { id: "youtube", platform: "youtube", enabled: true, state: "live" },
        {
          id: "watch-link",
          platform: "hls",
          label: "Watch link",
          enabled: true,
          state: "live",
          error: null,
          playback: { master_url_path: "/hls/channel/live/watch-link/index.m3u8?key=k1", viewers: 0 },
        },
      ],
    },
    {
      id: "sunday-service",
      name: "Sunday service",
      destinations: [{ id: "watch-link", platform: "hls", label: "Watch link", enabled: true, state: "waiting" }],
    },
    { id: "spare", name: "Spare", destinations: [{ id: "watch-link", platform: "hls", enabled: false }] },
    { id: "empty", name: "Empty" },
  ],
};

test("every switched on watch link is listed with its path", () => {
  assert.deepEqual(watchLinks(ANSWER), [
    {
      key: "live/watch-link",
      channel: "live",
      channelName: "Live",
      destination: "watch-link",
      name: "Live",
      path: "/hls/channel/live/watch-link/index.m3u8?key=k1",
      state: "live",
      error: null,
    },
    {
      key: "sunday-service/watch-link",
      channel: "sunday-service",
      channelName: "Sunday service",
      destination: "watch-link",
      name: "Sunday service",
      path: null,
      state: "waiting",
      error: null,
    },
  ]);
});

test("two links on one channel are told apart by label", () => {
  const two = {
    channels: [
      {
        id: "live",
        name: "Live",
        destinations: [
          { id: "a", platform: "hls", label: "Watch link", enabled: true },
          { id: "b", platform: "hls", label: "Low latency", enabled: true },
        ],
      },
    ],
  };
  assert.deepEqual(watchLinks(two).map((l) => l.name), ["Live", "Live (Low latency)"]);
});

test("channels with no link switched on are offered one", () => {
  assert.deepEqual(channelsWithoutLink(ANSWER), [
    { id: "spare", name: "Spare" },
    { id: "empty", name: "Empty" },
  ]);
});

test("an empty or failed answer lists nothing", () => {
  assert.deepEqual(watchLinks(null), []);
  assert.deepEqual(watchLinks({}), []);
  assert.deepEqual(channelsWithoutLink(undefined), []);
});

test("a page on loopback gives out the network address", () => {
  assert.equal(lanBase("http://127.0.0.1:8080", ANSWER), "http://192.168.77.106:8080/");
  assert.equal(lanBase("http://localhost:8080", ANSWER), "http://192.168.77.106:8080/");
  assert.equal(lanBase("http://10.0.0.5:8080", ANSWER), "http://10.0.0.5:8080/");
  assert.equal(lanBase("http://127.0.0.1:8080", { hosts: ["127.0.0.1"] }), "http://127.0.0.1:8080/");
});
