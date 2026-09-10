import cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';

let isRunning = false;

function runPipeline(reason: string) {
  if (isRunning) {
    console.log(`[Automated Updater] Skipping ${reason}; a refresh is already running.`);
    return;
  }

  isRunning = true;
  console.log(`[Automated Updater] Starting pipeline refresh (${reason})...`);

  const pipelineDir = path.resolve(__dirname, '../../pipeline');
  const command = 'npx tsc && node dist/dbSetup.js && node dist/migrate.js && node dist/fetchData.js && node dist/featureEngineering.js && node dist/trainModel.js';

  exec(command, { cwd: pipelineDir, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
    isRunning = false;

    if (error) {
      console.error('[Automated Updater] Error: ' + error.message);
      return;
    }
    if (stderr) {
      console.error('[Automated Updater] Stderr: ' + stderr);
    }
    console.log('[Automated Updater] Pipeline refreshed successfully.\n' + stdout);
  });
}

export function startUpdater() {
  console.log('Automated updater initialized. Data will be refreshed periodically.');

  setTimeout(() => runPipeline('startup'), 1000);

  // Refresh every 30 minutes so completed games move out of upcoming soon after data updates upstream.
  cron.schedule('*/30 * * * *', () => runPipeline('scheduled'));
}
