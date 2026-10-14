import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/post-auth-redirect";

describe("safeNextPath", () => {
  it("keeps in-app board paths, including query strings", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/dashboard/new")).toBe("/dashboard/new");
    expect(safeNextPath("/dashboard/trips/abc?bags=2")).toBe("/dashboard/trips/abc?bags=2");
  });

  it("falls back to the board for anything that could leave the app", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "dashboard",
      "/logout",
      "/auth/callback",
    ]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
});
