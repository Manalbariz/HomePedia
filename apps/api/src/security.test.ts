import { describe, expect, it } from "vitest";
import { escapeRegex } from "./security.js";

describe("escapeRegex", () => {
  it("échappe les métacaractères regex", () => {
    expect(escapeRegex("foo.*(bar)")).toBe("foo\\.\\*\\(bar\\)");
  });

  it("laisse les caractères alphanumériques inchangés", () => {
    expect(escapeRegex("alice42")).toBe("alice42");
  });
});
