import axios from 'axios';
import csvParser from 'csv-parser';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const TEAMS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv';
const GAMES_URL = 'https://github.com/nflverse/nfldata/raw/master/data/games.csv';

const espnToNflverse: Record<string, string> = {
  'LAR': 'LA',
  'WSH': 'WAS'
};

async function fetchTeams() {
  console.log('Fetching teams...');
  const response = await axios({ url: TEAMS_URL, responseType: 'stream' });
  
  const insertTeam = db.prepare(`
    INSERT OR REPLACE INTO teams (id, name, abbreviation, logo_url) 
    VALUES (?, ?, ?, ?)
  `);

  return new Promise<void>((resolve, reject) => {
    db.transaction(() => {
      response.data
        .pipe(csvParser())
        .on('data', (row: any) => {
          if (row.team_abbr && row.team_name) {
            insertTeam.run(
              row.team_abbr, 
              row.team_name, 
              row.team_abbr, 
              row.team_logo_espn || ''
            );
          }
        })
        .on('end', () => {
          console.log('Teams inserted successfully.');
          resolve();
        })
        .on('error', reject);
    })();
  });
}

async function fetchGames() {
  console.log('Fetching games...');
  const response = await axios({ url: GAMES_URL, responseType: 'stream' });
  
  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games (id, season, game_type, week, game_date, home_team_id, away_team_id, home_score, away_score, completed) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Target seasons (e.g. 2023, 2024, 2025, 2026)
  const targetSeasons = ['2023', '2024', '2025', '2026'];

  return new Promise<void>((resolve, reject) => {
    let count = 0;
    const processRows = db.transaction((rows: any[]) => {
      for (const row of rows) {
        if (targetSeasons.includes(row.season)) {
          const isCompleted = row.home_score !== '' && row.away_score !== '' && row.home_score != null;
          
          // Some old games don't have game_id in a friendly format, use game_id if present, else fallback
          const gameId = row.game_id || `${row.season}_${row.week}_${row.away_team}_${row.home_team}`;
          
          insertGame.run(
            gameId,
            parseInt(row.season),
            row.game_type || 'REG',
            parseInt(row.week),
            row.gameday || '',
            row.home_team,
            row.away_team,
            isCompleted ? parseInt(row.home_score) : null,
            isCompleted ? parseInt(row.away_score) : null,
            isCompleted ? 1 : 0
          );
          count++;
        }
      }
    });

    const rowsBatch: any[] = [];
    response.data
      .pipe(csvParser())
      .on('data', (row: any) => {
        rowsBatch.push(row);
        if (rowsBatch.length >= 100) {
          processRows(rowsBatch);
          rowsBatch.length = 0;
        }
      })
      .on('end', () => {
        if (rowsBatch.length > 0) {
          processRows(rowsBatch);
        }
        console.log(`Games inserted successfully. Count: ${count}`);
        resolve();
      })
      .on('error', reject);
  });
}

async function fetchPreseasonGames() {
  console.log('Fetching ESPN preseason games...');
  const targetSeasons = ['2023', '2024', '2025', '2026'];
  const insertGame = db.prepare(`
    INSERT OR REPLACE INTO games (id, season, game_type, week, game_date, home_team_id, away_team_id, home_score, away_score, completed) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const season of targetSeasons) {
    for (let week = 1; week <= 4; week++) {
      try {
        const url = `http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=1&dates=${season}&week=${week}`;
        const response = await axios.get(url);
        const events = response.data.events || [];
        
        db.transaction(() => {
          for (const event of events) {
            const comp = event.competitions[0];
            if (!comp) continue;
            
            const homeCompetitor = comp.competitors.find((c: any) => c.homeAway === 'home');
            const awayCompetitor = comp.competitors.find((c: any) => c.homeAway === 'away');
            if (!homeCompetitor || !awayCompetitor) continue;
            
            let homeTeam = homeCompetitor.team.abbreviation;
            let awayTeam = awayCompetitor.team.abbreviation;
            
            homeTeam = espnToNflverse[homeTeam] || homeTeam;
            awayTeam = espnToNflverse[awayTeam] || awayTeam;

            const isCompleted = event.status.type.completed;
            const homeScore = isCompleted ? parseInt(homeCompetitor.score) : null;
            const awayScore = isCompleted ? parseInt(awayCompetitor.score) : null;

            const gameId = `${season}_00_${awayTeam}_${homeTeam}_PRE_${week}`;

            insertGame.run(
              gameId,
              parseInt(season),
              'PRE',
              week,
              event.date,
              homeTeam,
              awayTeam,
              homeScore !== null && !isNaN(homeScore) ? homeScore : null,
              awayScore !== null && !isNaN(awayScore) ? awayScore : null,
              isCompleted ? 1 : 0
            );
            count++;
          }
        })();
      } catch (e: any) {
        console.log(`Failed to fetch preseason for ${season} week ${week}: ${e.message}`);
      }
    }
  }
  console.log(`Preseason games inserted successfully. Count: ${count}`);
}

async function run() {
  try {
    await fetchTeams();
    await fetchGames();
    await fetchPreseasonGames();
    console.log('Data ingestion complete.');
  } catch (error) {
    console.error('Error during data ingestion:', error);
  }
}

run();
