/**
 * Import tất cả file .md từ shopify-store-front/api-detail-design vào MCP server
 * Chạy: node scripts/import-docs.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.MCP_URL || 'http://localhost:3000';
const TOKEN = process.env.AUTH_TOKEN || 'test-token-local';
const DOCS_ROOT = join(__dirname, '../../shopify-store-front/api-detail-design');

function walkDir(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full, files);
    } else if (entry.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function extractTitle(content, filename) {
  // Ưu tiên lấy Feature Name từ bảng Overview
  const featureMatch = content.match(/\|\s*Feature Name\s*\|\s*([^|\n]+)\|/i);
  if (featureMatch) return featureMatch[1].trim();
  // Fallback: heading đầu tiên
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  // Fallback: tên file
  return basename(filename, '.md').replace(/-/g, ' ');
}

function extractTags(filePath) {
  const parts = filePath.split('/');
  const tags = ['shopify', 'detail-design'];
  // folder name → tag (e.g. "accounts", "cart")
  const folder = parts[parts.length - 2];
  if (folder && folder !== 'api-detail-design') tags.push(folder);
  return tags;
}

async function main() {
  console.log('\n📦 Import Shopify Docs → MCP Server\n');

  const transport = new SSEClientTransport(new URL(`${BASE_URL}/mcp`), {
    eventSourceInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: 'import-client', version: '1.0.0' }, { capabilities: {} });
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');

  const files = walkDir(DOCS_ROOT);
  console.log(`📂 Tìm thấy ${files.length} file(s)\n`);

  const created = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const title = extractTitle(content, file);
    const tags = extractTags(file);

    try {
      const res = await client.callTool({
        name: 'create-doc',
        arguments: { title, content, type: 'detail-design', tags },
      });
      const doc = JSON.parse(res.content[0].text);
      created.push({ id: doc.id, title, tags });
      console.log(`  ✅ [${doc.id}] ${title}`);
      console.log(`       tags: ${tags.join(', ')}`);
    } catch (e) {
      console.log(`  ❌ ${title}: ${e.message}`);
    }
  }

  // List để xác nhận
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const listRes = await client.callTool({ name: 'list-doc', arguments: { limit: 50 } });
  const { documents, total } = JSON.parse(listRes.content[0].text);
  console.log(`\n📋 Tổng số docs trong MCP: ${total}`);
  console.log('\nID              | Title');
  console.log('─'.repeat(70));
  for (const d of documents) {
    console.log(`${d.id.padEnd(15)} | ${d.title}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await client.close();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
