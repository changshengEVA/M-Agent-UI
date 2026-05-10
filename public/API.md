# M-Agent UI API 文档（按页面分组）

本文档对应后端 `python -m m_agent.api.chat_api` 当前实现，适用于 `tools/M-Agent-UI` 前端联调。

## 1. 基础信息

- Base URL（默认）：`http://127.0.0.1:8777`
- Swagger：`/docs`
- 健康检查：`/healthz`
- 默认开启认证：`/v1/chat/*` 需要登录后携带 Bearer Token

通用 Header：

- JSON 请求：
  - `Content-Type: application/json`
  - `ngrok-skip-browser-warning: true`（可选）
- 认证请求：
  - `Authorization: Bearer <access_token>`

---

## 2. 按页面分组速查

### 2.1 登录页（AuthPanel）

用途：注册、登录、恢复登录状态。

接口：

1. `POST /v1/auth/register`
2. `POST /v1/auth/login`
3. `GET /v1/auth/me`
4. `POST /v1/auth/logout`

前端对应：

- `chatApi.register`
- `chatApi.login`
- `chatApi.me`
- `chatApi.logout`

建议流程：

1. 初次进入页面先调用 `GET /v1/auth/me`（若本地已有 token）
2. 无登录态则显示登录/注册
3. 登录成功后保存 `access_token`

### 2.2 主聊天页（ChatInterface）

用途：发消息、拿最终回答、显示思考过程。

接口：

1. `POST /v1/chat/runs`
2. `GET /v1/chat/runs/{run_id}/events`（SSE）
3. `GET /v1/chat/runs/{run_id}`（可选兜底）

前端对应：

- `chatApi.createRun`
- `chatApi.getEventsUrl` + `chatApi.getSSEHeaders`
- `chatApi.getRunResult`

建议流程：

1. 用户发送消息 -> `POST /v1/chat/runs`
2. 立即订阅 run SSE
3. 用 `assistant_message` 更新聊天气泡
4. 用 `run_completed` 结束本轮 loading

### 2.3 线程侧栏（ThreadSidebar）

用途：显示线程历史、pending 轮次、memory 模式。

接口：

1. `GET /v1/chat/threads/{thread_id}/memory/state`
2. `GET /v1/chat/threads/{thread_id}/events?after_seq=-1`（SSE）
3. `POST /v1/chat/threads/{thread_id}/memory/mode`
4. `POST /v1/chat/threads/{thread_id}/memory/flush`
5. `GET /v1/chat/dialogues`
6. `GET /v1/chat/dialogues/{dialogue_id}`

前端对应：

- `chatApi.getThreadState`
- `chatApi.getThreadEventsUrl` + `chatApi.getSSEHeaders`
- `chatApi.setMemoryMode`
- `chatApi.flushBuffer`
- `chatApi.listDialogues`
- `chatApi.getDialogue`

建议流程：

1. 进入线程先拉一次 state
2. 同时订阅 thread SSE 做增量更新
3. 点切换模式 -> 调 mode 接口
4. 点 flush -> 调 flush 接口

### 2.4 设置页（SettingsModal）

用途：修改 API 地址、打开文档、修改用户个性化配置。

接口：

1. `GET /v1/users/me/config/schema`
2. `PATCH /v1/users/me/config`
3. `GET /healthz`
4. 文档入口：`/API.md`、`<base>/docs`

前端对应：

- `chatApi.getMyConfigSchema`
- `chatApi.updateMyConfig`
- `chatApi.healthCheck`

---

## 3. 认证接口详情

### 3.1 注册

- `POST /v1/auth/register`
- Auth：否

请求体示例：

```json
{
  "username": "alice",
  "password": "alice-pass-123",
  "role": "basic",
  "display_name": "Alice",
  "assistant_name": "Nova",
  "persona_prompt": "你是我的长期记忆助手",
  "workflow_id": "user_alice"
}
```

成功响应（201）：

```json
{
  "user": {
    "username": "alice",
    "display_name": "Alice",
    "role": "basic",
    "config_path": "F:\\AI\\M-Agent\\config\\users\\alice\\chat_controller.yaml",
    "created_at": "2026-04-01T10:00:00Z",
    "updated_at": "2026-04-01T10:00:00Z",
    "editable_fields": {
      "chat": ["chat_assistant_name", "chat_persona_prompt"],
      "memory_agent": [],
      "memory_core": []
    }
  }
}
```

### 3.2 登录

- `POST /v1/auth/login`
- Auth：否

请求体示例：

```json
{
  "username": "alice",
  "password": "alice-pass-123"
}
```

成功响应（200）：

```json
{
  "user": { "username": "alice", "role": "basic" },
  "access_token": "xxxxx",
  "token_type": "bearer",
  "expires_at": "2026-04-01T22:00:00Z"
}
```

