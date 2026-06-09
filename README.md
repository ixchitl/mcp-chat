
<h1 align="center">MCP Chat</h1>

<p align="center">
  <strong>把 IDE 里的 AI 变成 ChatGPT + OpenAI API</strong><br/>
  一个 MCP Server，让你的 IDE AI 拥有 Web 聊天界面和标准 API
</p>

<p align="center">
  <a href="https://github.com/maile456/mcp-chat/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maile456/mcp-chat" alt="License" /></a>
  <a href="https://github.com/maile456/mcp-chat/stargazers"><img src="https://img.shields.io/github/stars/maile456/mcp-chat" alt="Stars" /></a>
  <a href="https://github.com/maile456/mcp-chat/issues"><img src="https://img.shields.io/github/issues/maile456/mcp-chat" alt="Issues" /></a>
</p>

<p align="center">
  <a href="./README_EN.md">English</a> · 中文
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#ide-配置">IDE 配置</a> ·
  <a href="#openai-兼容-api">API 调用</a> ·
  <a href="#使用场景">使用场景</a> ·
  <a href="#架构">架构</a>
</p>

---

## 截图

### Web UI

<p align="center">
  <img src="web-ui/public/image.png" width="800" />
</p>

### QQ 机器人对接（NapCat + OpenAI API）

<p align="center">
  <img src="web-ui/public/qqBot.jpg" width="400" />
</p>

> 通过 [NapCat](https://github.com/NapNeko/NapCatQQ) 接入 QQ，调用 MCP Chat 的 OpenAI 兼容 API，实现 QQ 机器人与 IDE AI 对话。

---

## 它能干什么

```
你的 IDE (Windsurf / Cursor / Copilot / Claude Code)
        ↕ MCP 协议
   ┌────────────────┐
   │   server.py    │──> Web UI (多会话聊天界面)
    │   (MCP 网关)   │──> OpenAI / Anthropic 兼容 API (/v1/chat/completions · /v1/responses · /v1/messages)
   │                │──> WebSocket 实时推送
   └────────────────┘
         ↕
  QQ 机器人 / 飞书Bot / Continue 插件 / 自动化脚本 / ...
```

### 核心原理：一次对话，无限调用

MCP Chat 通过 MCP 协议让 IDE 里的 AI 进入一个 **chat() 循环** — 本质上是一次永不结束的对话。在这个对话内，外部可以通过 Web UI 或 API 无限次与 AI 交互。

各 IDE 的计费方式不同，利用 MCP Chat 的效果也不同：

| IDE | 计费方式 | 配合 MCP Chat 的效果 |
|-----|---------|---------------------|
| **GitHub Copilot** | 按请求次数（Agent 模式无限） | ✅ Agent 模式下 **完全无限**，每次交互消耗 1 次请求，但无上限 |
| **Cursor Pro** | 有月度额度（快/慢请求） | ✅ 超额后会降速但**不会停止**，对话内可一直工作 |
| **Windsurf Pro** | 有 credits 额度 | ⚠️ 消耗 credits，用完需等额度刷新 |
| **Claude Code** | 按 API token 计费 | ⚠️ 每次交互消耗 token，按量付费 |

> 💡 **最佳搭配：GitHub Copilot（无限请求）+ MCP Chat = 免费无限 AI API 服务**


<summary>📸 查看实际运行截图 — 一次 Copilot 对话，chat() 无限循环调用</summary>
<p align="center">
  <img src="web-ui/public/mcp-chat.png" width="400" />
</p>


### 功能特性

- **Web UI** — 浏览器里和 IDE AI 聊天，支持 Markdown 渲染、代码高亮、图片上传、多会话管理
- **OpenAI / Anthropic 兼容 API** — 支持 `/v1/chat/completions`、`/v1/responses`、`/v1/messages`，支持流式响应，可对接 OpenAI SDK 与 Anthropic SDK
- **多 IDE 支持** — Windsurf、Cursor、GitHub Copilot、Claude Code / Desktop 同时连接，各自独立会话
- **实时进度推送** — AI 工作过程中通过 `stream_update()` 实时显示当前步骤（读取文件、执行命令等）
- **工作轨迹记录** — 通过 `trace` 参数记录 AI 完整工作过程，前端可折叠展示思考→搜索→修改→验证全流程
- **会话持久化** — 所有会话自动落盘到 `~/.mcp-chat/sessions/`，重启不丢失历史
- **深色/浅色主题** — 支持一键切换主题，CSS 变量驱动
- **零配置启动** — Web UI 已预构建，安装依赖后直接运行
- **单文件后端** — 整个服务端只有一个 `server.py`，无框架依赖，易于理解和二次开发

---

## 快速开始

### 安装

```bash
git clone https://github.com/maile456/mcp-chat.git
cd mcp-chat

# 安装 Python 依赖
pip install mcp[cli] websockets

# 启动服务
python server.py
```

> Web UI 已预构建在 `web-ui/dist/` 中，无需 Node.js 环境。
> 如需修改前端：`cd web-ui && npm install && npm run build`

### 启动成功

```
[MCP Chat] API endpoint: http://127.0.0.1:8080/v1/chat/completions
[MCP Chat] Responses endpoint: http://127.0.0.1:8080/v1/responses
[MCP Chat] Anthropic endpoint: http://127.0.0.1:8080/v1/messages
[MCP Chat] Models endpoint: http://127.0.0.1:8080/v1/models
INFO     Application startup complete.
```

| 地址 | 说明 |
|------|------|
| http://127.0.0.1:8080 | Web UI 聊天界面 |
| http://127.0.0.1:8080/mcp | MCP 端点（IDE 连这个） |
| http://127.0.0.1:8080/v1/chat/completions | OpenAI 兼容 API |
| http://127.0.0.1:8080/v1/responses | OpenAI Responses API |
| http://127.0.0.1:8080/v1/messages | Anthropic Messages API |
| ws://127.0.0.1:8081 | WebSocket 实时推送 |

---

## IDE 配置

复制下面的 JSON，粘贴到对应配置文件即可。

### Windsurf

文件：`~/.codeium/windsurf/mcp_config.json`

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

文件：`~/.cursor/mcp.json`

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

文件：`~/.vscode/mcp.json`

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
<summary>Copilot 推荐设置</summary>

在项目 `.vscode/settings.json` 中添加：

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

文件：`%APPDATA%\Claude\claude_desktop_config.json` (Windows) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

**方式一：HTTP 传输（推荐，需先启动 server.py）**

```json
{
  "mcpServers": {
    "mcp-chat": {
      "url": "http://127.0.0.1:8080/mcp"
    }
  }
}
```

**方式二：Stdio 传输（自动启动）**

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

## 使用方法

配置好 IDE 后，在 AI 对话中输入：

```
调用 get_prompt 获取工作流程，然后调用 chat 工具与我对话
```

AI 会自动进入循环：**发消息到 Web UI → 等你回复 → 执行任务 → 再发消息 → ...**

浏览器打开 `http://127.0.0.1:8080` 即可开始聊天。

---

## OpenAI / Anthropic 兼容 API

IDE 中的 AI 进入 chat() 循环后，你可以通过标准 OpenAI API 与它交互。

### curl

```bash
curl http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"cascade","messages":[{"role":"user","content":"你好"}]}'

# OpenAI Responses
curl http://127.0.0.1:8080/v1/responses \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.3-codex","input":"你好"}'

# Anthropic Messages
curl http://127.0.0.1:8080/v1/messages \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":1024,"messages":[{"role":"user","content":"你好"}]}'
```

### Python

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="no-key")

