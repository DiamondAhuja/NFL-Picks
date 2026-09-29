import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const TEAMS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv';
const GAMES_URL = 'https://github.com/nflverse/nfldata/raw/master/data/games.csv';

const HISTORY_START_YEAR = 2018;
const FUTURE_SEASONS_TO_KEEP = 1;

function nullableText(value: unknown) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function nullableNumber(value: unknown) {
  const text = nullableText(value);
  if (text == null) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableInteger(value: unknown) {
  const parsed = nullableNumber(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

async function fetchCsvRows(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map(header => header.trim());
  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

async function fetchTeams() {
  console.log('Fetching teams...');
  const rows = await fetchCsvRows(TEAMS_URL);

  const insertTeam = db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, abbreviation, logo_url)
    VALUES (?, ?, ?, ?)
  `);

  db.transaction(() => {
    for (const row of rows) {
      if (row.team_abbr && row.team_name) {
        insertTeam.run(
          row.team_abbr,
          row.team_name,
          row.team_abbr,
          row.team_logo_espn || ''
        );
      }
    }
  })();

  console.log('Teams inserted successfully.');
}

async function fetchGames() {
  console.log('Fetching games...');
  const rows = await fetchCsvRows(GAMES_URL);

  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games (
      id, season, game_type, week, game_date, weekday, gametime,
      home_team_id, away_team_id, home_score, away_score, completed,
      location, stadium, roof, surface, temp, wind, away_rest, home_rest,
      away_moneyline, home_moneyline, spread_line, total_line, div_game,
      away_qb_name, home_qb_name, away_coach, home_coach
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const currentYear = new Date().getFullYear();
  const latestSeason = currentYear + FUTURE_SEASONS_TO_KEEP;

  db.transaction(() => {
    db.prepare(`DELETE FROM predictions WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
    db.prepare(`DELETE FROM features WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
    db.prepare(`DELETE FROM team_game_stats WHERE game_id IN (SELECT id FROM games WHERE game_type = ?)`).run('PRE');
    db.prepare('DELETE FROM games WHERE game_type = ?').run('PRE');
  })();

  let count = 0;
  db.transaction(() => {
    for (const row of rows) {
      const season = nullableInteger(row.season);
      const gameType = nullableText(row.game_type) || 'REG';

      if (season == null || season < HISTORY_START_YEAR || season > latestSeason || gameType === 'PRE') {
        continue;
      }

      const isCompleted = row.home_score !== '' && row.away_score !== '' && row.home_score != null;
      const gameId = row.game_id || `${row.season}_${row.week}_${row.away_team}_${row.home_team}`;

      insertGame.run(
        gameId,
        season,
        gameType,
        nullableInteger(row.week) || 0,
        nullableText(row.gameday) || '',
        nullableText(row.weekday),
        nullableText(row.gametime),
        row.home_team,
        row.away_team,
        isCompleted ? nullableInteger(row.home_score) : null,
        isCompleted ? nullableInteger(row.away_score) : null,
        isCompleted ? 1 : 0,
        nullableText(row.location),
        nullableText(row.stadium),
        nullableText(row.roof),
        nullableText(row.surface),
        nullableNumber(row.temp),
        nullableNumber(row.wind),
        nullableInteger(row.away_rest),
        nullableInteger(row.home_rest),
        nullableInteger(row.away_moneyline),
        nullableInteger(row.home_moneyline),
        nullableNumber(row.spread_line),
        nullableNumber(row.total_line),
        nullableInteger(row.div_game),
        nullableText(row.away_qb_name),
        nullableText(row.home_qb_name),
        nullableText(row.away_coach),
        nullableText(row.home_coach)
      );
      count++;
    }
  })();

  console.log(`Games inserted successfully. Count: ${count}`);
}

async function fetchPlayerStatsAndInjuries() {
  console.log('Fetching player stats and injuries...');
  const currentYear = new Date().getFullYear();
  const latestSeason = currentYear + FUTURE_SEASONS_TO_KEEP;

  const insertStat = db.prepare(`
    INSERT OR REPLACE INTO player_stats (gsis_id, season, week, team, position, fantasy_points)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertInjury = db.prepare(`
    INSERT OR REPLACE INTO injuries (gsis_id, season, week, team, report_status, position)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let season = HISTORY_START_YEAR; season <= latestSeason; season++) {
    console.log(`Fetching stats and injuries for ${season}...`);
    let stats: any[] = [];
    let injuries: any[] = [];

    try {
      stats = await fetchCsvRows(`https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_${season}.csv`);
    } catch (e) {
      try {
        stats = await fetchCsvRows(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`);
      } catch (e2) {
        console.log(`Could not fetch player stats for ${season}.`);
      }
    }

    try {
      injuries = await fetchCsvRows(`https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_${season}.csv`);
    } catch (e) {
      console.log(`Could not fetch injuries for ${season}.`);
    }

    if (stats.length > 0 || injuries.length > 0) {
      db.transaction(() => {
        for (const row of stats) {
          if (row.player_id && (row.recent_team || row.team)) {
            insertStat.run(row.player_id, season, nullableInteger(row.week) || 0, row.recent_team || row.team, row.position || '', nullableNumber(row.fantasy_points) || 0);
          }
        }
        for (const row of injuries) {
          if (row.gsis_id && row.team) {
            insertInjury.run(row.gsis_id, season, nullableInteger(row.week) || 0, row.team, row.report_status || '', row.position || '');
          }
        }
      })();
    }
  }
  console.log('Player stats and injuries inserted successfully.');
}

async function run() {
  try {
    await fetchTeams();
    await fetchGames();
    await fetchPlayerStatsAndInjuries();
    console.log('Data ingestion complete.');
  } catch (error) {
    console.error('Error during data ingestion:', error);
    process.exitCode = 1;
  }
}

run();
