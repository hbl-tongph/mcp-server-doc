import 'dotenv/config';
import { SQLiteStorage } from './storage/sqlite.js';

function migrate() {
  const dbPath = process.env.DB_PATH || './db.sqlite';
  console.log(`Starting migration on db: ${dbPath}`);
  
  // Storage layer automatically initializes the database schema if not present
  const storage = new SQLiteStorage(dbPath);
  console.log('Migration completed successfully. Database structure is ready.');
}

migrate();
