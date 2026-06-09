<p align="center">
  <img src="web-ui/public/avatar.png" width="100" height="100" style="border-radius:50%" />
</p>

<h1 align="center">MCP Chat</h1>

<p align="center">
  <strong>Turn your IDE's AI into ChatGPT + OpenAI API</strong><br/>
  An MCP Server that gives your IDE AI a Web chat interface and a standard API
</p>

<p align="center">
  <a href="https://github.com/maile456/mcp-chat/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maile456/mcp-chat" alt="License" /></a>
  <a href="https://github.com/maile456/mcp-chat/stargazers"><img src="https://img.shields.io/github/stars/maile456/mcp-chat" alt="Stars" /></a>
  <a href="https://github.com/maile456/mcp-chat/issues"><img src="https://img.shields.io/github/issues/maile456/mcp-chat" alt="Issues" /></a>
</p>

<p align="center">
  English · <a href="./README.md">中文</a>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#ide-setup">IDE Setup</a> ·
  <a href="#openai-compatible-api">API</a> ·
  <a href="#use-cases">Use Cases</a> ·
  <a href="#architecture">Architecture</a>
</p>

---

## Screenshots

### Web UI

<p align="center">
  <img src="web-ui/public/image.png" width="800" />
</p>

### QQ Bot Integration (NapCat + OpenAI API)

<p align="center">
  <img src="web-ui/public/qqBot.jpg" width="400" />
</p>

