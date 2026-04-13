export interface Document {
  id: string;        // nanoid, e.g. "abc123"
  title: string;     // required
  content: string;   // markdown
  type: string;      // "detail-design" (MVP default)
  tags: string[];    // ["auth", "backend"]
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
