import { describe, expect, it } from "vitest";
import { deptFromInsee, geocodeCity, inseeToApproxCoords } from "./geocode.js";

describe("geocode", () => {
  it("extrait le département depuis un code INSEE", () => {
    expect(deptFromInsee("28185")).toBe("28");
    expect(deptFromInsee("75056")).toBe("75");
    expect(deptFromInsee("97105")).toBe("971");
  });

  it("géocode une commune via code INSEE 5 chiffres", () => {
    const c = geocodeCity(undefined, "28185");
    expect(c).not.toBeNull();
    expect(c!.lat).toBeGreaterThan(41);
    expect(c!.lat).toBeLessThan(52);
    expect(c!.lon).toBeGreaterThan(-6);
    expect(c!.lon).toBeLessThan(10);
  });

  it("inseeToApproxCoords est stable", () => {
    const a = inseeToApproxCoords("28185");
    const b = inseeToApproxCoords("28185");
    expect(a.lat).toBe(b.lat);
    expect(a.lon).toBe(b.lon);
  });
});
