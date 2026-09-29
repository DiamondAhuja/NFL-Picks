import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const ELO_K = 20;
const HOME_ADVANTAGE = 50;
const OFFSEASON_REGRESSION = 0.35;

function expectedResult(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function runFeatureEngineering() {
  console.log('Starting feature engineering...');
  
  // Clear existing features
  db.exec('DELETE FROM features');

  const insertFeature = db.prepare(`
    INSERT INTO features (
      game_id, team_id, is_home, rolling_points_scored, rolling_points_allowed,
      rolling_offensive_yards, rolling_turnovers, win_streak, elo_rating, qb_elo,
      injury_impact, rest_days, season_win_pct, rolling_point_margin
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const games = db.prepare(`
    SELECT id, season, week, game_type, game_date, home_team_id, away_team_id,
           home_score, away_score, completed, home_rest, away_rest, home_qb_name, away_qb_name
    FROM games 
    WHERE game_type != 'PRE'
    ORDER BY season ASC, game_date ASC, week ASC
  `).all();

  // State trackers
  const teamElo: Record<string, number> = {};
  const qbElo: Record<string, number> = {};
  const teamHistory: Record<string, { pointsFor: number, pointsAgainst: number, won: boolean }[]> = {};
  const seasonRecords: Record<string, { wins: number, losses: number, ties: number }> = {};
  let currentSeason: number | null = null;

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

  const getRollingMargin = (teamId: string, n = 5) => {
    const history = teamHistory[teamId] || [];
    if (history.length === 0) return 0;
    const recent = history.slice(-n);
    const sum = recent.reduce((acc, curr) => acc + curr.pointsFor - curr.pointsAgainst, 0);
    return sum / recent.length;
  };

  const getSeasonWinPct = (teamId: string) => {
    const record = seasonRecords[teamId];
    if (!record) return 0.5;
    const gamesPlayed = record.wins + record.losses + record.ties;
    if (gamesPlayed === 0) return 0.5;
    return (record.wins + record.ties * 0.5) / gamesPlayed;
  };

  const ensureTeam = (teamId: string) => {
    if (!teamElo[teamId]) teamElo[teamId] = 1500;
    if (!teamHistory[teamId]) teamHistory[teamId] = [];
    if (!seasonRecords[teamId]) seasonRecords[teamId] = { wins: 0, losses: 0, ties: 0 };
  };

  const ensureQb = (qbName: string | null) => {
    if (qbName && !qbElo[qbName]) qbElo[qbName] = 1500;
  };

  let count = 0;

  const getInjuredPlayers = db.prepare(`
    SELECT gsis_id, position FROM injuries 
    WHERE team = ? AND season = ? AND week = ? 
    AND report_status IN ('Out', 'Doubtful')
  `);

  const getPlayerImpact = db.prepare(`
    SELECT AVG(fantasy_points) as avg_pts FROM (
      SELECT fantasy_points FROM player_stats 
      WHERE gsis_id = ? AND (season < ? OR (season = ? AND week < ?))
      ORDER BY season DESC, week DESC
      LIMIT 10
    )
  `);

  db.transaction(() => {
    for (const game of games as any[]) {
      if (currentSeason !== game.season) {
        for (const teamId of Object.keys(teamElo)) {
          teamElo[teamId] = 1500 + (teamElo[teamId] - 1500) * (1 - OFFSEASON_REGRESSION);
        }
        for (const qbName of Object.keys(qbElo)) {
          qbElo[qbName] = 1500 + (qbElo[qbName] - 1500) * (1 - OFFSEASON_REGRESSION);
        }
        for (const teamId of Object.keys(seasonRecords)) {
          seasonRecords[teamId] = { wins: 0, losses: 0, ties: 0 };
        }
        currentSeason = game.season;
      }

      const homeId = game.home_team_id;
      const awayId = game.away_team_id;
      const homeQb = game.home_qb_name || 'Unknown';
      const awayQb = game.away_qb_name || 'Unknown';

      const calcInjuryImpact = (teamId: string) => {
        const injured = getInjuredPlayers.all(teamId, game.season, game.week) as any[];
        let totalImpact = 0;
        for (const p of injured) {
          const impactRow = getPlayerImpact.get(p.gsis_id, game.season, game.season, game.week) as any;
          const pts = impactRow && impactRow.avg_pts != null ? impactRow.avg_pts : 0;
          if (pts > 2) { // only count if they actually score fantasy points
            totalImpact += (p.position === 'QB' ? pts * 2 : pts);
          }
        }
        return totalImpact;
      };

      const homeInjuryImpact = calcInjuryImpact(homeId);
      const awayInjuryImpact = calcInjuryImpact(awayId);

      ensureTeam(homeId);
      ensureTeam(awayId);
      ensureQb(homeQb);
      ensureQb(awayQb);

      // Calculate pre-game features
      const homeElo = teamElo[homeId] + HOME_ADVANTAGE;
      const awayElo = teamElo[awayId];

      // Insert pre-game features (only for games that have valid teams, some might be empty if bad data)
      if (homeId && awayId) {
        insertFeature.run(game.id, homeId, 1, getRollingAvg(homeId, 'pointsFor'), getRollingAvg(homeId, 'pointsAgainst'), 350, 1.5, getWinStreak(homeId), teamElo[homeId], qbElo[homeQb], homeInjuryImpact, game.home_rest ?? 7, getSeasonWinPct(homeId), getRollingMargin(homeId));
        insertFeature.run(game.id, awayId, 0, getRollingAvg(awayId, 'pointsFor'), getRollingAvg(awayId, 'pointsAgainst'), 350, 1.5, getWinStreak(awayId), teamElo[awayId], qbElo[awayQb], awayInjuryImpact, game.away_rest ?? 7, getSeasonWinPct(awayId), getRollingMargin(awayId));
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
        const expectedHomeQb = expectedResult(qbElo[homeQb] + HOME_ADVANTAGE, qbElo[awayQb]);
        const expectedAwayQb = expectedResult(qbElo[awayQb], qbElo[homeQb] + HOME_ADVANTAGE);

        // Margin of victory multiplier
        const mov = Math.abs(game.home_score - game.away_score);
        const movMultiplier = Math.log(mov + 1) * (2.2 / ((homeElo - awayElo) * 0.001 + 2.2));
        const qbMovMultiplier = Math.log(mov + 1) * (2.2 / ((qbElo[homeQb] - qbElo[awayQb]) * 0.001 + 2.2));

        teamElo[homeId] = teamElo[homeId] + ELO_K * movMultiplier * (homeResult - expectedHome);
        teamElo[awayId] = teamElo[awayId] + ELO_K * movMultiplier * (awayResult - expectedAway);
        qbElo[homeQb] = qbElo[homeQb] + ELO_K * qbMovMultiplier * (homeResult - expectedHomeQb);
        qbElo[awayQb] = qbElo[awayQb] + ELO_K * qbMovMultiplier * (awayResult - expectedAwayQb);

        teamHistory[homeId].push({ pointsFor: game.home_score, pointsAgainst: game.away_score, won: homeWon });
        teamHistory[awayId].push({ pointsFor: game.away_score, pointsAgainst: game.home_score, won: awayWon });

        if (isTie) {
          seasonRecords[homeId].ties++;
          seasonRecords[awayId].ties++;
        } else if (homeWon) {
          seasonRecords[homeId].wins++;
          seasonRecords[awayId].losses++;
        } else {
          seasonRecords[awayId].wins++;
          seasonRecords[homeId].losses++;
        }
      }
    }
  })();

  console.log('Feature engineering complete. Inserted ' + count + ' feature records.');
}

// If run directly
if (require.main === module) {
  runFeatureEngineering();
}
