import * as vscode from "vscode";

export interface FileHighlights {
  path: string;
  added: number[];
  removed: number[];
}

/**
 * Paints inline change highlights (added / removed lines) on the editors of
 * changed files, complementing the native diff view.
 */
export class DiffDecorations implements vscode.Disposable {
  private readonly highlights = new Map<string, FileHighlights>();

  private readonly addedType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(46, 160, 67, 0.18)",
    overviewRulerColor: "rgba(46, 160, 67, 0.6)",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  private readonly removedType = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: "rgba(248, 81, 73, 0.18)",
    overviewRulerColor: "rgba(248, 81, 73, 0.6)",
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  set(highlights: FileHighlights): void {
    this.highlights.set(highlights.path, highlights);
    this.applyToPath(highlights.path);
  }

  clear(path: string): void {
    this.highlights.delete(path);
    this.applyToPath(path);
  }

  clearAll(): void {
    for (const path of this.highlights.keys()) {
      this.applyToPath(path);
    }
    this.highlights.clear();
  }

  /** Re-applies stored highlights to every visible editor (e.g. on focus change). */
  applyToActive(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToPath(editor.document.uri.fsPath);
    }
  }

  private applyToPath(path: string): void {
    const highlight = this.highlights.get(path);
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.fsPath !== path) {
        continue;
      }
      const lineCount = editor.document.lineCount;
      if (highlight) {
        editor.setDecorations(this.addedType, this.lineRanges(highlight.added, lineCount));
        editor.setDecorations(this.removedType, this.lineRanges(highlight.removed, lineCount));
      } else {
        editor.setDecorations(this.addedType, []);
        editor.setDecorations(this.removedType, []);
      }
    }
  }

  private lineRanges(lines: number[], lineCount: number): vscode.Range[] {
    const ranges: vscode.Range[] = [];
    for (const line of lines) {
      if (line < 1 || line > lineCount) {
        continue;
      }
      ranges.push(new vscode.Range(line - 1, 0, line - 1, Number.MAX_SAFE_INTEGER));
    }
    return ranges;
  }

  dispose(): void {
    this.addedType.dispose();
    this.removedType.dispose();
    this.highlights.clear();
  }
}
