# AGENTS.md — opencode-vscode

Extensión nativa de VS Code para opencode (agente de codificación por IA).
Apuntado a Remote-WSL: el servidor opencode corre dentro de WSL y la
extensión se ejecuta en el extension host remoto.

## Contexto del proyecto

- Proyecto TypeScript estricto, empaquetado con esbuild (un solo `dist/extension.js` CJS, `vscode` queda externo).
- Cliente del servidor opencode vía el paquete SDK @opencode-ai/sdk (solo ESM, imports sin extensión → requiere bundling, no se puede importar con `node` plano).
- El SDK no exporta el tipo `OpencodeClient`: usar `ReturnType<typeof createOpencodeClient>`.
- El SDK no expone el endpoint de diffs: `SdkClient.getSessionDiff()` hace `fetch` directo al endpoint `session.diff`.
- `session.chat()` NO bloquea hasta terminar; el streaming y el fin de turno se derivan de los eventos del stream SSE de eventos.
- `message.part.updated` trae el texto COMPLETO de la parte (reemplazar, no concatenar) y también se emite para mensajes de usuario: filtrar por IDs de mensaje del assistant.
- El body de chat requiere `providerID` + `modelID` (resueltos desde `config.providers()`).
- `dist/`, `*.vsix`, `node_modules` y `.test-out/` no se versionan.

## Arquitectura (módulos en `src/`)

- `src/extension.ts` — punto de entrada: activate/deactivate, 7 comandos, status bar, export `__internals` (solo tests).
- `src/server.ts` — `ServerManager`: conecta a un `opencode serve` existente o lo lanza en el workspace; SSE con reconexión.
- `src/sdkClient.ts` — wrapper tipado del SDK: sesiones, chat, revert, permisos, modelo por defecto, `getSessionDiff()`.
- `src/chatPanel.ts` — WebviewPanel de chat con streaming.
- `src/patch.ts` + `src/diffs.ts` — reverse-apply de unified diff y provider de documento virtual `opencode-diff` para el diff nativo de VS Code.
- `src/permissions.ts` — `permission.updated` → notificaciones de VS Code (once/always/reject).
- `src/context.ts` — contexto del editor (archivo activo + selección).
- `src/protocol.ts` — tipos del protocolo webview↔host.
- `src/config.ts` / `src/logger.ts` — configuración y logging.

## Convenciones

- Nuevas features y fixes van por ramas feat/fix → PR → merge a `main`.
- No forzar archivos ignorados (el gitignore global del usuario ignora `.vscode/`).
- No subir secretos.

<!-- repoctx:start -->
## Commands

| Command | Source |
|---|---|
| `npm run build` | `package.json` |
| `npm run clean` | `package.json` |
| `npm run package` | `package.json` |
| `npm run test` | `package.json` |
| `npm run vscode:prepublish` | `package.json` |
| `npm run watch` | `package.json` |

## Modules

| Module | Language | Dependencies |
|---|---|---|
| `package.json` | JavaScript/TypeScript | @opencode-ai/sdk, @types/node, @types/vscode, @vscode/vsce, esbuild, typescript |
<!-- repoctx:end -->
