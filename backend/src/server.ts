import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.resolve(__dirname, '../../pipeline/database.sqlite');
const db = new Database(dbPath, { readonly: true });

// Upcoming games with predictions
app.get('/api/games/upcoming', (req, res) => {
  const games = db.prepare(`
    SELECT g.id, g.season, g.week, g.game_date,
           ht.name as home_team, ht.logo_url as home_logo, ht.id as home_team_id,
           at.name as away_team, at.logo_url as away_logo, at.id as away_team_id,
           p.home_win_prob, p.away_win_prob, p.predicted_home_score, p.predicted_away_score, p.confidence_level
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    LEFT JOIN predictions p ON g.id = p.game_id
    WHERE g.completed = 0
    ORDER BY g.season ASC, g.week ASC, g.game_date ASC
    LIMIT 50
  `).all();
  res.json(games);
});

// Specific game details
app.get('/api/games/:id', (req, res) => {
  const game = db.prepare(`
    SELECT g.*, 
           ht.name as home_team, ht.logo_url as home_logo,
           at.name as away_team, at.logo_url as away_logo,
           p.home_win_prob, p.away_win_prob, p.predicted_home_score, p.predicted_away_score, p.confidence_level, p.explanation_json,
           fh.win_streak as home_streak, fa.win_streak as away_streak,
           fh.rolling_points_scored as home_pts, fa.rolling_points_scored as away_pts,
           fh.rolling_points_allowed as home_allow, fa.rolling_points_allowed as away_allow
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    LEFT JOIN predictions p ON g.id = p.game_id
    LEFT JOIN features fh ON g.id = fh.game_id AND fh.team_id = g.home_team_id
    LEFT JOIN features fa ON g.id = fa.game_id AND fa.team_id = g.away_team_id
    WHERE g.id = ?
  `).get(req.params.id);

  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Model performance
app.get('/api/performance', (req, res) => {
  const model = db.prepare(`
    SELECT * FROM model_versions ORDER BY trained_at DESC LIMIT 1
  `).get();
  res.json(model);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log('Backend API running on port ' + PORT);
});
