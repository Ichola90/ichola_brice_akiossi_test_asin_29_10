import { describe, it, expect } from "vitest";
import { VERSION } from "../src/index.js";

describe("Initialisation", () => {
  it("charge correctement le projet", () => {
    expect(VERSION).toBe("1.0.0");
  });
});
