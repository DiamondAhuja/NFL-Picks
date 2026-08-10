import Database from 'better-sqlite3';
import path from 'path';

// Connect to SQLite database at the project root
const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

console.log('Initializing SQLite database at', dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Teams table
  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    logo_url TEXT
  );

  -- Games table
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    season INTEGER NOT NULL,
    game_type TEXT NOT NULL,
    week INTEGER NOT NULL,
    game_date TEXT NOT NULL,
    home_team_id TEXT NOT NULL,
    away_team_id TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (home_team_id) REFERENCES teams (id),
    FOREIGN KEY (away_team_id) REFERENCES teams (id)
  );

  -- TeamGameStats table (used for calculating rolling averages)
  CREATE TABLE IF NOT EXISTS team_game_stats (
    game_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    points_scored INTEGER,
    points_allowed INTEGER,
    offensive_yards INTEGER,
    passing_yards INTEGER,
    rushing_yards INTEGER,
    turnovers INTEGER,
    PRIMARY KEY (game_id, team_id),
    FOREIGN KEY (game_id) REFERENCES games (id),
    FOREIGN KEY (team_id) REFERENCES teams (id)
  );

  -- Features table (pre-game state for prediction)
  CREATE TABLE IF NOT EXISTS features (
    game_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    is_home BOOLEAN NOT NULL,
    rolling_points_scored REAL,
    rolling_points_allowed REAL,
    rolling_offensive_yards REAL,
    rolling_turnovers REAL,
    win_streak INTEGER,
    elo_rating REAL,
    PRIMARY KEY (game_id, team_id),
    FOREIGN KEY (game_id) REFERENCES games (id),
    FOREIGN KEY (team_id) REFERENCES teams (id)
  );

  -- ModelVersions table
  CREATE TABLE IF NOT EXISTS model_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    version_string TEXT NOT NULL UNIQUE,
    trained_at TEXT NOT NULL,
    accuracy REAL,
    brier_score REAL,
    log_loss REAL,
    description TEXT
  );

  -- Predictions table
  CREATE TABLE IF NOT EXISTS predictions (
    game_id TEXT NOT NULL,
    model_version_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    home_win_prob REAL NOT NULL,
    away_win_prob REAL NOT NULL,
    predicted_home_score INTEGER,
    predicted_away_score INTEGER,
    confidence_level TEXT,
    explanation_json TEXT,
    is_correct BOOLEAN,
    PRIMARY KEY (game_id, model_version_id),
    FOREIGN KEY (game_id) REFERENCES games (id),
    FOREIGN KEY (model_version_id) REFERENCES model_versions (id)
  );
`);

console.log('Database schema initialized successfully.');
