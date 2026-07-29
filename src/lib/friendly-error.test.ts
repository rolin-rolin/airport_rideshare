import { describe, expect, it } from "vitest";
import { friendlyError, ONE_ACTIVE_GROUP_MESSAGE } from "./friendly-error";

describe("friendlyError", () => {
  it("maps a unique-violation (23505) to the one-active-group message", () => {
    expect(friendlyError({ code: "23505", message: "duplicate key value" })).toBe(
      ONE_ACTIVE_GROUP_MESSAGE,
    );
  });

  it("passes through the raw message for any other code", () => {
    expect(friendlyError({ code: "23503", message: "foreign key violation" })).toBe(
      "foreign key violation",
    );
  });

  it("passes through the raw message when no code is present", () => {
    expect(friendlyError({ message: "some other failure" })).toBe("some other failure");
  });
});
