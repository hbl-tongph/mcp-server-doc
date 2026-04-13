import { z } from 'zod';
import { customAlphabet } from 'nanoid';
import { SQLiteStorage } from '../storage/sqlite.js';
import { createErrorResponse, createSuccessResponse } from './utils.js';

// Safe nanoid alphabet suitable for URLs
const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 12);

export const createDocSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional().default(''),
  type: z.string().optional().default('detail-design'),
  tags: z.array(z.string()).optional().default([])
});

export const createDocHandler = (storage: SQLiteStorage, args: unknown) => {
  try {
    const params = createDocSchema.parse(args || {});
    const now = new Date().toISOString();
    
    const doc = {
      id: nanoid(),
      title: params.title,
      content: params.content,
      type: params.type,
      tags: params.tags,
      createdAt: now,
      updatedAt: now
    };
    
    const created = storage.createDocument(doc);
    return createSuccessResponse(created);
  } catch (e) {
    const error = e as any;
    if (error instanceof z.ZodError) {
      return createErrorResponse(`Validation Error: ${error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ')}`);
    }
    return createErrorResponse(error?.message || 'Unknown error create-doc');
  }
};
