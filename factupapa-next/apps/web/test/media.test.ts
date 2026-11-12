import { describe, expect, it } from "vitest";
import { fitWithin, formatDuration, pickAudioMime } from "../src/notes/media";

describe("fotos y voz", () => {
  it("reduce una foto grande manteniendo la proporción y no agranda", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("formatea la duración", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(-3)).toBe("0:00");
  });
  it("elige el formato de audio que admite el navegador", () => {
    expect(pickAudioMime((mime) => mime.startsWith("audio/webm"))).toBe("audio/webm;codecs=opus");
    expect(pickAudioMime((mime) => mime === "audio/mp4")).toBe("audio/mp4");
    expect(pickAudioMime(() => false)).toBeNull();
  });
});