> Powered by [NapCat](https://github.com/NapNeko/NapCatQQ) + MCP Chat's OpenAI-compatible API, enabling QQ chatbot conversations with your IDE AI.

---

## What It Does

```
Your IDE (Windsurf / Cursor / Copilot / Claude Code)
        ↕ MCP Protocol
   ┌────────────────┐
   │   server.py    │--> Web UI (multi-session chat)
    │  (MCP Gateway)  │--> OpenAI / Anthropic-compatible API (/v1/chat/completions · /v1/responses · /v1/messages)
   │                │--> WebSocket real-time updates
   └────────────────┘
         ↕
  Chatbots / Continue plugin / Automation scripts / ...
```

### Core Principle: One Conversation, Unlimited Calls

MCP Chat uses the MCP protocol to put the IDE's AI into a **chat() loop** — essentially one never-ending conversation. Within this conversation, external clients can interact with the AI unlimited times via Web UI or API.

Different IDEs have different billing models, so the effect varies:

| IDE | Billing Model | With MCP Chat |
|-----|--------------|---------------|
| **GitHub Copilot** | Per request (Agent mode unlimited) | ✅ **Fully unlimited** in Agent mode — each interaction costs 1 request, but there's no cap |
| **Cursor Pro** | Monthly quota (fast/slow requests) | ✅ Slows down after quota but **never stops** — keeps working within the conversation |
| **Windsurf Pro** | Credits-based quota | ⚠️ Consumes credits, need to wait for refresh when depleted |
| **Claude Code** | Per API token | ⚠️ Each interaction consumes tokens, pay-as-you-go |

> 💡 **Best combo: GitHub Copilot (unlimited requests) + MCP Chat = Free unlimited AI API service**

<details>
<summary>📸 See it in action — one Copilot conversation, chat() looping forever</summary>
<p align="center">
  <img src="web-ui/public/mcp-chat.png" width="400" />
</p>
</details>

### Features

- **Web UI** — Chat with your IDE AI in the browser. Markdown rendering, syntax highlighting, image upload, multi-session management.
- **OpenAI / Anthropic-compatible API** — Supports `/v1/chat/completions`, `/v1/responses`, and `/v1/messages` with streaming support. Works with OpenAI SDK and Anthropic SDK clients.
- **Multi-IDE support** — Windsurf, Cursor, GitHub Copilot, Claude Code / Desktop can connect simultaneously with independent sessions.
- **Real-time progress** — AI pushes live status updates via `stream_update()` during work (reading files, running commands, etc.).
- **Work trace logging** — Record the AI's full workflow via the `trace` parameter. The frontend displays collapsible thinking → search → edit → verify flows.
- **Session persistence** — All sessions are automatically saved to `~/.mcp-chat/sessions/`. History survives restarts.
- **Dark / Light theme** — One-click theme toggle, driven by CSS variables.
- **Zero-config startup** — Web UI is pre-built. Just install Python dependencies and run.
- **Single-file backend** — The entire server is one `server.py`. No framework dependencies. Easy to understand and extend.

---

## Quick Start

### Install

```bash
git clone https://github.com/maile456/mcp-chat.git
cd mcp-chat

# Install Python dependencies
pip install mcp[cli] websockets

# Start the server
python server.py
```

> The Web UI is pre-built in `web-ui/dist/`. No Node.js required.
> To modify the frontend: `cd web-ui && npm install && npm run build`

### Startup Output

```
[MCP Chat] API endpoint: http://127.0.0.1:8080/v1/chat/completions
[MCP Chat] Responses endpoint: http://127.0.0.1:8080/v1/responses
[MCP Chat] Anthropic endpoint: http://127.0.0.1:8080/v1/messages
[MCP Chat] Models endpoint: http://127.0.0.1:8080/v1/models
INFO     Application startup complete.
```

| URL | Description |
|-----|-------------|
| http://127.0.0.1:8080 | Web UI |
| http://127.0.0.1:8080/mcp | MCP endpoint (IDE connects here) |
| http://127.0.0.1:8080/v1/chat/completions | OpenAI-compatible API |
| http://127.0.0.1:8080/v1/responses | OpenAI Responses API |
| http://127.0.0.1:8080/v1/messages | Anthropic Messages API |
| ws://127.0.0.1:8081 | WebSocket real-time updates |

---

## IDE Setup

Copy the JSON below into the corresponding config file.

### Windsurf

File: `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "mcp-chat": {
      "serverUrl": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

### Cursor

File: `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "mcp-chat": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

### VS Code (GitHub Copilot)

File: `~/.vscode/mcp.json`

```json
{
  "servers": {
    "mcp-chat": {
      "type": "http",
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

<details>
<summary>Recommended Copilot settings</summary>

Add to your project's `.vscode/settings.json`:

```json
{
  "chat.tools.global.autoApprove": true,
  "chat.tools.terminal.autoApprove": { ".*": true },
  "github.copilot.chat.agent.maxRequests": 99999
}
```
</details>

### Claude Code

```bash
claude mcp add mcp-chat --transport http http://127.0.0.1:8080/mcp
```

### Claude Desktop

File: `%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

**Option 1: HTTP transport (recommended, requires server.py running)**

```json
{
  "mcpServers": {
    "mcp-chat": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

**Option 2: Stdio transport (auto-starts server)**

```json
{
  "mcpServers": {
    "mcp-chat": {
      "command": "python",
      "args": ["/path/to/mcp-chat/server.py"],
      "env": {}
    }
  }
}
```

---

## Usage

After configuring your IDE, tell the AI:

```
Call get_prompt to get the workflow, then call the chat tool to talk with me
```

The AI will enter a loop: **send message to Web UI → wait for your reply → execute tasks → send another message → ...**

Open `http://127.0.0.1:8080` in your browser to start chatting.

---

## OpenAI / Anthropic-compatible API

Once the AI enters the chat() loop in your IDE, you can interact with it via OpenAI-compatible and Anthropic-compatible APIs.

### curl

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"cascade","messages":[{"role":"user","content":"Hello"}]}'

# OpenAI Responses
curl http://127.0.0.1:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.3-codex","input":"Hello"}'

# Anthropic Messages
curl http://127.0.0.1:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

### Python

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="no-key")

