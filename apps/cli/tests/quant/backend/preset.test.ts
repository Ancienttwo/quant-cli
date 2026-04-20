import { describe, expect, test } from "bun:test";
// @ts-expect-error - backend fixtures are runtime-tested outside the CLI tsconfig boundary
import { handlePresetList, handlePresetShow } from "../../../../quant-backend/src/handlers/preset";

describe("preset handler", () => {
  test("handlePresetList returns all presets", () => {
    const result = handlePresetList({});
    expect(result.status).toBe("completed");
    const presets = result.presets as Array<{ id: string; name: string }>;
    expect(presets.length).toBeGreaterThanOrEqual(6);
    expect(presets.some((p) => p.id === "momentum-ton")).toBe(true);
    expect(presets.some((p) => p.id === "momentum-0700-hk")).toBe(true);
    expect(presets.some((p) => p.id === "momentum-600519-cn")).toBe(true);
  });

  test("handlePresetShow returns preset details", () => {
    const result = handlePresetShow({ presetId: "momentum-ton" });
    expect(result.status).toBe("completed");
    const preset = result.preset as Record<string, unknown>;
    expect(preset.name).toBe("TON Momentum");
    expect(preset.strategy).toBe("momentum");
    expect(preset.symbols).toEqual(["TON/USDT"]);
    expect(preset.params).toBeDefined();
  });

  test("handlePresetShow returns HK preset details", () => {
    const result = handlePresetShow({ presetId: "momentum-0700-hk" });
    expect(result.status).toBe("completed");
    const preset = result.preset as Record<string, unknown>;
    expect(preset.marketRegion).toBe("hk");
    expect(preset.venue).toBe("hkex");
    expect(preset.provider).toBe("yfinance");
  });

  test("handlePresetShow throws on unknown preset", () => {
    expect(() => handlePresetShow({ presetId: "nonexistent" })).toThrow(/Preset not found/);
  });
});
