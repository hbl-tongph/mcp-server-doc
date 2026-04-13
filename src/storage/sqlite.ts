import Database from 'better-sqlite3';
import { normalize } from 'path';
import { Document } from '../types.js';
import { logger } from '../logger.js';

export class SQLiteStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    const sanitizedPath = this.sanitizePath(dbPath);
    this.db = new Database(sanitizedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initDatabase();
  }

  private sanitizePath(dbPath: string): string {
    return normalize(dbPath);
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS document_tags (
        doc_id TEXT NOT NULL,
        tag TEXT NOT NULL,
        FOREIGN KEY (doc_id) REFERENCES documents (id) ON DELETE CASCADE,
        PRIMARY KEY (doc_id, tag)
      );

      CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
      CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
      CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);
      CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON document_tags(tag);
    `);
  }

  // Helper error wrapper
  private withErrorHandling<T>(operationName: string, operation: () => T): T {
    try {
      return operation();
    } catch (error) {
      logger.error({ err: error, operation: operationName }, 'Storage operation failed');
      throw new Error(error instanceof Error ? error.message : 'Unknown storage error');
    }
  }

  createDocument(doc: Document) {
    return this.withErrorHandling('createDocument', () => {
      const insertDoc = this.db.prepare(`
        INSERT INTO documents (id, title, content, type, created_at, updated_at)
        VALUES (@id, @title, @content, @type, @createdAt, @updatedAt)
      `);

      const insertTag = this.db.prepare(`
        INSERT INTO document_tags (doc_id, tag)
        VALUES (@doc_id, @tag)
      `);

      const transaction = this.db.transaction(() => {
        insertDoc.run({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          type: doc.type,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt
        });

        for (const tag of doc.tags) {
          insertTag.run({ doc_id: doc.id, tag });
        }
      });

      transaction();
      return doc;
    });
  }

  getDocument(id: string): Document | null {
    return this.withErrorHandling('getDocument', () => {
      const docRow = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as any;
      if (!docRow) return null;

      const tagRows = this.db.prepare('SELECT tag FROM document_tags WHERE doc_id = ?').all(id) as any[];
      const tags = tagRows.map(row => row.tag);

      return {
        id: docRow.id,
        title: docRow.title,
        content: docRow.content,
        type: docRow.type,
        tags: tags,
        createdAt: docRow.created_at,
        updatedAt: docRow.updated_at
      };
    });
  }

  updateDocument(id: string, updates: Partial<Omit<Document, 'id' | 'createdAt'>>) {
    return this.withErrorHandling('updateDocument', () => {
      const currentDoc = this.getDocument(id);
      if (!currentDoc) {
        throw new Error(`Document with ID ${id} not found`);
      }

      const mergedDoc = { ...currentDoc, ...updates, updatedAt: new Date().toISOString() };

      const updateDoc = this.db.prepare(`
        UPDATE documents
        SET title = @title, content = @content, type = @type, updated_at = @updatedAt
        WHERE id = @id
      `);

      const deleteTags = this.db.prepare('DELETE FROM document_tags WHERE doc_id = ?');
      const insertTag = this.db.prepare(`
        INSERT INTO document_tags (doc_id, tag)
        VALUES (@doc_id, @tag)
      `);

      const transaction = this.db.transaction(() => {
        updateDoc.run({
          id: id,
          title: mergedDoc.title,
          content: mergedDoc.content,
          type: mergedDoc.type,
          updatedAt: mergedDoc.updatedAt
        });

        if (updates.tags) {
          deleteTags.run(id);
          for (const tag of mergedDoc.tags) {
            insertTag.run({ doc_id: id, tag });
          }
        }
      });

      transaction();
      return mergedDoc;
    });
  }

  deleteDocument(id: string) {
    return this.withErrorHandling('deleteDocument', () => {
      const deleteDoc = this.db.prepare('DELETE FROM documents WHERE id = ?');
      const info = deleteDoc.run(id);
      return info.changes > 0;
    });
  }

  listDocuments(options: { type?: string, tags?: string[], sort?: 'created_at' | 'updated_at', limit?: number, offset?: number } = {}) {
    return this.withErrorHandling('listDocuments', () => {
      const buildBase = (includeSort: boolean) => {
        let q = 'SELECT DISTINCT d.* FROM documents d';
        const p: any[] = [];

        if (options.tags && options.tags.length > 0) {
          q += ' JOIN document_tags dt ON d.id = dt.doc_id';
        }

        const conditions: string[] = [];
        if (options.type) {
          conditions.push('d.type = ?');
          p.push(options.type);
        }
        if (options.tags && options.tags.length > 0) {
          const placeholders = options.tags.map(() => '?').join(',');
          conditions.push(`dt.tag IN (${placeholders})`);
          p.push(...options.tags);
        }
        if (conditions.length > 0) {
          q += ' WHERE ' + conditions.join(' AND ');
        }
        if (includeSort) {
          const sortCol = options.sort === 'updated_at' ? 'd.updated_at' : 'd.created_at';
          q += ` ORDER BY ${sortCol} DESC`;
        }
        return { q, p };
      };

      // Total count (without pagination)
      const { q: countQ, p: countP } = buildBase(false);
      const countQuery = `SELECT COUNT(*) as cnt FROM (${countQ}) sub`;
      const { cnt: total } = this.db.prepare(countQuery).get(countP) as { cnt: number };

      // Paginated rows
      const { q, p } = buildBase(true);
      let pagedQ = q;
      const pagedP = [...p];
      if (options.limit !== undefined) {
        pagedQ += ' LIMIT ?';
        pagedP.push(options.limit);
      }
      if (options.offset !== undefined) {
        pagedQ += ' OFFSET ?';
        pagedP.push(options.offset);
      }

      const rows = this.db.prepare(pagedQ).all(pagedP) as any[];

      let tagsByDocId = new Map<string, string[]>();
      if (rows.length > 0) {
        const ids = rows.map((r: any) => r.id);
        const placeholders = ids.map(() => '?').join(',');
        const allTagRows = this.db
          .prepare(`SELECT doc_id, tag FROM document_tags WHERE doc_id IN (${placeholders})`)
          .all(ids) as Array<{ doc_id: string; tag: string }>;
        for (const { doc_id, tag } of allTagRows) {
          const existing = tagsByDocId.get(doc_id);
          if (existing) {
            existing.push(tag);
          } else {
            tagsByDocId.set(doc_id, [tag]);
          }
        }
      }

      const documents = rows.map((docRow: any) => ({
        id: docRow.id,
        title: docRow.title,
        content: docRow.content,
        type: docRow.type,
        tags: tagsByDocId.get(docRow.id) ?? [],
        createdAt: docRow.created_at,
        updatedAt: docRow.updated_at
      }));

      return { documents, total };
    });
  }
}
