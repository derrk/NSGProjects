import { describe, it, expect } from "vitest";
import { dayKey } from "./investments";

describe("dayKey — calendar-day snapshot key", () => {
  it("formats YYYY-MM-DD with zero padding", () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 8, 15))).toBe("2026-09-15");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("is stable across times of the same local day", () => {
    const morning = new Date(2026, 5, 1, 0, 1);
    const night = new Date(2026, 5, 1, 23, 59);
    expect(dayKey(morning)).toBe(dayKey(night));
  });
});
