import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

function columnExists(table: string, column: string) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row: any) => row.name === column);
}

function addColumn(table: string, column: string, definition: string) {
  if (columnExists(table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`Added ${column} to ${table}`);
}

addColumn('games', 'game_type', 'TEXT DEFAULT "REG"');
addColumn('games', 'weekday', 'TEXT');
addColumn('games', 'gametime', 'TEXT');
addColumn('games', 'location', 'TEXT');
addColumn('games', 'stadium', 'TEXT');
addColumn('games', 'roof', 'TEXT');
addColumn('games', 'surface', 'TEXT');
addColumn('games', 'temp', 'REAL');
addColumn('games', 'wind', 'REAL');
addColumn('games', 'away_rest', 'INTEGER');
addColumn('games', 'home_rest', 'INTEGER');
addColumn('games', 'away_moneyline', 'INTEGER');
addColumn('games', 'home_moneyline', 'INTEGER');
addColumn('games', 'spread_line', 'REAL');
addColumn('games', 'total_line', 'REAL');
addColumn('games', 'div_game', 'BOOLEAN');
addColumn('games', 'away_qb_name', 'TEXT');
addColumn('games', 'home_qb_name', 'TEXT');
addColumn('games', 'away_coach', 'TEXT');
addColumn('games', 'home_coach', 'TEXT');

addColumn('features', 'rest_days', 'REAL');
addColumn('features', 'season_win_pct', 'REAL');
addColumn('features', 'rolling_point_margin', 'REAL');

addColumn('predictions', 'is_correct', 'BOOLEAN');

const deletedPreseason = db.transaction(() => {
  db.prepare(`DELETE FROM predictions WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
  db.prepare(`DELETE FROM features WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
  db.prepare(`DELETE FROM team_game_stats WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
  return db.prepare('DELETE FROM games WHERE game_type = ?').run('PRE');
})();

if (deletedPreseason.changes > 0) {
  console.log(`Removed ${deletedPreseason.changes} preseason games`);
}

console.log('Migration complete');
