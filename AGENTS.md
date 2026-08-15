# AGENTS.md — opencode-vscode

> Soy yo, el agente que trabaja en este repo. Esto es mi memoria de trabajo:
> qué es el proyecto, qué aprendí a las malas y cómo me gusta operar. Si llega
> otro agente después, que lo lea como si fuera suyo.

## Qué es esto

`opencode-vscode` lleva a opencode dentro de VS Code como ciudadano del
editor, no como una sesión de terminal: chat con streaming, contexto del
editor, diffs nativos y permisos como notificaciones. Target principal:
Remote-WSL, donde la extensión vive en el extension host y habla directo con
el servidor opencode.

## Stack y decisiones que no voy a renegar

- TypeScript estricto, empaquetado con esbuild en un único bundle CJS de salida (con `vscode` como dependencia externa).
- Cliente del servidor vía el paquete SDK @opencode-ai/sdk (solo ESM, imports sin extensión): siempre bundle, nunca `node` plano.
- `OpencodeClient` no se exporta del SDK → uso `ReturnType<typeof createOpencodeClient>`.
- Los diffs no vienen en el SDK → `SdkClient.getSessionDiff()` pega un fetch directo al endpoint `session.diff`.
- `session.chat()` no bloquea: el fin de turno se deduce de los eventos del stream SSE.
- `message.part.updated` entrega el texto COMPLETO de la parte (reemplazar, no concatenar) y también emite para mensajes de usuario → filtrar por IDs de mensaje del assistant.
- El body de chat pide `providerID` + `modelID` (resueltos desde `config.providers()`).
- Los artefactos de build, los `*.vsix` y `node_modules` no se versionan.

## Mapa del código

- `src/extension.ts` — entrada: activate/deactivate, 7 comandos, status bar y `__internals` (solo para tests).
- `src/server.ts` — ServerManager: conecta a un `opencode serve` existente o lo levanta en el workspace; SSE con reconexión.
- `src/sdkClient.ts` — wrapper tipado del SDK: sesiones, chat, revert, permisos, modelo por defecto y diffs.
- `src/chatPanel.ts` — webview de chat con streaming.
- `src/patch.ts` y `src/diffs.ts` — reverse-apply de unified diff + provider virtual `opencode-diff` para el diff nativo.
- `src/permissions.ts` — `permission.updated` → notificaciones de VS Code (once, always o reject).
- `src/context.ts`, `src/protocol.ts`, `src/config.ts`, `src/logger.ts` — contexto del editor, protocolo webview, configuración y log.

## Cómo trabajo (mis reglas)

- Cambios por ramas feat o fix → PR → merge a `main`. Commits pequeños, atómicos y con mensajes claros.
- No fuerzo archivos ignorados (el gitignore global del usuario ignora la carpeta de configuración del editor) ni subo secretos.
- Antes de dar una tarea por cerrada: `npm test` en verde y el contexto saneado (ver abajo).

## Sanitización con repoctx (siempre)

- Después de tocar los scripts de `package.json` o la estructura de módulos: `repoctx generate` para regenerar las tablas factuales.
- Antes de commitear o abrir un PR: `repoctx audit --check` (también es guard de CI). Si falla, arreglo el contexto antes de seguir.
- Lo que vive entre los marcadores repoctx lo escribe la herramienta, no yo.

<!-- repoctx:start -->
## Commands

| Command | Source |
|---|---|
| `npm run build` | `package.json` |
| `npm run clean` | `package.json` |
| `npm run package` | `package.json` |
| `npm run publish` | `package.json` |
| `npm run test` | `package.json` |
| `npm run vscode:prepublish` | `package.json` |
| `npm run watch` | `package.json` |

## Modules

| Module | Language | Dependencies |
|---|---|---|
| `package.json` | JavaScript/TypeScript | @opencode-ai/sdk, @types/node, @types/vscode, @vscode/vsce, esbuild, typescript |
<!-- repoctx:end -->
