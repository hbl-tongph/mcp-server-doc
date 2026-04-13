# Kế hoạch implement các cải tiến còn lại

## Đã hoàn thành
- [x] Fix N+1 query trong `listDocuments` — batch fetch tags bằng `WHERE doc_id IN (...)`
- [x] Fix bug `update-doc`: kiểm tra `!params.title` → `param.title !== undefined` (tránh false-positive với chuỗi rỗng)

---

## Nhóm 1 — Bug / Correctness (ưu tiên cao)

### ~~1.1 `migrate.ts` nằm ngoài `tsconfig include` → deploy bị silent fail~~ ✅
- **File:** `scripts/migrate.ts`, `tsconfig.json`, `.github/workflows/deploy.yml`
- **Vấn đề:** `tsconfig.json` chỉ compile `src/**/*`. `scripts/migrate.ts` không được build ra `dist/migrate.js` → bước deploy `node dist/migrate.js 2>/dev/null || true` luôn lỗi âm thầm.
- **Cách fix (chọn 1):**
  - **(A) Đơn giản nhất:** Chuyển `scripts/migrate.ts` vào `src/migrate.ts`. Trong workflow đổi thành `node dist/migrate.js`.
  - **(B)** Thêm `scripts/**/*` vào `tsconfig.json` include và tách `rootDir` thành `"."` (cần chỉnh `outDir` tương ứng).
  - **(C)** Xoá bước migrate trong deploy (nó chỉ gọi `new SQLiteStorage()` vốn đã tự init schema khi server start).

### ~~1.2 `sessionId` bị log plain text trong URL~~ ✅
- **File:** `src/http.ts` (`requestLogger`)
- **Vấn đề:** Log `req.originalUrl` → `/mcp/messages?sessionId=abc123` xuất hiện trong log. SessionId không phải secret nhưng là attack surface cho session hijack nếu log bị leak.
- **Cách fix:** Redact query params trong `requestLogger` hoặc chỉ log `req.path` (không có query string).

---

## Nhóm 2 — Type Safety (ưu tiên trung bình)

### 2.1 `as any` trong `sqlite.ts`
- **File:** `src/storage/sqlite.ts` (các dòng dùng `.get()`, `.all()`)
- **Vấn đề:** Mất hết lợi ích TypeScript strict cho DB rows.
- **Cách fix:** Định nghĩa interface cho từng row:
  ```typescript
  interface DocumentRow {
    id: string; title: string; content: string;
    type: string; created_at: string; updated_at: string;
  }
  interface TagRow { doc_id: string; tag: string; }
  ```
  Thay `as any` bằng `as DocumentRow`, `as TagRow[]`, v.v.

### 2.2 `as any` trong tool handlers
- **Files:** `src/tools/list-doc.ts:27`, `update-doc.ts:32`, `delete-doc.ts:23`
- **Vấn đề:** `catch (e) { const error = e as any; }` — mất type, có thể dùng `instanceof`.
- **Cách fix:** Pattern chuẩn:
  ```typescript
  } catch (e) {
    if (e instanceof z.ZodError) { ... }
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return createErrorResponse(msg);
  }
  ```

---

## Nhóm 3 — Bảo mật (ưu tiên trung bình)

### 3.1 Bearer token so sánh không constant-time
- **File:** `src/index.ts:39`
- **Vấn đề:** `authHeader !== \`Bearer ${AUTH_TOKEN}\`` — timing attack khả thi trong môi trường hostile.
- **Cách fix:** Dùng `crypto.timingSafeEqual`:
  ```typescript
  import { timingSafeEqual } from 'crypto';
  
  const expected = Buffer.from(`Bearer ${AUTH_TOKEN}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    next(new HttpError(401, 'Invalid token'));
    return;
  }
  ```

### 3.2 CORS mở mọi origin
- **File:** `src/index.ts:22`
- **Vấn đề:** `app.use(cors())` → `Access-Control-Allow-Origin: *`.
- **Cách fix:** Thêm `CORS_ORIGIN` vào `.env` và cấu hình:
  ```typescript
  app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
  ```
  Cập nhật `.env.example` thêm `CORS_ORIGIN=`.

---

## Nhóm 4 — Operational / DevOps (ưu tiên thấp-trung)

### 4.1 `SQLiteStorage` thiếu `close()`
- **File:** `src/storage/sqlite.ts`, `src/index.ts`
- **Vấn đề:** Graceful shutdown đóng HTTP server và MCP sessions nhưng không gọi `db.close()`. OS thường flush nhưng không lý tưởng.
- **Cách fix:** Thêm method:
  ```typescript
  close() { this.db.close(); }
  ```
  Gọi `storage.close()` trong hàm `shutdown` của `index.ts` trước `process.exit(0)`.

### 4.2 `ecosystem.config.cjs` path cứng không khớp `EC2_APP_DIR`
- **File:** `ecosystem.config.cjs`
- **Vấn đề:** `cwd: '/home/ubuntu/mcp-server'` hardcode — nếu `EC2_APP_DIR` đổi thì lệch.
- **Cách fix:** PM2 ecosystem đọc từ biến môi trường không hỗ trợ trực tiếp, nhưng có thể dùng:
  ```javascript
  cwd: process.env.EC2_APP_DIR || '/home/ubuntu/mcp-server',
  ```

### 4.3 `.env.example` thiếu `LOG_LEVEL`
- **File:** `.env.example`
- **Cách fix:** Thêm dòng:
  ```
  LOG_LEVEL=info
  ```

---

## Nhóm 5 — Developer Experience (ưu tiên thấp)

### 5.1 Không có unit test framework
- **Hiện trạng:** Chỉ có `scripts/test-tools.mjs` (integration, cần server đang chạy). CI không chạy test.
- **Đề xuất:** Thêm Vitest (nhẹ, ESM-native):
  ```bash
  npm install -D vitest
  ```
  Viết unit test cho: Zod schema validation, `listDocuments` filter logic, `updateDocument` merge logic.
  Thêm `"test:unit": "vitest run"` vào `package.json` scripts.
  Thêm step `npm run test:unit` vào `build` job trong `deploy.yml`.

### 5.2 `scripts/import-docs.mjs` path hardcode
- **File:** `scripts/import-docs.mjs`
- **Vấn đề:** Đường dẫn tới repo khác (`shopify-store-front/...`) hardcode → không portable.
- **Cách fix:** Nhận path từ argument: `const docsDir = process.argv[2] ?? './docs'`.

### 5.3 README link sai path
- **File:** `README.md`
- **Vấn đề:** Link tới middleware trỏ `/home/projects/familiar-document/mcp-server/...` thay vì `/home/projects/mcp-server/...`.
- **Cách fix:** Cập nhật đường dẫn hoặc dùng path tương đối.

---

## Thứ tự thực hiện đề xuất

```
1.1 migrate fix          → unblock silent deploy failure
4.3 .env.example         → 2 phút, zero risk
1.2 sessionId log        → 5 phút
4.1 storage.close()      → 10 phút
3.1 timingSafeEqual      → 10 phút
2.1 DB row types         → 30 phút, type safety
2.2 catch as any         → 15 phút
3.2 CORS origin          → 10 phút
4.2 ecosystem cwd        → 5 phút
5.1 Vitest               → 2–4 giờ
5.2 import-docs args     → 10 phút
5.3 README link          → 5 phút
```
