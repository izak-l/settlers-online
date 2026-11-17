import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recipes = vi.hoisted(() => ({ build: vi.fn(), chat: vi.fn() }));
vi.mock("./synth", () => ({ RECIPES: recipes }));

function mockAudio() {
  const gains: {
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const nodes: {
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    loop: boolean;
    onended: (() => void) | null;
  }[] = [];
  const decoded = { duration: 2 };
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    resume: vi.fn(async () => {
      context.state = "running";
    }),
    decodeAudioData: vi.fn(async () => decoded),
    createGain: vi.fn(() => {
      const node = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node);
      return node;
    }),
    createBufferSource: vi.fn(() => {
      const node = {
        buffer: null as unknown,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        loop: false,
        onended: null as (() => void) | null,
      };
      nodes.push(node);
      return node;
    }),
  };
  vi.stubGlobal(
    "AudioContext",
    vi.fn(function () {
      return context;
    }),
  );
  const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }));
  vi.stubGlobal("fetch", fetcher);
  return { context, gains, nodes, decoded, fetcher };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Fetch, arrayBuffer and decoding each cross an async boundary.
async function loaded() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe("sound player", () => {
  it("drops locked/unready cues, caches recordings and never replays dropped cues", async () => {
    const audio = mockAudio();
    const player = await import("./player");
    player.play(["dice", "build"]);
    expect(audio.context.createGain).not.toHaveBeenCalled();
    player.unlock();
    player.play(["dice"]);
    expect(audio.nodes).toHaveLength(0);
    await loaded();
    expect(audio.nodes).toHaveLength(0);
    player.unlock();
    expect(audio.fetcher).toHaveBeenCalledTimes(13);
    expect(audio.context.decodeAudioData).toHaveBeenCalledTimes(13);
    player.play(["dice", "gain"]);
    expect(audio.nodes[0]!.buffer).toBe(audio.decoded);
    expect(audio.nodes[0]!.start).toHaveBeenCalledWith(10.01);
    expect(audio.nodes[1]!.start.mock.calls[0]![0]).toBeCloseTo(10.19);
    player.play(["dice"]);
    expect(audio.nodes).toHaveLength(3);
    expect(audio.fetcher).toHaveBeenCalledTimes(13);
    audio.nodes[0]!.onended!();
    expect(audio.nodes[0]!.disconnect).toHaveBeenCalled();
    expect(audio.gains[1]!.disconnect).toHaveBeenCalled();
  });

  it("uses the master volume for ongoing playback and respects mute, zero and suspension", async () => {
    const audio = mockAudio();
    const player = await import("./player");
    const { setSettings } = await import("./settings");
    player.unlock();
    await loaded();
    setSettings({ muted: false, volume: 0.25 });
    player.play(["dice"]);
    expect(audio.gains[0]!.gain.value).toBe(0.25);
    setSettings({ muted: true, volume: 0.25 });
    expect(audio.gains[0]!.gain.value).toBe(0);
    player.play(["dice", "build"]);
    setSettings({ muted: false, volume: 0 });
    player.play(["dice"]);
    expect(audio.nodes).toHaveLength(1);
    expect(recipes.build).not.toHaveBeenCalled();
    setSettings({ muted: false, volume: 0.6 });
    audio.context.state = "suspended";
    player.play(["dice"]);
    expect(audio.nodes).toHaveLength(1);
    player.unlock();
    expect(audio.context.resume).toHaveBeenCalledOnce();
  });

  it("aligns the looping warning to the remaining window and supports cancellation", async () => {
    const audio = mockAudio();
    const player = await import("./player");
    const { setSettings } = await import("./settings");
    player.unlock();
    await loaded();
    const stop = player.playTurnWarning(Date.now() + 3500);
    const node = audio.nodes[0]!;
    expect(node.loop).toBe(true);
    expect(node.start).toHaveBeenCalledWith(10, 1.5);
    expect(node.stop).toHaveBeenCalledWith(13.5);
    setSettings({ muted: true, volume: 0.6 });
    expect(audio.gains[0]!.gain.value).toBe(0);
    stop();
    stop();
    expect(node.stop).toHaveBeenCalledTimes(2);
    expect(node.disconnect).toHaveBeenCalledOnce();
  });

  it("drops warnings before unlock, before readiness and after expiration", async () => {
    const audio = mockAudio();
    const player = await import("./player");
    player.playTurnWarning(Date.now() + 5000)();
    player.unlock();
    player.playTurnWarning(Date.now() + 5000)();
    await loaded();
    player.playTurnWarning(Date.now())();
    expect(audio.nodes).toHaveLength(0);
  });

  it("reports a failed selected recording and does not substitute or retry it", async () => {
    const audio = mockAudio();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    audio.fetcher.mockRejectedValueOnce(new Error("offline"));
    const player = await import("./player");
    player.unlock();
    await loaded();
    player.play(["dice"]);
    player.unlock();
    expect(warn).toHaveBeenCalledOnce();
    expect(audio.nodes).toHaveLength(0);
    expect(audio.fetcher).toHaveBeenCalledTimes(13);
    expect(recipes.build).not.toHaveBeenCalled();
  });
});
