# Kế hoạch triển khai mcp-doc (Centralized MCP Server)

Hệ thống quản lý tài liệu tập trung sử dụng Model Context Protocol (MCP) với transport SSE/HTTP.

## Công nghệ sử dụng (Stack)

| Thành phần | Công nghệ |
| :--- | :--- |
| **Transport** | SSE/HTTP (Express) |
| **Storage** | SQLite via `better-sqlite3` |
| **Auth** | Static Bearer token |
| **Content** | Markdown only |
| **Doc type (MVP)** | `detail-design` (mặc định) |
| **Language** | TypeScript |

---

## Document Schema

### Interface
```typescript
interface Document {
  id: string;        // nanoid, e.g. "abc123"
  title: string;     // required
  content: string;   // markdown
  type: string;      // "detail-design" (MVP default)
  tags: string[];    // ["auth", "backend"]
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

### SQLite Tables
- **`documents`**: `id`, `title`, `content`, `type`, `created_at`, `updated_at`
- **`document_tags`**: `doc_id`, `tag` (quan hệ many-to-many để dễ dàng filter)

---

## Tool Specs (MVP)

- **`list-doc`**: 
  - Filter: `type`, `tags[]`, `status`
  - Sort: `created_at` | `updated_at`
  - Pagination: `limit`/`offset`
- **`get-doc`**: 
  - Input: `id`
  - Output: Trả về full document + tags
- **`create-doc`**: 
  - Input: `title` (required), `content`, `type` (default: "detail-design"), `tags[]`
- **`update-doc`**: 
  - Input: `id` + partial fields (chỉ update những trường được truyền vào)
- **`delete-doc`**: 
  - Input: `id` + `confirm: true` flag (bắt buộc để tránh xóa nhầm)

---

## Phase Plan

### Phase 0: Boilerplate (1–2h)
- [x] Khởi tạo `tsconfig.json`, `.env.example`, `.gitignore`
- [x] Cấu trúc thư mục dự án
- [x] `src/types.ts`: Định nghĩa các shared interfaces

### Phase 1: Storage Layer (2–3h)
- [x] `src/storage/sqlite.ts`: Implement lớp Storage cho SQLite
- [x] Migration script tạo tables
- [x] Path sanitization và error wrapping

### Phase 2: Tools (3–4h)
- [x] Triển khai 5 tool files trong `src/tools/`
- [x] Định nghĩa Zod schema cho input của từng tool
- [x] Chuẩn hóa error response: `{ isError: true, content: [{ type: "text", text: "..." }] }`

### Phase 3: Server (2–3h)
- [x] Express setup + CORS + JSON middleware
- [x] `GET /mcp` → SSEServerTransport
- [x] `POST /mcp/messages` → Routing đến session
- [x] `GET /health` endpoint
- [x] Auth middleware (Bearer token) + SIGTERM handler

### Phase 4: Logging & Error Handling (1h)
- [x] Tích hợp `pino` logger (không log content/token)
- [x] Centralized error handler

### Phase 5: Test Local (1h)
- [x] Sử dụng `npx @modelcontextprotocol/inspector`
- [x] Test thủ công 5 tools (script: `node scripts/test-tools.mjs`)

### Phase 6: Deploy (Tùy chọn sau MVP)
- [ ] `Dockerfile` + `docker-compose.yml`
- [ ] Nginx reverse proxy + HTTPS
