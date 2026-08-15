// OpenCode chat webview
(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const messagesEl = document.getElementById("messages");
  const inputEl = document.getElementById("input");
  const btnSend = document.getElementById("btn-send");
  const btnStop = document.getElementById("btn-stop");
  const btnNew = document.getElementById("btn-new");
  const btnSessions = document.getElementById("btn-sessions");
  const sessionTitleEl = document.getElementById("session-title");
  const modelLabelEl = document.getElementById("model-label");
  const contextBarEl = document.getElementById("context-bar");

  let sessions = [];
  let models = [];
  let currentModel = null;
  let currentSessionID = null;
  let serverStatus = "connecting";
  let running = false;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderInline(text) {
    // Very small markdown-ish renderer: code blocks, inline code, bold.
    const blocks = [];
    const withoutCode = text.replace(/```[\s\S]*?```/g, (block) => {
      blocks.push(block);
      return `\u0000BLOCK${blocks.length - 1}\u0000`;
    });
    const escaped = escapeHtml(withoutCode);
    let html = escaped
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br>");
    html = html.replace(/\u0000BLOCK(\d+)\u0000/g, (_, i) => {
      const code = blocks[i].replace(/^```\w*\n?/, "").replace(/\n?```$/, "");
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    });
    return html;
  }

  function findMessage(messageID) {
    return messagesEl.querySelector(`[data-message-id="${CSS.escape(messageID)}"]`);
  }

  function addMessage(messageID, role) {
    const el = document.createElement("div");
    el.className = `message ${role}`;
    el.dataset.messageId = messageID;
    if (role === "assistant") {
      const roleLine = document.createElement("div");
      roleLine.className = "role";
      roleLine.textContent = "OpenCode";
      el.appendChild(roleLine);
      el.appendChild(document.createElement("div")).className = "bubble";
    } else {
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      el.appendChild(bubble);
    }
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function renderHistory(history) {
    messagesEl.innerHTML = "";
    if (!history.length) {
      showEmptyState();
    }
    for (const item of history) {
      const el = addMessage(item.messageID, item.role);
      const bubble = el.querySelector(".bubble");
      if (item.role === "assistant") {
        bubble.innerHTML = renderInline(item.text);
        if (item.toolCount) {
          const tools = document.createElement("div");
          tools.className = "tools";
          tools.appendChild(toolChip(`\u00b7 ${item.toolCount} tool calls`, "completed"));
          el.appendChild(tools);
        }
      } else {
        bubble.textContent = item.text;
      }
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showEmptyState() {
    const el = document.createElement("div");
    el.className = "empty-state";
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.1 6.1 6.4-.1-5.1 3.9 1.9 6.2-5.3-3.8-5.3 3.8 1.9-6.2-5.1-3.9 6.4.1L12 2z"/></svg>' +
      '<div>Ask me to write, change or explain code.<br>Select text in an editor and press "Send Selection".</div>';
    messagesEl.appendChild(el);
  }

  function toolChip(label, status) {
    const chip = document.createElement("span");
    chip.className = `tool-chip ${status || ""}`;
    chip.innerHTML = `<span class="dot"></span>${escapeHtml(label)}`;
    return chip;
  }

  function renderMessageDelta(messageID, text) {
    let el = findMessage(messageID);
    if (!el) {
      el = addMessage(messageID, "assistant");
    }
    const bubble = el.querySelector(".bubble");
    bubble.innerHTML = renderInline(text);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderTool(messageID, tool) {
    let el = findMessage(messageID);
    if (!el) {
      el = addMessage(messageID, "assistant");
    }
    let tools = el.querySelector(".tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.className = "tools";
      el.appendChild(tools);
    }
    let chip = tools.querySelector(`[data-call-id="${CSS.escape(tool.callID)}"]`);
    if (!chip) {
      chip = toolChip(tool.title, tool.status);
      chip.dataset.callId = tool.callID;
      tools.appendChild(chip);
    } else {
      chip.className = `tool-chip ${tool.status || ""}`;
      chip.childNodes[1].textContent = tool.title;
    }
  }

  function addContextChip(label) {
    const chip = document.createElement("span");
    chip.className = "context-chip";
    chip.innerHTML = `<span>${escapeHtml(label)}</span><span class="x" title="Remove">\u00d7</span>`;
    chip.querySelector(".x").addEventListener("click", () => chip.remove());
    contextBarEl.appendChild(chip);
  }

  function updateStatus() {
    const ok = serverStatus === "connected";
    if (!ok) {
      modelLabelEl.textContent = serverStatus === "connecting" ? "connecting\u2026" : "server unavailable";
    } else {
      modelLabelEl.textContent = currentModel ? currentModel.replace("/", " / ") : "select model";
      modelLabelEl.classList.add("enabled");
    }
    modelLabelEl.disabled = !ok || !models.length;
    btnStop.disabled = !running;
    btnStop.classList.toggle("running", running);
    btnSend.disabled = !ok;
  }

  function showModelPicker() {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center;padding-top:10vh;z-index:10;";
    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg);border:1px solid var(--border);border-radius:6px;min-width:340px;max-width:520px;max-height:60vh;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.4);";
    if (!models.length) {
      box.textContent = "No models configured.";
    }
    const currentKey = currentModel;
    for (const m of models) {
      const key = m.providerID + "/" + m.modelID;
      const row = document.createElement("div");
      row.style.cssText = "padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);";
      const name = document.createElement("div");
      name.textContent = m.name;
      const provider = document.createElement("div");
      provider.style.cssText = "font-size:11px;color:var(--muted);";
      provider.textContent = key;
      row.appendChild(name);
      row.appendChild(provider);
      if (key === currentKey) {
        row.style.background = "var(--vscode-list-activeSelectionBackground,#04395e)";
      }
      row.onmouseenter = () => (row.style.background = "var(--vscode-list-hoverBackground,#2a2d2e)");
      row.onmouseleave = () => {
        row.style.background = key === currentKey ? "var(--vscode-list-activeSelectionBackground,#04395e)" : "";
      };
      row.addEventListener("click", () => {
        vscode.postMessage({ type: "selectModel", providerID: m.providerID, modelID: m.modelID });
        overlay.remove();
      });
      box.appendChild(row);
    }
    overlay.appendChild(box);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function showSessionsPicker() {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center;padding-top:10vh;z-index:10;";
    const box = document.createElement("div");
    box.style.cssText =
      "background:var(--bg);border:1px solid var(--border);border-radius:6px;min-width:320px;max-height:60vh;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.4);";
    if (!sessions.length) {
      box.textContent = "No sessions yet.";
    }
    for (const s of sessions) {
      const row = document.createElement("div");
      row.style.cssText =
        "padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;";
      const title = document.createElement("span");
      title.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      title.textContent = s.title;
      row.appendChild(title);
      const del = document.createElement("button");
      del.title = "Delete session";
      del.innerHTML = "&#10005;";
      del.style.cssText = "color:var(--muted);font-size:12px;";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Delete session "${s.title}"?`)) {
          vscode.postMessage({ type: "deleteSession", id: s.id });
          overlay.remove();
        }
      });
      row.appendChild(del);
      if (s.id === currentSessionID) {
        row.style.background = "var(--vscode-list-activeSelectionBackground,#04395e)";
      }
      row.onmouseenter = () => (row.style.background = "var(--vscode-list-hoverBackground,#2a2d2e)");
      row.onmouseleave = () => {
        row.style.background = s.id === currentSessionID ? "var(--vscode-list-activeSelectionBackground,#04395e)" : "";
      };
      row.addEventListener("click", () => {
        vscode.postMessage({ type: "selectSession", id: s.id });
        overlay.remove();
      });
      box.appendChild(row);
    }
    overlay.appendChild(box);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = "";
    inputEl.style.height = "auto";
    vscode.postMessage({ type: "send", text });
  }

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
  });
  btnSend.addEventListener("click", send);
  btnNew.addEventListener("click", () => vscode.postMessage({ type: "newSession" }));
  btnStop.addEventListener("click", () => vscode.postMessage({ type: "stop" }));
  btnSessions.addEventListener("click", showSessionsPicker);
  modelLabelEl.addEventListener("click", showModelPicker);

  window.addEventListener("message", (e) => {
    const msg = e.data;
    switch (msg.type) {
      case "status":
        serverStatus = msg.payload.server;
        running = Boolean(msg.payload.running);
        currentSessionID = msg.payload.sessionID || currentSessionID;
        if (msg.payload.model) {
          currentModel = msg.payload.model;
          modelLabelEl.title = msg.payload.model;
        }
        updateStatus();
        break;
      case "sessions":
        sessions = msg.payload || [];
        break;
      case "models":
        models = msg.payload || [];
        updateStatus();
        break;
      case "history":
        renderHistory(msg.payload || []);
        break;
      case "userMessage":
        addMessage(msg.payload.messageID, "user").querySelector(".bubble").textContent = msg.payload.text;
        break;
      case "assistant":
        renderMessageDelta(msg.payload.messageID, msg.payload.text);
        break;
      case "delta":
        renderMessageDelta(msg.payload.messageID, msg.payload.text);
        break;
      case "tool":
        renderTool(msg.payload.messageID, msg.payload);
        break;
      case "context":
        addContextChip(msg.payload.label);
        break;
      case "error":
        const banner = document.createElement("div");
        banner.className = "error-banner";
        banner.textContent = msg.payload.message;
        messagesEl.appendChild(banner);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        break;
      case "notice":
        const info = document.createElement("div");
        info.className = "notice-banner";
        info.textContent = msg.payload.message;
        messagesEl.appendChild(info);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        setTimeout(() => info.remove(), 4000);
        break;
    }
  });

  vscode.postMessage({ type: "ready" });
})();
