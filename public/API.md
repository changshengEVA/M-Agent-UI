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

前端对应：

- `chatApi.getThreadState`
- `chatApi.getThreadEventsUrl` + `chatApi.getSSEHeaders`
- `chatApi.setMemoryMode`
- `chatApi.flushBuffer`

建议流程：

1. 进入线程先拉一次 state
2. 同时订阅 thread SSE 做增量更新
3. 点切换模式 -> 调 mode 接口
4. 点 flush -> 调 flush 接口

### 2.4 设置页（SettingsModal）

用途：修改 API 地址、打开文档、修改用户个性化配置。

接口：

1. `PATCH /v1/users/me/config`
2. `GET /healthz`
3. 文档入口：`/API.md`、`<base>/docs`

前端对应：

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

- `updateMyConfig`

### 9.3 聊天与线程

- `createRun`
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
6. 用户修改配置：`PATCH /v1/users/me/config`
