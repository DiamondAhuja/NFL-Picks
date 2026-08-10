import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

// Basic matrix math and sigmoid
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

class SimpleLogisticRegression {
  weights: number[];
  bias: number;

  constructor() {
    this.weights = [];
    this.bias = 0;
  }

  train(X: number[][], y: number[], learningRate = 0.01, epochs = 1000) {
    const nFeatures = X[0].length;
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;

    // Normalize X for stable training
    const means = new Array(nFeatures).fill(0);
    const stds = new Array(nFeatures).fill(0);

    for (let j = 0; j < nFeatures; j++) {
      let sum = 0;
      for (let i = 0; i < X.length; i++) sum += X[i][j];
      means[j] = sum / X.length;

      let sumSq = 0;
      for (let i = 0; i < X.length; i++) sumSq += Math.pow(X[i][j] - means[j], 2);
      stds[j] = Math.sqrt(sumSq / X.length) || 1;
    }

    const X_norm = X.map(row => row.map((val, j) => (val - means[j]) / stds[j]));

    // Gradient descent
    for (let epoch = 0; epoch < epochs; epoch++) {
      let dWeights = new Array(nFeatures).fill(0);
      let dBias = 0;

      for (let i = 0; i < X_norm.length; i++) {
        let z = this.bias;
        for (let j = 0; j < nFeatures; j++) z += this.weights[j] * X_norm[i][j];
        
        const yPred = sigmoid(z);
        const error = yPred - y[i];

        dBias += error;
        for (let j = 0; j < nFeatures; j++) {
          dWeights[j] += error * X_norm[i][j];
        }
      }

      this.bias -= (learningRate / X_norm.length) * dBias;
      for (let j = 0; j < nFeatures; j++) {
        this.weights[j] -= (learningRate / X_norm.length) * dWeights[j];
      }
    }

    return { means, stds };
  }

  predictProb(x: number[], means: number[], stds: number[]) {
    let z = this.bias;
    for (let j = 0; j < x.length; j++) {
      const xNorm = (x[j] - means[j]) / stds[j];
      z += this.weights[j] * xNorm;
    }
    return sigmoid(z);
  }
}

export function trainAndPredict() {
  console.log('Fetching training data...');
  
  // Join games and features to get training data
  const rows = db.prepare(`
    SELECT g.id, g.home_team_id, g.away_team_id, g.home_score, g.away_score, g.completed, g.game_type,
           fh.elo_rating as home_elo, fh.rolling_points_scored as home_pts, fh.rolling_points_allowed as home_allow, fh.win_streak as home_streak,
           fa.elo_rating as away_elo, fa.rolling_points_scored as away_pts, fa.rolling_points_allowed as away_allow, fa.win_streak as away_streak
    FROM games g
    JOIN features fh ON g.id = fh.game_id AND fh.team_id = g.home_team_id
    JOIN features fa ON g.id = fa.game_id AND fa.team_id = g.away_team_id
  `).all() as any[];

  // Train only on completed, non-preseason games
  const trainData = rows.filter(r => r.completed && r.home_score !== null && r.away_score !== null && r.game_type !== 'PRE');
  // Predict for all games so we have historical predictions to compare against actual results
  const predictData = rows;

  const extractFeatures = (r: any) => [
    r.home_elo - r.away_elo,
    r.home_pts - r.away_pts,
    r.home_allow - r.away_allow,
    r.home_streak - r.away_streak
  ];

  const featureNames = ["Elo Difference", "Offensive Pts Difference", "Defensive Pts Allowed Difference", "Win Streak Difference"];

  const X_train = trainData.map(extractFeatures);
  const Y_train = trainData.map(r => r.home_score > r.away_score ? 1 : 0);

  const model = new SimpleLogisticRegression();
  console.log('Training on ' + X_train.length + ' games...');
  const normParams = model.train(X_train, Y_train, 0.5, 2000);

  // Evaluate
  let correct = 0;
  let brier = 0;
  let logloss = 0;

  for (let i = 0; i < X_train.length; i++) {
    const prob = model.predictProb(X_train[i], normParams.means, normParams.stds);
    const pred = prob > 0.5 ? 1 : 0;
    if (pred === Y_train[i]) correct++;
    brier += Math.pow(prob - Y_train[i], 2);
    logloss += - (Y_train[i] * Math.log(prob + 1e-9) + (1 - Y_train[i]) * Math.log(1 - prob + 1e-9));
  }

  const accuracy = correct / X_train.length;
  brier /= X_train.length;
  logloss /= X_train.length;

  console.log('Train Accuracy: ' + (accuracy * 100).toFixed(1) + '%');
  console.log('Brier Score: ' + brier.toFixed(4));
  console.log('Log Loss: ' + logloss.toFixed(4));

  // Save model version
  const versionString = 'v1.0-' + Date.now();
  const insertModel = db.prepare(`
    INSERT INTO model_versions (version_string, trained_at, accuracy, brier_score, log_loss, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const modelRes = insertModel.run(versionString, new Date().toISOString(), accuracy, brier, logloss, 'Logistic Regression Baseline');
  const modelId = modelRes.lastInsertRowid;

  // Generate Predictions for upcoming games
  console.log('Generating predictions for ' + predictData.length + ' upcoming games...');
  
  const insertPred = db.prepare(`
    INSERT OR REPLACE INTO predictions (game_id, model_version_id, timestamp, home_win_prob, away_win_prob, predicted_home_score, predicted_away_score, confidence_level, explanation_json, is_correct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  db.transaction(() => {
    for (const r of predictData) {
      const x = extractFeatures(r);
      const homeProb = model.predictProb(x, normParams.means, normParams.stds);
      const awayProb = 1 - homeProb;

      let confidence = 'Low';
      const diff = Math.abs(homeProb - awayProb);
      if (diff > 0.6) confidence = 'Very High';
      else if (diff > 0.3) confidence = 'High';
      else if (diff > 0.1) confidence = 'Medium';

      // Estimate scores loosely based on points scored and allowed + probabilities
      const baseHomeScore = ((r.home_pts + r.away_allow) / 2) || 24;
      const baseAwayScore = ((r.away_pts + r.home_allow) / 2) || 21;
      
      const homeScorePred = Math.round(baseHomeScore * (homeProb > 0.5 ? 1.1 : 0.9) + 2); // Home advantage
      const awayScorePred = Math.round(baseAwayScore * (awayProb > 0.5 ? 1.1 : 0.9));

      // Explanation (feature importance for this specific game)
      const explanations = featureNames.map((name, idx) => {
        const xNorm = (x[idx] - normParams.means[idx]) / normParams.stds[idx];
        const impact = model.weights[idx] * xNorm;
        return { feature: name, value: x[idx], impact, favors: impact > 0 ? r.home_team_id : r.away_team_id };
      });
      explanations.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

      // Grade prediction if game is completed
      let isCorrect = null;
      if (r.completed && r.home_score !== null && r.away_score !== null) {
        const homeWon = r.home_score > r.away_score;
        const predictedHomeWin = homeProb > 0.5;
        isCorrect = (homeWon === predictedHomeWin) ? 1 : 0;
      }

      insertPred.run(
        r.id,
        modelId,
        new Date().toISOString(),
        homeProb,
        awayProb,
        homeScorePred,
        awayScorePred,
        confidence,
        JSON.stringify(explanations.slice(0, 3)),
        isCorrect
      );
      count++;
    }
  })();
  
  console.log('Prediction generation complete. Inserted ' + count + ' predictions.');
}

if (require.main === module) {
  trainAndPredict();
}