### 3.3 当前用户

- `GET /v1/auth/me`
- Auth：是

响应（200）：

```json
{
  "user": {
    "username": "alice",
    "role": "basic"
  }
}
```

### 3.4 退出登录

- `POST /v1/auth/logout`
- Auth：是

响应（200）：

```json
{
  "success": true
}
```

---

## 4. 用户配置接口详情

### 4.1 更新当前用户配置

- `PATCH /v1/users/me/config`
- Auth：是

请求体示例：

```json
{
  "chat": {
    "chat_assistant_name": "Nova",
    "chat_persona_prompt": "你是我的私人AI伙伴，耐心、准确。"
  },
  "memory_agent": {},
  "memory_core": {}
}
```

成功响应（200）：

```json
{
  "user": {
    "username": "alice",
    "updated_at": "2026-04-01T10:05:00Z"
  }
}
```

字段权限说明：

- `basic` 可改：
  - `chat.chat_assistant_name`
  - `chat.chat_persona_prompt`
- `advanced` 可改更多：
  - `chat`：`chat_user_name`、`persist_memory`、`enabled_tools` 等
  - `memory_agent`：`model_name`、`agent_temperature`、`recursion_limit` 等
  - `memory_core`：`workflow_id`、`memory_owner_name`、`memory_top_k` 等

### 4.2 获取当前用户配置字段元数据

- `GET /v1/users/me/config/schema`
- Auth：是

用途：

- 给前端暴露可改字段、字段类型、当前值、示例 patch，避免前端硬编码字段清单。

成功响应（200）示例：

```json
{
  "user": {
    "username": "alice",
    "role": "basic",
    "config_path": "F:/AI/M-Agent/config/users/alice/chat.yaml"
  },
  "sections": {
    "chat": {
      "editable_fields": ["chat_assistant_name", "chat_persona_prompt"],
      "patch_example": {
        "chat_assistant_name": "Memory Assistant",
        "chat_persona_prompt": "你是我的私人AI伙伴。"
      },
      "fields": {
        "chat_assistant_name": {
          "type": "string",
          "description": "Assistant display name used in chat responses.",
          "editable": true,
          "present": true,
          "current_value": "Memory Assistant"
        },
        "persist_memory": {
          "type": "boolean",
          "description": "Whether captured memory can be persisted.",
          "editable": false,
          "present": true,
          "current_value": true
        }
      }
    }
  }
}
```

---

## 5. 聊天接口详情

### 5.1 创建 run

- `POST /v1/chat/runs`
- Auth：是

请求体示例：

```json
{
  "thread_id": "demo-thread-1",
  "message": "你好，记住我今天想学Python"
}
```

说明：

- `message` 与 `attachments` 至少需要提供一个
- 支持纯文本、文本+图片、纯图片三种输入
- 纯图片模式下可将 `message` 传空字符串，并在 `attachments` 中提供已上传图片信息

成功响应（201）：

```json
{
  "run_id": "run_xxx",
  "status": "queued",
  "thread_id": "demo-thread-1",
  "user_id": "alice",
  "events_url": "/v1/chat/runs/run_xxx/events",
  "result_url": "/v1/chat/runs/run_xxx"
}
```

### 5.2 查询 run

- `GET /v1/chat/runs/{run_id}`
- Auth：是

响应重点字段：

- `status`: `queued | running | completed | failed`
- `result.answer`: 最终回答
- `result.memory_capture`: 本轮 memory buffer 状态
- `result.thread_state`: 当前线程状态

### 5.3 run 事件流（SSE）

- `GET /v1/chat/runs/{run_id}/events?after_seq=0`
- Auth：是
- Header：`Accept: text/event-stream`

常见事件：

1. `run_started`
2. `recall_started`
3. `question_strategy`
4. `plan_update`
5. `tool_call`
6. `tool_result`
7. `assistant_message`
8. `thread_state_updated`
9. `run_completed` / `run_failed`

`assistant_message` payload 示例：

```json
{
  "thread_id": "demo-thread-1",
  "answer": "好的，我记住了。"
}
```

### 5.4 历史对话列表

- `GET /v1/chat/dialogues`
- Auth：是
- Query（可选）：
  - `thread_id`: 仅看某个 thread 的历史对话
  - `limit`: 默认 30，最大 200
  - `offset`: 默认 0

响应示例：

