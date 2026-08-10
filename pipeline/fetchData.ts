import axios from 'axios';
import csvParser from 'csv-parser';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const TEAMS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv';
const GAMES_URL = 'https://github.com/nflverse/nfldata/raw/master/data/games.csv';

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
    INSERT OR REPLACE INTO games (id, season, week, game_date, home_team_id, away_team_id, home_score, away_score, completed) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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

async function run() {
  try {
    await fetchTeams();
    await fetchGames();
    console.log('Data ingestion complete.');
  } catch (error) {
    console.error('Error during data ingestion:', error);
  }
}

run();