# Regular request
r = client.chat.completions.create(
    model="cascade",
    messages=[{"role": "user", "content": "Hello"}]
)
print(r.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="cascade",
    messages=[{"role": "user", "content": "Write a quicksort"}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### API Authentication (Optional)

```bash
# Set environment variable to enable API key
MCP_API_KEY=your-secret-key python server.py
```

```python
client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="your-secret-key")
```

---

## Use Cases

| Scenario | Description |
|----------|-------------|
| **Personal AI assistant** | Chat with your IDE AI in the browser, free from IDE interface constraints |
| **QQ Bot** | Connect to QQ via NapCat + OpenAI API for an AI chatbot |
| **VS Code + Continue** | Colleagues use the Continue extension in VS Code with your API for a Copilot-like experience |
| **Automation** | CI/CD code review, batch document generation, etc. |

---

## Architecture

```
mcp-chat/
├── server.py              # Core server (MCP + HTTP + WebSocket + API)
├── web-ui/                # Vue 3 + TailwindCSS frontend
│   ├── src/
│   │   ├── components/    # Vue components
│   │   ├── composables/   # Composables
│   │   └── App.vue
│   ├── dist/              # Pre-built assets (ready to use)
│   └── package.json
└── README.md
```

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Backend** | Python · FastMCP · Starlette · WebSocket |
| **Frontend** | Vue 3 · TailwindCSS · Markdown-it · Highlight.js · Lucide Icons |
| **Protocols** | MCP (Streamable HTTP) · WebSocket · SSE |
| **API** | OpenAI Chat Completions compatible |

### MCP Tools

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_prompt` | — | Returns the chat workflow rules |
| `chat` | `ai_message` (required), `model`, `source`, `project`, `trace` | Send a message to Web UI and wait for user reply |
| `stream_update` | `status` (required), `summary`, `detail`, `tool_name`, `source`, `project` | Push real-time progress to Web UI (non-blocking) |

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI-compatible Chat API |
| POST | `/v1/responses` | OpenAI-compatible Responses API |
| POST | `/v1/messages` | Anthropic-compatible Messages API |
| GET | `/v1/models` | Model list |
| POST | `/mcp` | MCP Streamable HTTP endpoint |
| GET | `/poll` | Long-polling state updates |
| POST | `/submit` | Submit user reply |
| GET | `/history` | Get session history |

---

## FAQ & How It Works

<details>
<summary><strong>How does it work?</strong></summary>

MCP Chat registers a `chat()` tool. When the IDE's AI calls this tool, server.py pushes the AI's message to the Web UI and **blocks until** the user replies. Once the user replies, the tool returns the response to the AI, which processes it and calls `chat()` again — forming an infinite loop.

```
AI calls chat("Hello") → server pushes to Web UI → user replies "Write me some code"
→ chat() returns user's reply → AI processes and calls chat("Here's the code...") → ...
```

From the IDE's perspective, this is just "one conversation repeatedly calling the same tool", so it only consumes one conversation's quota.
</details>

<details>
<summary><strong>Why is Copilot unlimited?</strong></summary>

GitHub Copilot's Agent mode allows the AI to call tools unlimited times within a single conversation (`maxRequests` can be set to 99999). Each `chat()` call counts as 1 request, but Agent mode has no cap, so the loop runs forever.

Other IDEs work too, but with limitations: Cursor throttles after quota, Windsurf consumes credits, Claude Code charges per token.
</details>

<details>
<summary><strong>How do the OpenAI / Anthropic APIs work?</strong></summary>

server.py has built-in `/v1/chat/completions`, `/v1/responses`, and `/v1/messages` endpoints. When an API request arrives, the server injects the message into the current chat() loop, waits for the AI to respond, and returns the result in the corresponding format. Both streaming (SSE) and non-streaming responses are supported.

Essentially: **External API request → server forwards to IDE AI → AI responds → server wraps in OpenAI/Anthropic format and returns**.
</details>

<details>
<summary><strong>Do I need to keep the IDE open?</strong></summary>

The Web UI is always available (view history, manage sessions). But for AI responses, the IDE must have an AI running in the chat() loop. Same for the API — requests will timeout if no AI is online.
</details>

<details>
<summary><strong>Which models are supported?</strong></summary>

Whatever your IDE subscription provides. MCP Chat is model-agnostic — if the IDE uses GPT-4o, so does MCP Chat. For example, Copilot supports GPT-4o, Claude Sonnet, Gemini, etc.; Cursor supports Claude and GPT series.
</details>

<details>
<summary><strong>Can multiple users use it simultaneously?</strong></summary>

The Web UI supports multiple sessions — each user can chat independently. However, each IDE connection can only handle one chat() loop at a time. For concurrent multi-user access, run multiple IDE instances, each with its own server.
</details>

---

## Recommended User Rules

Add the following to your IDE's User Rules (e.g., Cursor) so the AI proactively manages context during long conversations:

```markdown
## Auto Context Compression

If the conversation becomes long (many tool calls, large file reads), 
and you sense context is getting heavy, call compress_context() proactively.
After compression, resume work normally — use chat() to continue the conversation.
mcp-chat session history is persisted independently and won't be affected.
```

---

## Contributing

Issues and Pull Requests are welcome!

```bash
# Frontend development
cd web-ui && npm install && npm run dev

# Backend
python server.py
```

---

## ⭐ Star

If this project helps you, please give it a Star ⭐ !

[![Star History Chart](https://api.star-history.com/svg?repos=maile456/mcp-chat&type=Date)](https://star-history.com/#maile456/mcp-chat&Date)

---

## License

[MIT](./LICENSE)
