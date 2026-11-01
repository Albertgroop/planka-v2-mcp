import { readFileSync } from "node:fs";
import { describe, expect, test } from "@jest/globals";
import { VERSION } from "../common/version.js";

describe("version", () => {
  test("common/version.ts matches package.json (the release tag is checked against it)", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(VERSION).toBe(pkg.version);
  });
});
