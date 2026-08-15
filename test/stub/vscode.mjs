// Minimal VS Code API stub used to run the extension host logic in plain Node
// for integration testing. It intentionally mirrors only what the extension
// uses, so a missing API surfaces as a real error during activate().

class Disposable {
  dispose() {}
}

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return new Disposable();
    };
  }
  fire(value) {
    for (const fn of this.listeners) fn(value);
  }
  dispose() {
    this.listeners.clear();
  }
}

const noop = () => undefined;
const eventHandlers = [];
let commands = [];

function createStatusBarItem(alignment, priority) {
  return { alignment, priority, text: "", tooltip: "", command: "", show: noop, dispose: noop };
}

function createOutputChannel(name) {
  return { name, appendLine: () => {}, append: () => {}, show: noop, dispose: noop };
}

function createWebviewPanel(viewType, title, viewColumn, options) {
  return {
    viewType,
    title,
    viewColumn,
    options,
    webview: {
      html: "",
      asWebviewUri: (u) => ({ toString: () => `vscode-resource://stub/${u.path}` }),
      onDidReceiveMessage: (fn) => eventHandlers.push(fn),
      postMessage: noop,
    },
    iconPath: undefined,
    reveal: noop,
    onDidDispose: () => new Disposable(),
    dispose: noop,
  };
}

const configuration = {
  get(section, fallback) {
    const map = {
      "server.port": 4096,
      "server.autoStart": true,
      "server.binaryPath": "opencode",
      "server.startArgs": [],
      "chat.autoRevealPanel": true,
    };
    return map[section] ?? fallback;
  },
};

const commandsRecord = {};
function registerCommand(name, fn) {
  commandsRecord[name] = fn;
  commands.push(name);
  return new Disposable();
}

function uriFrom(pathStr) {
  return {
    path: pathStr,
    fsPath: pathStr,
    scheme: "file",
    toString: () => `file://${pathStr}`,
  };
}

export const vscode = {
  Uri: {
    file: uriFrom,
    joinPath: (base, ...segments) => uriFrom([base.path, ...segments].join("/")),
    from: (parts) => uriFrom(parts.path ?? ""),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.env.OC_TEST_ROOT, path: process.env.OC_TEST_ROOT, toString: () => "file://" + process.env.OC_TEST_ROOT } }],
    getConfiguration: (section) => ({
      get: (key, fallback) => configuration.get(`${section}.${key}`, fallback),
    }),
    fs: { readFile: async (uri) => new Uint8Array(), writeFile: noop, stat: async () => ({}) },
    textDocuments: [],
    registerTextDocumentContentProvider: () => new Disposable(),
    onDidOpenTextDocument: () => new Disposable(),
  },
  window: {
    createStatusBarItem,
    createOutputChannel,
    createWebviewPanel,
    activeTextEditor: undefined,
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showErrorMessage: async () => undefined,
    setStatusBarMessage: noop,
  },
  commands: {
    registerCommand,
    executeCommand: async () => undefined,
    getCommands: async () => [],
  },
  StatusBarAlignment: { Left: 1, Right: 2 },
  ViewColumn: { One: 1, Two: 2 },
  EventEmitter,
  Disposable,
};

export function getStubState() {
  return { commands, eventHandlers, commandsRecord };
}
