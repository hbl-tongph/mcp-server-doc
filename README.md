# mcp-doc

MCP server quản lý tài liệu Markdown tập trung, dùng transport SSE/HTTP, lưu trữ bằng SQLite.

## Trạng thái hiện tại

- Auth đã có, nhưng là `Bearer token`, không phải HTTP Basic Auth.
- Middleware auth nằm ở [src/index.ts](/home/projects/familiar-document/mcp-server/src/index.ts).
- Nếu cấu hình `AUTH_TOKEN`, mọi request trừ `GET /health` phải gửi:

```http
Authorization: Bearer <your-token>
```

## Tính năng

- `list-doc`
- `get-doc`
- `create-doc`
- `update-doc`
- `delete-doc`

Document hiện hỗ trợ định dạng Markdown với schema:

```ts
interface Document {
  id: string;
  title: string;
  content: string;
  type: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

## Yêu cầu

- Node.js 20+
- npm

## Cài đặt

```bash
npm install
```

## Cấu hình môi trường

Các biến môi trường đang được dùng:

- `PORT`: cổng chạy server, mặc định `3000`
- `AUTH_TOKEN`: token Bearer để bảo vệ endpoint MCP
- `DB_PATH`: đường dẫn SQLite, mặc định `./db.sqlite`
- `LOG_LEVEL`: mức log cho `pino`, mặc định `info`

Ví dụ:

```bash
export PORT=3000
export AUTH_TOKEN=dev-token
export DB_PATH=./db.sqlite
export LOG_LEVEL=info
```

## Chạy server

Development:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Run bản build:

```bash
npm start
```

Health check:

```bash
curl http://127.0.0.1:3000/health
```

## Endpoint

- `GET /health`
- `GET /mcp`
- `POST /mcp/messages?sessionId=...`

## Auth

Server hiện dùng static Bearer token middleware.

Ví dụ:

```bash
curl -H "Authorization: Bearer dev-token" http://127.0.0.1:3000/mcp
```

Lưu ý:

- `GET /health` không cần token
- `GET /mcp` và `POST /mcp/messages` cần token nếu `AUTH_TOKEN` đã được set
- Logger đã được cấu hình để không log `content` và token/auth headers

## Cách push document lên server

Hiện tại không có REST API riêng để upload file Markdown trực tiếp.

Cách "push doc" hiện có là gọi MCP tool `create-doc` hoặc `update-doc` và truyền nội dung Markdown trong field `content`.

### Cách 1: Dùng MCP Inspector

Chạy server:

```bash
AUTH_TOKEN=dev-token npm run dev
```

Mở Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Trong Inspector:

1. Chọn transport dạng SSE/HTTP.
2. URL server: `http://127.0.0.1:3000/mcp`
3. Header auth:

```http
Authorization: Bearer dev-token
```

4. Gọi tool `create-doc` với payload ví dụ:

```json
{
  "title": "Auth flow detail design",
  "content": "# Auth Flow\n\nLuồng đăng nhập sử dụng bearer token.",
  "type": "detail-design",
  "tags": ["auth", "backend"]
}
```

Tool sẽ tạo document mới trong SQLite và trả về document vừa tạo, bao gồm `id`.

### Cách 2: Dùng MCP client

Bất kỳ MCP client nào hỗ trợ SSE đều có thể gọi các tool sau:

#### `create-doc`

```json
{
  "title": "User profile detail design",
  "content": "# User Profile\n\nThiết kế chi tiết module user profile.",
  "type": "detail-design",
  "tags": ["user", "profile"]
}
```

#### `update-doc`

```json
{
  "id": "your-doc-id",
  "content": "# User Profile\n\nNội dung đã cập nhật.",
  "tags": ["user", "profile", "revision-2"]
}
```

#### `get-doc`

```json
{
  "id": "your-doc-id"
}
```

#### `list-doc`

```json
{
  "type": "detail-design",
  "tags": ["auth"],
  "sort": "updated_at",
  "limit": 20,
  "offset": 0
}
```

#### `delete-doc`

```json
{
  "id": "your-doc-id",
  "confirm": true
}
```

## Luồng sử dụng đề xuất

1. Chạy server với `AUTH_TOKEN`.
2. Kết nối bằng MCP Inspector hoặc MCP client hỗ trợ SSE.
3. Gọi `create-doc` để tạo doc mới.
4. Lưu lại `id` trả về để dùng cho `get-doc`, `update-doc`, `delete-doc`.
5. Dùng `list-doc` để filter theo `type`, `tags`, `updated_at`.

## Ghi chú triển khai

- SQLite schema được khởi tạo tự động khi server/storage khởi động.
- `content` được lưu nguyên văn dưới dạng Markdown string.
- `type` mặc định của `create-doc` là `detail-design`.
- `delete-doc` yêu cầu `confirm: true` để tránh xóa nhầm.

## Nếu muốn dùng Basic Auth thật

Code hiện tại chưa hỗ trợ HTTP Basic Auth.

Nếu cần, có thể đổi middleware từ:

```http
Authorization: Bearer <token>
```

sang:

```http
Authorization: Basic <base64(username:password)>
```

nhưng đó sẽ là thay đổi behavior của server, không phải trạng thái hiện tại.
