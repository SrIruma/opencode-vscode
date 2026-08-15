import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { vscode as stub, getStubState } from "./stub/vscode.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Pretend `vscode` is resolvable from the extension bundle.
const Module = require("module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return stub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const ext = require(path.join(projectRoot, "dist", "extension.js"));
const { commands } = getStubState();
const extUri = { path: projectRoot, fsPath: projectRoot, toString: () => "file://" + projectRoot };
const context = { extensionUri: extUri, subscriptions: [], workspaceState: {}, globalState: {} };

before(async () => {
  process.env.OC_TEST_ROOT = projectRoot;
  await ext.activate(context);
  // Give the async server connection a moment to settle.
  await new Promise((r) => setTimeout(r, 4000));
});

after(() => {
  // Close the event stream so the Node process can exit.
  ext.deactivate();
  void ext.__internals.server.dispose();
});

test("activate() registers all commands", () => {
  for (const cmd of [
    "opencode.openChat",
    "opencode.newSession",
    "opencode.sendSelection",
    "opencode.referenceActiveFile",
    "opencode.stopSession",
    "opencode.showDiff",
    "opencode.reconnectServer",
  ]) {
    assert.ok(commands.includes(cmd), `missing command ${cmd}`);
  }
});

test("autoStart connects to an existing opencode server", () => {
  assert.equal(ext.__internals.server.currentStatus, "connected");
});

test("sdk can list sessions and resolve a default model", async () => {
  const sdk = ext.__internals.sdk;
  const model = await sdk.defaultModel();
  assert.ok(model?.providerID, "expected a default provider");
  assert.ok(model?.modelID, "expected a default model");
  const sessions = await sdk.listSessions();
  assert.ok(Array.isArray(sessions));
});
