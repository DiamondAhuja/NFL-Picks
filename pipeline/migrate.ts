import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

try {
  db.exec('ALTER TABLE games ADD COLUMN game_type TEXT DEFAULT "REG"');
  console.log('Added game_type to games');
} catch (e: any) {
  console.log('game_type already exists or error:', e.message);
}

try {
  db.exec('ALTER TABLE predictions ADD COLUMN is_correct BOOLEAN');
  console.log('Added is_correct to predictions');
} catch (e: any) {
  console.log('is_correct already exists or error:', e.message);
}

console.log('Migration complete');
