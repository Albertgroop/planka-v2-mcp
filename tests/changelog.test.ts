import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "@jest/globals";
import { VERSION } from "../common/version.js";

describe("changelog", () => {
  test("the current version has release notes (release.yml publishes them on merge)", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const notes = execFileSync(".github/scripts/release-notes.sh", [VERSION], {
      cwd: root,
      encoding: "utf8",
    });
    expect(notes.trim()).not.toBe("");
  });
});
