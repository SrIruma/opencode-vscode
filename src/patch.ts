interface Hunk {
  newStart: number;
  body: string[];
}

export interface ChangedLines {
  added: number[];
  removed: number[];
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

/**
 * Computes the 1-based line numbers of the current file that a patch marks as
 * added or removed, so they can be highlighted inline. Added files highlight
 * every line; deleted files and unparseable patches highlight nothing.
 */
export function computeChangedLines(
  patch: string | undefined,
  status: "added" | "modified" | "deleted",
  totalLines: number,
): ChangedLines {
  const added: number[] = [];
  const removed: number[] = [];
  if (status === "added") {
    for (let i = 1; i <= totalLines; i++) {
      added.push(i);
    }
    return { added, removed };
  }
  if (status === "deleted" || !patch) {
    return { added, removed };
  }
  for (const hunk of parseHunks(patch)) {
    let line = hunk.newStart;
    for (const body of hunk.body) {
      const tag = body[0];
      if (tag === "+") {
        added.push(line);
        line += 1;
      } else if (tag === "-") {
        removed.push(line);
      } else if (tag === " ") {
        line += 1;
      }
    }
  }
  return { added, removed };
}
