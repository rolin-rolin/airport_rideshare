import { describe, expect, it } from "vitest";
import { parseRef, parseVisitorId } from "./referral";

describe("parseRef", () => {
  it("accepts and lowercases simple tags", () => {
    expect(parseRef("hpc")).toBe("hpc");
    expect(parseRef(" HPC ")).toBe("hpc");
    expect(parseRef("dorm_flyer-2")).toBe("dorm_flyer-2");
  });

  it("rejects missing, empty, oversized or odd tags", () => {
    expect(parseRef(null)).toBeNull();
    expect(parseRef(undefined)).toBeNull();
    expect(parseRef("")).toBeNull();
    expect(parseRef("a".repeat(33))).toBeNull();
    expect(parseRef("hp c")).toBeNull();
    expect(parseRef("<script>")).toBeNull();
  });
});

describe("parseVisitorId", () => {
  it("accepts a uuid", () => {
    expect(parseVisitorId("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    );
  });

  it("rejects anything else", () => {
    expect(parseVisitorId(undefined)).toBeNull();
    expect(parseVisitorId("not-a-uuid")).toBeNull();
  });
});
