# Plan: Extensión de VSCode para opencode

> Estado: **borrador / lluvia de ideas** — este documento es el espacio para pensar
> la extensión antes de escribir una sola línea de código.

## 1. Objetivo

Construir una extensión de VSCode que integre a **opencode** como un ciudadano de
primera clase dentro del editor, para **no depender de abrir la terminal de WSL**
cada vez (nueva shell, nueva sesión, volver a lanzar `opencode`, etc.).

La meta ideal: un botón / comando en VSCode que abra opencode en un panel propio
(webview), con contexto del editor (archivo activo, selección), y que permita ver
y aplicar los cambios sin salir de la interfaz.

## 2. Problema que queremos resolver

Hoy el flujo es manual:

1. Abrir la terminal integrada de VSCode (que apunta a WSL).
2. Ejecutar `opencode` (o `opencode serve`).
3. Trabajar en una interfaz de terminal dentro del editor.
4. Repetir cada sesión.

Molestias:
- "Nueva shell, nueva sesión" cada vez.
- El TUI vive dentro de la terminal, no se siente "nativo".
- No hay integración visual con el editor (diffs, hover, decorators).

## 3. Arquitectura propuesta

La buena noticia: opencode **ya está diseñado como cliente-servidor**.

```
┌───────────────────────────── VSCode ─────────────────────────────┐
│                                                                  │
│  ┌──────────────┐     ┌─────────────────────────────────────┐    │
│  │  UI (webview)│     │  Extensión (extension host, TS)     │    │
│  │  chat, diffs │◄───►│  - comandos, paleta de comandos     │    │
│  │  etc.        │     │  - API completa de VSCode:          │    │
│  └──────────────┘     │    WorkspaceEdit, decorations, ...  │    │
│                       └──────────────┬──────────────────────┘    │
└──────────────────────────────────────┼───────────────────────────┘
                                       │ HTTP/SSE (JSON)
                                       │ @opencode-ai/sdk
                        ┌──────────────▼──────────────────────┐
                        │  opencode serve  (WSL, en el repo)   │
                        │  sesiones, tools, files, eventos     │
                        └─────────────────────────────────────┘
```

Piezas:

| Pieza | Qué es | Rol |
|---|---|---|
| **opencode server** | `opencode serve` (binario) | Cerebro: sesiones, modelo, tools, diffs. Expone API OpenAPI 3.1 + eventos SSE. |
| **@opencode-ai/sdk** | Cliente TS tipo-safe | Permite a la extensión crear sesiones, enviar prompts, revertir, leer archivos, suscribirse a eventos. |
| **Extensión VSCode** | TS en el extension host | Orquesta todo: gestiona el ciclo de vida del server, manda UI, aplica cambios al workspace. |
| **Webview / panel** | UI propia (HTML/JS/TS) | Chat con opencode dentro de VSCode (alternativa al TUI). |

### 3.1 Dónde corre cada proceso (importante en WSL2)

- **VSCode** puede correr en Windows **o** conectado a WSL (Remote-WSL).
- En Remote-WSL, el **extension host corre dentro de WSL** → la extensión puede
  lanzar `opencode serve` directamente como un proceso local. **Este es el camino
  limpio y recomendado.**
- Si la extensión corriera en el lado Windows, tendría que invocar
  `wsl.exe -d <distro> ...` o conectar por red (WSL2 tiene forwarding de
  localhost, pero añade fricción y casos límite). Evitar salvo que haga falta.

> Decisión pendiente: apuntar a **Remote-WSL** como objetivo principal.

## 4. Experiencia de usuario deseada (UI/UX)

Flujo "pantalla perfecta":

1. Instalas la extensión.
2. Pulsas el botón **OpenCode** en la barra de actividades (o `Ctrl+Shift+O`).
3. Se abre un panel con un chat. Sin terminal, sin `opencode` a mano.
4. Escribes "refactoriza X usando el patrón de Y".
5. La extensión:
   - Crea una sesión (o reusa la activa) vía SDK.
   - Muestra el flujo en vivo (stream de eventos SSE).
   - Aplica los cambios usando `WorkspaceEdit` de VSCode (que queda en el
     historial de *Undo* del editor).
   - Muestra un diff inline antes de aplicar, si se quiere.
6. El contexto se pasa automáticamente: archivo activo + selección.

Detalles a explorar:
- Diffs inline en el editor (decorators de colores verde/rojo) o en un webview.
- Botón "aceptar / descartar" por archivo.
- Estado de la sesión persistido (retomar sesiones anteriores).
- Atajos: `@archivo` para referenciar archivos (como el `Alt+Ctrl+K` actual).

## 5. Fases de implementación (roadmap)

