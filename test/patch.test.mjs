import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHunks, reverseApplyPatch } from "../src/patch";

const PATCH_MODIFY = [
  "--- a/src/foo.ts",
  "+++ b/src/foo.ts",
  "@@ -1,4 +1,4 @@",
  " line1",
  "-line2",
  "+LINE2-CHANGED",
  " line3",
  " line4",
  "",
].join("\n");

const CURRENT = ["line1", "LINE2-CHANGED", "line3", "line4"].join("\n");
const ORIGINAL = ["line1", "line2", "line3", "line4"].join("\n");

test("parseHunks extracts newStart positions", () => {
  const hunks = parseHunks(PATCH_MODIFY);
  assert.equal(hunks.length, 1);
  assert.equal(hunks[0].newStart, 1);
  assert.equal(hunks[0].body[0], " line1");
  assert.equal(hunks[0].body[1], "-line2");
  assert.equal(hunks[0].body[2], "+LINE2-CHANGED");
});

test("reverseApplyPatch restores original for a modified file", () => {
  assert.equal(reverseApplyPatch(CURRENT, PATCH_MODIFY), ORIGINAL);
});

test("reverseApplyPatch handles multiple hunks", () => {
  const patch = [
    "--- a/f",
    "+++ b/f",
    "@@ -1,3 +1,3 @@",
    " a",
    "-b",
    "+B",
    " c",
    "@@ -10,2 +10,2 @@",
    " j",
    "-k",
    "+K",
    "",
  ].join("\n");
  const current = ["a", "B", "c", "d", "e", "f", "g", "h", "i", "j", "K"].join("\n");
  const original = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"].join("\n");
  assert.equal(reverseApplyPatch(current, patch), original);
});

test("reverseApplyPatch handles additions (new lines)", () => {
  const patch = [
    "--- a/f",
    "+++ b/f",
    "@@ -1,1 +1,2 @@",
    " a",
    "+b",
    "",
  ].join("\n");
  const current = ["a", "b"].join("\n");
  const original = ["a"].join("\n");
  assert.equal(reverseApplyPatch(current, patch), original);
});

test("reverseApplyPatch handles deletions (removed lines)", () => {
  const patch = [
    "--- a/f",
    "+++ b/f",
    "@@ -1,2 +1,1 @@",
    " a",
    "-b",
    "",
  ].join("\n");
  const current = ["a"].join("\n");
  const original = ["a", "b"].join("\n");
  assert.equal(reverseApplyPatch(current, patch), original);
});

test("reverseApplyPatch falls back to current content for empty patch", () => {
  assert.equal(reverseApplyPatch(CURRENT, ""), CURRENT);
  assert.equal(reverseApplyPatch(CURRENT, "not a patch\n"), CURRENT);
});

test("reverseApplyPatch preserves a trailing newline", () => {
  const patch = [
    "--- a/f",
    "+++ b/f",
    "@@ -1,2 +1,2 @@",
    " x",
    "-y",
    "+Y",
    "",
  ].join("\n");
  assert.equal(reverseApplyPatch("x\nY\n", patch), "x\ny\n");
});
