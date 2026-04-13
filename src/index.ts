import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import * as tools from './tools/index.js';
import { HttpError, asyncHandler, errorHandler, requestLogger } from './http.js';
import { logger, sanitizeForLog } from './logger.js';
import { SQLiteStorage } from './storage/sqlite.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const AUTH_TOKEN = process.env.AUTH_TOKEN;
const DB_PATH = process.env.DB_PATH || './db.sqlite';

const storage = new SQLiteStorage(DB_PATH);
const app = express();

app.use(cors());
app.use(requestLogger);
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  if (req.path === '/health') {
    next();
    return;
  }
  
  if (AUTH_TOKEN) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      next(new HttpError(401, 'Missing Authorization header'));
      return;
    }
    if (authHeader !== `Bearer ${AUTH_TOKEN}`) {
      next(new HttpError(401, 'Invalid token'));
      return;
    }
  }
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const toolSchemas = [
  {
     name: "list-doc",
     description: "List documents with filters and pagination",
     inputSchema: {
       type: "object",
       properties: {
         type: { type: "string" },
         tags: { type: "array", items: { type: "string" } },
         status: { type: "string" },
         sort: { type: "string", enum: ["created_at", "updated_at"] },
         limit: { type: "number" },
         offset: { type: "number" }
       }
     }
  },
  {
     name: "get-doc",
     description: "Get a document by ID",
     inputSchema: {
       type: "object",
       properties: {
         id: { type: "string" }
       },
       required: ["id"]
     }
  },
  {
     name: "create-doc",
     description: "Create a new document",
     inputSchema: {
       type: "object",
       properties: {
         title: { type: "string" },
         content: { type: "string" },
         type: { type: "string" },
         tags: { type: "array", items: { type: "string" } }
       },
       required: ["title"]
     }
  },
  {
     name: "update-doc",
     description: "Update an existing document. Provide fields to update.",
     inputSchema: {
       type: "object",
       properties: {
         id: { type: "string" },
         title: { type: "string" },
         content: { type: "string" },
         type: { type: "string" },
         tags: { type: "array", items: { type: "string" } }
       },
       required: ["id"]
     }
  },
  {
     name: "delete-doc",
     description: "Delete a document by ID",
     inputSchema: {
       type: "object",
       properties: {
         id: { type: "string" },
         confirm: { type: "boolean" }
       },
       required: ["id", "confirm"]
     }
  }
];

function createMcpServer() {
  const server = new Server(
    { name: "mcp-doc", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolSchemas
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startedAt = Date.now();

    logger.info({ tool: name, args: sanitizeForLog(args) }, 'Tool call received');

    try {
      let result;

      switch (name) {
        case 'list-doc':
          result = tools.listDocHandler(storage, args);
          break;
        case 'get-doc':
          result = tools.getDocHandler(storage, args);
          break;
        case 'create-doc':
          result = tools.createDocHandler(storage, args);
          break;
        case 'update-doc':
          result = tools.updateDocHandler(storage, args);
          break;
        case 'delete-doc':
          result = tools.deleteDocHandler(storage, args);
          break;
        default:
          throw new HttpError(400, `Unknown tool: ${name}`);
      }

      logger.info(
        { tool: name, durationMs: Date.now() - startedAt, isError: result.isError },
        'Tool call completed'
      );

      return result;
    } catch (error) {
      logger.error(
        { err: error, tool: name, args: sanitizeForLog(args), durationMs: Date.now() - startedAt },
        'Tool call failed'
      );
      throw error;
    }
  });

  return server;
}

interface Session {
  server: Server;
  transport: SSEServerTransport;
}

const sessions = new Map<string, Session>();

// GET /mcp -> initialize SSE transport & MCP server session
app.get('/mcp', asyncHandler(async (_req, res) => {
  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer();
  
  await server.connect(transport);
  
  const sessionId = transport.sessionId;
  sessions.set(sessionId, { server, transport });
  logger.info({ sessionId }, 'MCP session opened');

  res.on('close', () => {
    sessions.delete(sessionId);
    server.close();
    logger.info({ sessionId }, 'MCP session closed');
  });
}));

// POST /mcp/messages -> route to assigned session
app.post('/mcp/messages', asyncHandler(async (req, res) => {
  const sessionId = req.query.sessionId as string;
  if (!sessionId) {
    throw new HttpError(400, 'Missing sessionId query parameter');
  }
  
  const session = sessions.get(sessionId);
  if (!session) {
    throw new HttpError(404, 'Session not found');
  }
  
  logger.info({ sessionId }, 'Dispatching MCP message');
  // Pass req.body vì express.json() đã parse stream; raw-body sẽ lỗi nếu đọc lại
  await session.transport.handlePostMessage(req, res, req.body);
}));

app.use(errorHandler);

const httpServer = app.listen(PORT, () => {
  logger.info({ port: PORT, dbPath: DB_PATH }, 'MCP server started');
});

// Graceful shutdown
const shutdown = () => {
  logger.info('Shutdown signal received');
  for (const [id, session] of Array.from(sessions.entries())) {
    session.server.close();
    sessions.delete(id);
  }
  
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
