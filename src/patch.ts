interface Hunk {
  newStart: number;
  body: string[];
}

/**
 * Minimal unified-diff parser. Returns the hunks with their `newStart` position
 * (1-based line in the current file) so we can reverse-apply them.
 */
export function parseHunks(patch: string): Hunk[] {
  const hunks: Hunk[] = [];
  for (const line of patch.split("\n")) {
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (m) {
      hunks.push({ newStart: parseInt(m[1], 10), body: [] });
    } else if (hunks.length) {
      hunks[hunks.length - 1].body.push(line);
    }
  }
  return hunks;
}

/**
 * Reconstructs the original content of a file by reverse-applying a unified
 * diff patch to its current content. Falls back to the current content when the
 * patch cannot be parsed.
 */
export function reverseApplyPatch(current: string, patch?: string): string {
  if (!patch) {
    return current;
  }
  const hunks = parseHunks(patch);
  if (hunks.length === 0) {
    return current;
  }

  const cur = current.split("\n");
  const original: string[] = [];
  let idx = 0;

  for (const hunk of hunks) {
    const start = hunk.newStart - 1;
    while (idx < start && idx < cur.length) {
      original.push(cur[idx++]);
    }
    for (const line of hunk.body) {
      const tag = line[0];
      const text = line.length > 1 ? line.slice(1) : "";
      if (tag === " ") {
        original.push(idx < cur.length ? cur[idx++] : text);
      } else if (tag === "-") {
        original.push(text);
      } else if (tag === "+") {
        // The added line exists in the current content: consume it.
        if (idx < cur.length) {
          idx++;
        }
      } else if (tag === "\\") {
        // "\ No newline at end of file" — ignored for v1
      }
    }
  }
  while (idx < cur.length) {
    original.push(cur[idx++]);
  }
  return original.join("\n");
}