```json
{
  "items": [
    {
      "dialogue_id": "chat_demo-thread-1_20260401_050018_334856",
      "thread_id": "demo-thread-1",
      "start_time": "2026-04-01T05:00:18.334856Z",
      "end_time": "2026-04-01T05:00:19.334856Z",
      "source": "chat_api_thread_flush",
      "round_count": 1,
      "turn_count": 2,
      "preview": "今天正式学习 Postman 了",
      "dialogue_file": "F:/AI/M-Agent/data/memory/user_x/dialogues/2026-04/xxx.json"
    }
  ],
  "offset": 0,
  "limit": 30,
  "next_offset": null,
  "has_more": false,
  "total": 1
}
```

### 5.5 历史对话详情

- `GET /v1/chat/dialogues/{dialogue_id}`
- Auth：是

响应示例：

```json
{
  "dialogue_id": "chat_demo-thread-1_20260401_050018_334856",
  "thread_id": "demo-thread-1",
  "thread_id_internal": "alice::demo-thread-1",
  "user_id": "User",
  "participants": ["User", "Memory Assistant"],
  "meta": {},
  "turns": [
    {
      "turn_id": 0,
      "speaker": "User",
      "text": "今天正式学习 Postman 了",
      "timestamp": "2026-04-01T05:00:18.334856Z"
    }
  ],
  "round_count": 1,
  "turn_count": 2,
  "dialogue_file": "F:/AI/M-Agent/data/memory/user_x/dialogues/2026-04/xxx.json"
}
```

---

## 6. 线程与记忆接口详情

### 6.1 查询线程状态

- `GET /v1/chat/threads/{thread_id}/memory/state`
- Auth：是

响应示例：

```json
{
  "thread_id": "demo-thread-1",
  "mode": "manual",
  "history_rounds": 3,
  "history_messages": 6,
  "pending_rounds": 1,
  "pending_turns": 2,
  "has_pending_data": true,
  "last_activity_at": "2026-04-01T10:00:02Z",
  "last_flush_at": null,
  "idle_flush_seconds": 1800,
  "idle_flush_deadline": "2026-04-01T10:30:02Z",
  "history_rounds_data": [],
  "history_preview": []
}
```

### 6.2 线程事件流（SSE）

- `GET /v1/chat/threads/{thread_id}/events?after_seq=-1`
- Auth：是

常见事件：

- `thread_state_updated`
- `flush_started`
- `flush_stage`
- `flush_completed`

### 6.3 设置 memory mode

- `POST /v1/chat/threads/{thread_id}/memory/mode`
- Auth：是

请求体：

```json
{
  "mode": "off",
  "discard_pending": false
}
```

### 6.4 手动 flush

- `POST /v1/chat/threads/{thread_id}/memory/flush`
- Auth：是

请求体：

```json
{
  "reason": "manual_api"
}
```

成功示例（written）：

```json
{
  "success": true,
  "thread_id": "demo-thread-1",
  "flush_reason": "manual_api",
  "status": "written",
  "rounds_flushed": 2,
  "turns_flushed": 4,
  "memory_write": {},
  "thread_state": {},
  "error": null
}
```

成功示例（noop）：

```json
{
  "success": true,
  "thread_id": "demo-thread-1",
  "flush_reason": "manual_api",
  "status": "noop",
  "message": "no pending rounds to flush",
  "thread_state": {}
}
```

---

## 7. 健康检查接口详情

### 7.1 健康检查

- `GET /healthz`
- Auth：否

响应重点字段：

- `runtime`：默认 runtime 状态
- `auth`：用户与会话状态
- `auth_required_for_chat`：是否要求登录

---

## 8. 错误码

- `400`：参数错误
- `401`：未认证/token 失效
- `403`：权限不足
- `404`：资源不存在
- `409`：冲突（如用户已存在）
- `503`：功能不可用（如认证关闭）

错误体统一：

```json
{
  "error": "message text"
}
```

---

## 9. 前端 service 映射（`src/services/api.ts`）

### 9.1 认证

- `register`
- `login`
- `me`
- `logout`

### 9.2 用户配置

- `getMyConfigSchema`
- `updateMyConfig`

### 9.3 聊天与线程

- `createRun`
- `listDialogues`
- `getDialogue`
- `getRunResult`
- `getThreadState`
- `setMemoryMode`
- `flushBuffer`
- `getEventsUrl`
- `getThreadEventsUrl`
- `getSSEHeaders`

---

## 10. 一条完整调用链（前端）

1. 启动时 `GET /healthz`
2. 若本地有 token，调用 `GET /v1/auth/me`
3. 未登录：走注册/登录
4. 已登录：创建 run + 订阅 run SSE
5. 同时订阅 thread SSE + 拉取 thread state
6. 设置页加载字段元数据：`GET /v1/users/me/config/schema`
7. 用户修改配置：`PATCH /v1/users/me/config`
8. 侧栏查看历史对话：`GET /v1/chat/dialogues` + `GET /v1/chat/dialogues/{dialogue_id}`