### Fase 0 — Spikes y validación (antes de escribir la extensión)
- [ ] Probar `opencode serve --port 4096` en WSL y ver el spec en `http://localhost:4096/doc`.
- [ ] Probar un script Node mínimo que hable con el server vía SDK:
      crear sesión → mandar prompt → leer respuesta y diff.
- [ ] Probar que el server queda vivo en background (¿nohup/systemd en WSL?).
- [ ] Decidir: ¿Remote-WSL solo, o soportar también Windows nativo?

### Fase 1 — Esqueleto de la extensión
- [ ] Scaffold de extensión TS (`yo code` o plantilla manual).
- [ ] Comando "OpenCode: abrir panel" que lance un webview simple.
- [ ] Gestión del ciclo de vida del server: detectar si `opencode serve` corre,
      si no, lanzarlo (en WSL) y esperar a que esté healthy (`/global/health`).
- [ ] Configuración (`package.json` `contributes.configuration`): puerto,
      distro WSL, ruta del binario, auto-arrancar server.

### Fase 2 — Chat básico funcional
- [ ] Webview con historial de mensajes + input.
- [ ] Enviar prompt vía `client.session.prompt()` y mostrar respuesta.
- [ ] Suscribirse a `/event` (SSE) para streaming en vivo.
- [ ] Inyectar contexto del editor activo (ruta + selección).

### Fase 3 — Aplicar cambios de verdad
- [ ] Recibir diffs de la sesión (`/session/:id/diff`).
- [ ] Aplicarlos con `WorkspaceEdit` (queda en el *Undo* de VSCode).
- [ ] Vista de "cambios propuestos" con aceptar/descartar por archivo.

### Fase 4 — Pulido
- [ ] Decorators de línea para cambios en vivo.
- [ ] Icono en la barra de actividades, botones en el editor.
- [ ] Gestión de permisos (las peticiones de permisos del server → notificación VSCode).
- [ ] Manejo de errores robusto (server muerto, reconexión).

## 6. Decisiones abiertas (por responder)

1. **¿Objetivo principal: Remote-WSL o Windows nativo?** (recomendado: Remote-WSL)
2. **¿UI en webview propio o reutilizar el TUI en un panel de terminal?**
   - Un TUI en terminal integrada es *mucho* más barato de hacer y ya funciona.
   - Un webview es lo "nativo" pero es un frontend entero que mantener.
   - Opción intermedia: empezar con TUI embebido y migrar a webview después.
3. **¿Reemplazar la extensión oficial o ser un fork/alternativa?**
4. **¿Publicar en el Marketplace o usarla solo localmente?** (`.vsix`) — **Decidido:** NO Marketplace (hay que pagar 20$/mes). Solo repo + GitHub Releases (el workflow `release.yml` adjunta el `.vsix` a cada tag).
5. **¿Soporte de Cursor / VSCodium?**

## 7. Riesgos y consideraciones

- **WSL2 networking**: si la extensión corre en Windows, el acceso al server en WSL
  puede tener casos límite (IPs, DNS, firewall). Preferir Remote-WSL.
- **Ciclo de vida del server**: hay que definir bien cuándo arrancar/matar
  `opencode serve` (¿al abrir workspace? ¿bajo demanda? ¿persistente?).
- **Seguridad**: el server expone una API sin auth por defecto. Si escucha en un
  puerto local está OK, pero no exponerlo fuera. Opcional: `OPENCODE_SERVER_PASSWORD`.
- **Nunca subir tokens/API keys a git** (aplica a cualquier credencial del proyecto).
- **Un proyecto por carpeta**: esta carpeta será su propio repo git.

## 8. Recursos de referencia

- Server API: https://opencode.ai/docs/server/
- SDK (JS/TS): https://opencode.ai/docs/sdk/
- Extensión oficial (IDE): https://opencode.ai/docs/ide/
- Ejemplos ya construidos sobre el SDK:
  - opencode.nvim (editor-aware): https://github.com/NickvanDyke/opencode.nvim
  - OpenChamber (web/desktop + VS Code ext): https://github.com/btriapitsyn/openchamber
  - OpenWork (Claude Cowork alternativo): https://github.com/different-ai/openwork
  - kimaki (bot Discord): https://github.com/remorses/kimaki
- Ecosistema completo: https://opencode.ai/docs/ecosystem/

## 9. Primeras acciones concretas

1. Revisar este plan y resolver las "Decisiones abiertas" (§6).
2. Ejecutar la **Fase 0** (spikes) para validar que la conexión server↔SDK funciona.
3. Decidir entre "TUI embebido" vs "webview" como primera entrega.
4. Inicializar repo git en esta carpeta cuando arranquemos el código.
