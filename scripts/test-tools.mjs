/**
 * Test script cho 5 MCP tools (Phase 5)
 * Sử dụng MCP SDK Client với SSE transport
 * Chạy: node scripts/test-tools.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const BASE_URL = process.env.MCP_URL || 'http://localhost:3000';
const TOKEN = process.env.AUTH_TOKEN || 'test-token-local';

const results = { pass: 0, fail: 0 };

function record(name, passed, detail = '') {
  if (passed) {
    results.pass++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    results.fail++;
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  🔍 MCP Tool Test Suite — Phase 5');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Health check ────────────────────────────────────────────────────────
  console.log('📋 Infrastructure');
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const body = await res.json();
    record('GET /health', body.status === 'ok', `status=${body.status}`);
  } catch (e) {
    record('GET /health', false, e.message);
  }

  // ── MCP Connection ───────────────────────────────────────────────────────
  const transport = new SSEClientTransport(new URL(`${BASE_URL}/mcp`), {
    eventSourceInit: {
      headers: { Authorization: `Bearer ${TOKEN}` },
    },
    requestInit: {
      headers: { Authorization: `Bearer ${TOKEN}` },
    },
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    record('MCP SSE Connect', true, 'session established');
  } catch (e) {
    record('MCP SSE Connect', false, e.message);
    console.log('\n⚠️  Không thể kết nối. Đảm bảo server đang chạy.\n');
    process.exit(1);
  }

  const { tools } = await client.listTools();
  record(
    'tools/list',
    tools.length === 5,
    `${tools.length}/5 tools: ${tools.map((t) => t.name).join(', ')}`
  );

  // ── Tool Tests ───────────────────────────────────────────────────────────
  console.log('\n📋 Tool: create-doc');
  let docId = null;
  try {
    const res = await client.callTool({
      name: 'create-doc',
      arguments: {
        title: 'Phase 5 Test Document',
        content: '# Phase 5\n\nTest content for local testing.',
        type: 'detail-design',
        tags: ['test', 'phase5'],
      },
    });
    const doc = JSON.parse(res.content[0].text);
    docId = doc.id;
    record('create-doc — tạo document mới', !!docId, `id=${docId}`);
    record('create-doc — đúng title', doc.title === 'Phase 5 Test Document');
    record('create-doc — đúng type', doc.type === 'detail-design');
    record('create-doc — có tags', Array.isArray(doc.tags) && doc.tags.includes('phase5'));
  } catch (e) {
    record('create-doc', false, e.message);
  }

  console.log('\n📋 Tool: list-doc');
  try {
    const res = await client.callTool({
      name: 'list-doc',
      arguments: { limit: 10, sort: 'created_at' },
    });
    const data = JSON.parse(res.content[0].text);
    record('list-doc — trả về mảng', Array.isArray(data.documents));
    record('list-doc — có total field', typeof data.total === 'number', `total=${data.total}`);
    record('list-doc — chứa document vừa tạo', data.documents.some((d) => d.id === docId));

    // Test filter by tags
    const filtered = await client.callTool({
      name: 'list-doc',
      arguments: { tags: ['phase5'], limit: 5 },
    });
    const filteredData = JSON.parse(filtered.content[0].text);
    record('list-doc — filter by tags', filteredData.documents.length > 0, `${filteredData.documents.length} results`);
  } catch (e) {
    record('list-doc', false, e.message);
  }

  console.log('\n📋 Tool: get-doc');
  if (docId) {
    try {
      const res = await client.callTool({
        name: 'get-doc',
        arguments: { id: docId },
      });
      const doc = JSON.parse(res.content[0].text);
      record('get-doc — lấy đúng document', doc.id === docId);
      record('get-doc — có đầy đủ fields', !!(doc.title && doc.content && doc.createdAt));

      // Test not found
      const notFound = await client.callTool({
        name: 'get-doc',
        arguments: { id: 'nonexistent-id-xyz' },
      });
      record('get-doc — 404 khi không tìm thấy', !!notFound.isError);
    } catch (e) {
      record('get-doc', false, e.message);
    }
  }

  console.log('\n📋 Tool: update-doc');
  if (docId) {
    try {
      const res = await client.callTool({
        name: 'update-doc',
        arguments: {
          id: docId,
          title: 'Updated Phase 5 Document',
          tags: ['updated', 'phase5'],
        },
      });
      const doc = JSON.parse(res.content[0].text);
      record('update-doc — cập nhật title', doc.title === 'Updated Phase 5 Document');
      record('update-doc — cập nhật tags', doc.tags?.includes('updated'));
      record('update-doc — updatedAt thay đổi', !!doc.updatedAt);
    } catch (e) {
      record('update-doc', false, e.message);
    }
  }

  console.log('\n📋 Tool: delete-doc');
  if (docId) {
    try {
      // Test xóa không có confirm
      const noConfirm = await client.callTool({
        name: 'delete-doc',
        arguments: { id: docId, confirm: false },
      });
      record('delete-doc — từ chối khi confirm=false', !!noConfirm.isError);

      // Xóa thật
      const res = await client.callTool({
        name: 'delete-doc',
        arguments: { id: docId, confirm: true },
      });
      record('delete-doc — xóa thành công', !res.isError);

      // Verify đã xóa
      const afterDelete = await client.callTool({
        name: 'get-doc',
        arguments: { id: docId },
      });
      record('delete-doc — verify không còn tồn tại', !!afterDelete.isError);
    } catch (e) {
      record('delete-doc', false, e.message);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  await client.close();
  const total = results.pass + results.fail;
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  📊 Kết quả: ${results.pass}/${total} tests passed`);
  if (results.fail > 0) {
    console.log(`  ⚠️  ${results.fail} test(s) thất bại`);
  } else {
    console.log('  🎉 Tất cả tests pass!');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  process.exit(results.fail > 0 ? 1 : 0);
}

runTests().catch((e) => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
