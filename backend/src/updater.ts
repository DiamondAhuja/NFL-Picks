import cron from 'node-cron';
import { exec } from 'child_process';
import path from 'path';

export function startUpdater() {
  console.log('Automated updater initialized. Data will be refreshed periodically.');

  // Run every 12 hours (0 0,12 * * *)
  cron.schedule('0 0,12 * * *', () => {
    console.log('[Automated Updater] Starting pipeline refresh...');
    
    // Using tsc built scripts from pipeline
    const pipelineDir = path.resolve(__dirname, '../../pipeline');
    
    const command = 'cd "' + pipelineDir + '" && npx tsc && node dist/fetchData.js && node dist/featureEngineering.js && node dist/trainModel.js';

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error('[Automated Updater] Error: ' + error.message);
        return;
      }
      if (stderr) {
        console.error('[Automated Updater] Stderr: ' + stderr);
      }
      console.log('[Automated Updater] Pipeline refreshed successfully.\n' + stdout);
    });
  });
}