# 普通请求
r = client.chat.completions.create(
    model="cascade",
    messages=[{"role": "user", "content": "你好"}]
)
print(r.choices[0].message.content)

# 流式请求
stream = client.chat.completions.create(
    model="cascade",
    messages=[{"role": "user", "content": "写一个快排"}],
    stream=True
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

### API 认证（可选）

```bash
# 设置环境变量启用 API Key
MCP_API_KEY=your-secret-key python server.py
```

```python
client = OpenAI(base_url="http://127.0.0.1:8080/v1", api_key="your-secret-key")
```

---

## 使用场景

| 场景 | 说明 |
|------|------|
| **个人 AI 助手** | 在浏览器中与 IDE AI 对话，不受 IDE 界面限制 |
| **QQ 机器人** | 通过 NapCat + OpenAI API 接入 QQ，实现 AI 聊天机器人 |
| **VS Code + Continue** | 同事在 VS Code 中通过 Continue 插件接入你的 API，获得 Copilot 级体验 |
| **自动化脚本** | CI/CD 代码审查、批量文档生成等 |

---

## 架构

```
mcp-chat/
├── server.py              # 核心服务 (MCP + HTTP + WebSocket + API)
├── web-ui/                # Vue 3 + TailwindCSS 前端
│   ├── src/
│   │   ├── components/    # Vue 组件
│   │   ├── composables/   # 组合式函数
│   │   └── App.vue
│   ├── dist/              # 预构建产物 (开箱即用)
│   └── package.json
└── README.md
```

### 技术栈

| 层 | 技术 |
|----|------|
| **后端** | Python · FastMCP · Starlette · WebSocket |
| **前端** | Vue 3 · TailwindCSS · Markdown-it · Highlight.js · Lucide Icons |
| **协议** | MCP (Streamable HTTP) · WebSocket · SSE |
| **API** | OpenAI Chat Completions 兼容 |

### MCP 工具

| 工具 | 参数 | 说明 |
|------|------|------|
| `get_prompt` | — | 返回 Chat 工作流规则 |
| `chat` | `ai_message` (必填), `model`, `source`, `project`, `trace` | 发送消息到 Web UI 并等待用户回复 |
| `stream_update` | `status` (必填), `summary`, `detail`, `tool_name`, `source`, `project` | 推送实时进度到 Web UI（不阻塞） |

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | OpenAI 兼容 Chat API |
| POST | `/v1/responses` | OpenAI 兼容 Responses API |
| POST | `/v1/messages` | Anthropic 兼容 Messages API |
| GET | `/v1/models` | 模型列表 |
| POST | `/mcp` | MCP Streamable HTTP 端点 |
| GET | `/poll` | 长轮询状态更新 |
| POST | `/submit` | 提交用户回复 |
| GET | `/history` | 获取会话历史 |

---

## 常见问题 & 原理

<details>
<summary><strong>它是怎么工作的？</strong></summary>

MCP Chat 注册了一个 `chat()` 工具。IDE 的 AI 调用这个工具后，server.py 会把 AI 发来的消息推送到 Web UI，然后**阻塞等待**用户回复。用户回复后，工具返回结果给 AI，AI 处理后再次调用 `chat()` — 形成一个无限循环。

```
AI 调用 chat("你好") → server 推送到 Web UI → 用户回复 "帮我写代码"
→ chat() 返回用户的回复 → AI 处理并再次调用 chat("这是代码...") → ...
```

整个过程对 IDE 来说只是「一次对话中反复调用同一个工具」，所以只消耗一次对话额度。
</details>

<details>
<summary><strong>为什么 Copilot 可以无限用？</strong></summary>

GitHub Copilot Agent 模式允许 AI 在一次对话中无限次调用工具（`maxRequests` 可设为 99999）。MCP Chat 的 `chat()` 工具每次调用算 1 次请求，但 Agent 模式不设上限，所以可以无限循环。

其他 IDE 也能用，但各有限制：Cursor 超额降速、Windsurf 消耗 credits、Claude Code 按 token 计费。
</details>

<details>
<summary><strong>OpenAI / Anthropic API 是怎么实现的？</strong></summary>

server.py 内置了 `/v1/chat/completions`、`/v1/responses`、`/v1/messages` 端点。收到 API 请求后，server 会把消息注入到当前 chat() 循环中，等 AI 回复后再包装成对应格式返回。支持流式（SSE）和非流式响应。

本质上是：**外部 API 请求 → server 转发给 IDE AI → AI 回复 → server 包装成 OpenAI/Anthropic 格式返回**。
</details>

<details>
<summary><strong>必须打开 IDE 才能用吗？</strong></summary>

Web UI 随时可用（查看历史、管理会话等）。但要让 AI 回复，需要 IDE 中有 AI 在 chat() 循环中运行。API 同理 — 没有 AI 在线时请求会超时。
</details>

<details>
<summary><strong>支持哪些模型？</strong></summary>

取决于你的 IDE 订阅。MCP Chat 本身不限制模型 — IDE 用什么模型，MCP Chat 就用什么模型。例如 Copilot 支持 GPT-4o、Claude Sonnet、Gemini 等；Cursor 支持 Claude、GPT 系列。
</details>

<details>
<summary><strong>多个用户能同时用吗？</strong></summary>

Web UI 支持多会话，每个用户可以独立聊天。但每个 IDE 连接同时只能处理一个 chat() 循环。如果需要多人并发，可以开多个 IDE 实例，每个跑一个 server。
</details>

---

## 推荐 User Rules 配置

在你的 IDE（如 Cursor）的 User Rules 中添加以下内容，让 AI 在长对话中主动管理上下文：

```markdown
## Auto Context Compression

If the conversation becomes long (many tool calls, large file reads), 
and you sense context is getting heavy, call compress_context() proactively.
After compression, resume work normally — use chat() to continue the conversation.
mcp-chat session history is persisted independently and won't be affected.
```

---

## Contributing

欢迎提交 Issue 和 Pull Request！

```bash
# 开发前端
cd web-ui && npm install && npm run dev

# 后端
python server.py
```

---

## ⭐ Star

如果这个项目对你有帮助，请给个 Star ⭐ 支持一下！

[![Star History Chart](https://api.star-history.com/svg?repos=maile456/mcp-chat&type=Date)](https://star-history.com/#maile456/mcp-chat&Date)

---

## License

[MIT](./LICENSE)
