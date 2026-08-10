import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const ELO_K = 20;
const HOME_ADVANTAGE = 50;

function expectedResult(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function runFeatureEngineering() {
  console.log('Starting feature engineering...');
  
  // Clear existing features
  db.exec('DELETE FROM features');

  const insertFeature = db.prepare(`
    INSERT INTO features (game_id, team_id, is_home, rolling_points_scored, rolling_points_allowed, rolling_offensive_yards, rolling_turnovers, win_streak, elo_rating)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const games = db.prepare(`
    SELECT id, season, week, game_type, home_team_id, away_team_id, home_score, away_score, completed 
    FROM games 
    ORDER BY season ASC, week ASC
  `).all();

  // State trackers
  const teamElo: Record<string, number> = {};
  const teamHistory: Record<string, { pointsFor: number, pointsAgainst: number, won: boolean }[]> = {};

  const getRollingAvg = (teamId: string, key: 'pointsFor' | 'pointsAgainst', n = 5) => {
    const history = teamHistory[teamId] || [];
    if (history.length === 0) return 20; // Default baseline
    const recent = history.slice(-n);
    const sum = recent.reduce((acc, curr) => acc + curr[key], 0);
    return sum / recent.length;
  };

  const getWinStreak = (teamId: string) => {
    const history = teamHistory[teamId] || [];
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].won) streak++;
      else break;
    }
    return streak;
  };

  let count = 0;

  db.transaction(() => {
    for (const game of games as any[]) {
      const homeId = game.home_team_id;
      const awayId = game.away_team_id;

      // Initialize if not exists
      if (!teamElo[homeId]) teamElo[homeId] = 1500;
      if (!teamElo[awayId]) teamElo[awayId] = 1500;
      if (!teamHistory[homeId]) teamHistory[homeId] = [];
      if (!teamHistory[awayId]) teamHistory[awayId] = [];

      // Calculate pre-game features
      const homeElo = teamElo[homeId] + HOME_ADVANTAGE;
      const awayElo = teamElo[awayId];

      // Insert pre-game features (only for games that have valid teams, some might be empty if bad data)
      if (homeId && awayId) {
        insertFeature.run(game.id, homeId, 1, getRollingAvg(homeId, 'pointsFor'), getRollingAvg(homeId, 'pointsAgainst'), 350, 1.5, getWinStreak(homeId), teamElo[homeId]);
        insertFeature.run(game.id, awayId, 0, getRollingAvg(awayId, 'pointsFor'), getRollingAvg(awayId, 'pointsAgainst'), 350, 1.5, getWinStreak(awayId), teamElo[awayId]);
        count += 2;
      }

      // Update state if game is completed and it's NOT a preseason game
      if (game.completed && game.home_score != null && game.away_score != null && game.game_type !== 'PRE') {
        const homeWon = game.home_score > game.away_score;
        const awayWon = game.away_score > game.home_score;
        const isTie = game.home_score === game.away_score;

        const homeResult = homeWon ? 1 : isTie ? 0.5 : 0;
        const awayResult = awayWon ? 1 : isTie ? 0.5 : 0;

        const expectedHome = expectedResult(homeElo, awayElo);
        const expectedAway = expectedResult(awayElo, homeElo);

        // Margin of victory multiplier
        const mov = Math.abs(game.home_score - game.away_score);
        const movMultiplier = Math.log(mov + 1) * (2.2 / ((homeElo - awayElo) * 0.001 + 2.2));

        teamElo[homeId] = teamElo[homeId] + ELO_K * movMultiplier * (homeResult - expectedHome);
        teamElo[awayId] = teamElo[awayId] + ELO_K * movMultiplier * (awayResult - expectedAway);

        teamHistory[homeId].push({ pointsFor: game.home_score, pointsAgainst: game.away_score, won: homeWon });
        teamHistory[awayId].push({ pointsFor: game.away_score, pointsAgainst: game.home_score, won: awayWon });
      }
    }
  })();

  console.log('Feature engineering complete. Inserted ' + count + ' feature records.');
}

// If run directly
if (require.main === module) {
  runFeatureEngineering();
}
