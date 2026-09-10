import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new Database(dbPath);

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

type NormParams = {
  means: number[];
  stds: number[];
};

type GameRow = {
  id: string;
  season: number;
  week: number;
  game_date: string;
  home_team_id: string;
  away_team_id: string;
  home_score: number | null;
  away_score: number | null;
  completed: number;
  game_type: string;
  spread_line: number | null;
  total_line: number | null;
  home_moneyline: number | null;
  away_moneyline: number | null;
  div_game: number | null;
  home_elo: number;
  home_pts: number;
  home_allow: number;
  home_streak: number;
  home_rest: number;
  home_win_pct: number;
  home_margin: number;
  away_elo: number;
  away_pts: number;
  away_allow: number;
  away_streak: number;
  away_rest: number;
  away_win_pct: number;
  away_margin: number;
};

class RegularizedLogisticRegression {
  weights: number[] = [];
  bias = 0;

  train(X: number[][], y: number[], sampleWeights: number[], learningRate = 0.04, epochs = 4500, l2 = 0.025): NormParams {
    const nFeatures = X[0].length;
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;

    const means = new Array(nFeatures).fill(0);
    const stds = new Array(nFeatures).fill(0);

    for (let j = 0; j < nFeatures; j++) {
      means[j] = X.reduce((sum, row) => sum + row[j], 0) / X.length;
      const variance = X.reduce((sum, row) => sum + Math.pow(row[j] - means[j], 2), 0) / X.length;
      stds[j] = Math.sqrt(variance) || 1;
    }

    const normalized = X.map(row => row.map((value, j) => (value - means[j]) / stds[j]));
    const weightTotal = sampleWeights.reduce((sum, value) => sum + value, 0) || X.length;

    for (let epoch = 0; epoch < epochs; epoch++) {
      const dWeights = new Array(nFeatures).fill(0);
      let dBias = 0;

      for (let i = 0; i < normalized.length; i++) {
        let z = this.bias;
        for (let j = 0; j < nFeatures; j++) z += this.weights[j] * normalized[i][j];

        const error = (sigmoid(z) - y[i]) * sampleWeights[i];
        dBias += error;
        for (let j = 0; j < nFeatures; j++) {
          dWeights[j] += error * normalized[i][j];
        }
      }

      this.bias -= (learningRate / weightTotal) * dBias;
      for (let j = 0; j < nFeatures; j++) {
        const regularization = l2 * this.weights[j];
        this.weights[j] -= learningRate * ((dWeights[j] / weightTotal) + regularization);
      }
    }

    return { means, stds };
  }

  predictProb(x: number[], normParams: NormParams) {
    let z = this.bias;
    for (let j = 0; j < x.length; j++) {
      z += this.weights[j] * ((x[j] - normParams.means[j]) / normParams.stds[j]);
    }
    return sigmoid(z);
  }
}

function num(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function americanOddsToProbability(odds: number | null) {
  if (odds == null || !Number.isFinite(odds) || odds === 0) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

function marketHomeProbability(row: GameRow) {
  const home = americanOddsToProbability(row.home_moneyline);
  const away = americanOddsToProbability(row.away_moneyline);

  if (home != null && away != null && home + away > 0) {
    return home / (home + away);
  }

  if (row.spread_line != null && Number.isFinite(row.spread_line)) {
    return sigmoid(row.spread_line / 7);
  }

  return null;
}

const featureNames = [
  'Elo rating edge',
  'Recent scoring edge',
  'Recent defensive edge',
  'Recent point margin edge',
  'Season win rate edge',
  'Rest edge',
  'Win streak edge',
  'Home-field advantage',
  'Divisional matchup',
  'Market spread edge',
  'Market signal available'
];

function extractFeatures(row: GameRow) {
  const marketProb = marketHomeProbability(row);

  return [
    num(row.home_elo, 1500) - num(row.away_elo, 1500),
    num(row.home_pts, 21) - num(row.away_pts, 21),
    num(row.away_allow, 21) - num(row.home_allow, 21),
    num(row.home_margin) - num(row.away_margin),
    num(row.home_win_pct, 0.5) - num(row.away_win_pct, 0.5),
    num(row.home_rest, 7) - num(row.away_rest, 7),
    num(row.home_streak) - num(row.away_streak),
    1,
    row.div_game ? 1 : 0,
    row.spread_line == null ? 0 : row.spread_line,
    marketProb == null ? 0 : 1
  ];
}

function recencyWeight(row: GameRow, latestSeason: number) {
  const age = Math.max(0, latestSeason - row.season);
  return Math.pow(0.78, age);
}

function scorePredictions(actual: number[], probs: number[]) {
  let correct = 0;
  let brier = 0;
  let logloss = 0;

  for (let i = 0; i < actual.length; i++) {
    const prob = Math.max(0.01, Math.min(0.99, probs[i]));
    const pred = prob >= 0.5 ? 1 : 0;
    if (pred === actual[i]) correct++;
    brier += Math.pow(prob - actual[i], 2);
    logloss += -(actual[i] * Math.log(prob) + (1 - actual[i]) * Math.log(1 - prob));
  }

  return {
    accuracy: correct / actual.length,
    brier: brier / actual.length,
    logloss: logloss / actual.length
  };
}

function blendedProbability(modelProb: number, marketProb: number | null, marketWeight: number) {
  if (marketProb == null) return modelProb;
  return modelProb * (1 - marketWeight) + marketProb * marketWeight;
}

function trainModel(rows: GameRow[]) {
  const X = rows.map(extractFeatures);
  const y = rows.map(row => row.home_score! > row.away_score! ? 1 : 0);
  const latestSeason = Math.max(...rows.map(row => row.season));
  const weights = rows.map(row => recencyWeight(row, latestSeason));

  const model = new RegularizedLogisticRegression();
  const normParams = model.train(X, y, weights);

  return { model, normParams };
}

function tuneMarketBlend(model: RegularizedLogisticRegression, normParams: NormParams, validationRows: GameRow[]) {
  const y = validationRows.map(row => row.home_score! > row.away_score! ? 1 : 0);
  let bestWeight = 0;
  let bestMetrics = scorePredictions(y, validationRows.map(row => model.predictProb(extractFeatures(row), normParams)));

  for (let weight = 0; weight <= 0.65; weight += 0.05) {
    const roundedWeight = Number(weight.toFixed(2));
    const probs = validationRows.map(row => blendedProbability(
      model.predictProb(extractFeatures(row), normParams),
      marketHomeProbability(row),
      roundedWeight
    ));
    const metrics = scorePredictions(y, probs);

    if (metrics.logloss < bestMetrics.logloss) {
      bestWeight = roundedWeight;
      bestMetrics = metrics;
    }
  }

  return { bestWeight, bestMetrics };
}

export function trainAndPredict() {
  console.log('Fetching training data...');

  const rows = db.prepare(`
    SELECT g.id, g.season, g.week, g.game_date, g.home_team_id, g.away_team_id,
           g.home_score, g.away_score, g.completed, g.game_type, g.spread_line,
           g.total_line, g.home_moneyline, g.away_moneyline, g.div_game,
           fh.elo_rating as home_elo, fh.rolling_points_scored as home_pts,
           fh.rolling_points_allowed as home_allow, fh.win_streak as home_streak,
           fh.rest_days as home_rest, fh.season_win_pct as home_win_pct,
           fh.rolling_point_margin as home_margin,
           fa.elo_rating as away_elo, fa.rolling_points_scored as away_pts,
           fa.rolling_points_allowed as away_allow, fa.win_streak as away_streak,
           fa.rest_days as away_rest, fa.season_win_pct as away_win_pct,
           fa.rolling_point_margin as away_margin
    FROM games g
    JOIN features fh ON g.id = fh.game_id AND fh.team_id = g.home_team_id
    JOIN features fa ON g.id = fa.game_id AND fa.team_id = g.away_team_id
    WHERE g.game_type != 'PRE'
    ORDER BY g.game_date ASC, g.season ASC, g.week ASC
  `).all() as GameRow[];

  const trainData = rows.filter(row =>
    row.completed &&
    row.home_score !== null &&
    row.away_score !== null &&
    row.home_score !== row.away_score &&
    row.game_type !== 'PRE'
  );
  const predictData = rows.filter(row => row.game_type !== 'PRE');

  if (trainData.length < 50) {
    throw new Error(`Not enough completed regular/playoff games to train. Found ${trainData.length}.`);
  }

  const splitIndex = Math.max(1, Math.floor(trainData.length * 0.8));
  const fitRows = trainData.slice(0, splitIndex);
  const validationRows = trainData.slice(splitIndex);

  console.log(`Training validation model on ${fitRows.length} games; validating on ${validationRows.length} games...`);
  const validationFit = trainModel(fitRows);
  const { bestWeight: marketWeight, bestMetrics } = tuneMarketBlend(validationFit.model, validationFit.normParams, validationRows);

  console.log('Holdout Accuracy: ' + (bestMetrics.accuracy * 100).toFixed(1) + '%');
  console.log('Holdout Brier Score: ' + bestMetrics.brier.toFixed(4));
  console.log('Holdout Log Loss: ' + bestMetrics.logloss.toFixed(4));
  console.log('Market blend weight: ' + marketWeight.toFixed(2));

  console.log('Training final model on ' + trainData.length + ' completed games...');
  const finalFit = trainModel(trainData);

  const versionString = 'v2.0-' + Date.now();
  const insertModel = db.prepare(`
    INSERT INTO model_versions (version_string, trained_at, accuracy, brier_score, log_loss, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const modelRes = insertModel.run(
    versionString,
    new Date().toISOString(),
    bestMetrics.accuracy,
    bestMetrics.brier,
    bestMetrics.logloss,
    `Regularized recency-weighted model with Elo, form, rest, divisional context, and ${marketWeight.toFixed(2)} market blend. Metrics are final chronological holdout.`
  );
  const modelId = modelRes.lastInsertRowid;

  console.log('Generating predictions for ' + predictData.length + ' games...');

  const insertPred = db.prepare(`
    INSERT OR REPLACE INTO predictions (game_id, model_version_id, timestamp, home_win_prob, away_win_prob, predicted_home_score, predicted_away_score, confidence_level, explanation_json, is_correct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  db.transaction(() => {
    for (const row of predictData) {
      const x = extractFeatures(row);
      const modelProb = finalFit.model.predictProb(x, finalFit.normParams);
      const marketProb = marketHomeProbability(row);
      const homeProb = Math.max(0.03, Math.min(0.97, blendedProbability(modelProb, marketProb, marketWeight)));
      const awayProb = 1 - homeProb;

      const diff = Math.abs(homeProb - awayProb);
      let confidence = 'Low';
      if (diff > 0.46) confidence = 'Very High';
      else if (diff > 0.28) confidence = 'High';
      else if (diff > 0.12) confidence = 'Medium';

      const projectedTotal = row.total_line && row.total_line > 20
        ? row.total_line
        : Math.max(31, Math.min(61, (num(row.home_pts, 22) + num(row.away_pts, 22) + num(row.home_allow, 22) + num(row.away_allow, 22)) / 2));
      const modelSpread = (homeProb - 0.5) * 16;
      const marketSpread = row.spread_line == null ? null : row.spread_line;
      const homeMargin = marketSpread == null ? modelSpread : modelSpread * (1 - marketWeight) + marketSpread * marketWeight;
      let homeScorePred = Math.max(0, Math.round((projectedTotal + homeMargin) / 2));
      let awayScorePred = Math.max(0, Math.round(projectedTotal - homeScorePred));

      if (homeProb > 0.5 && homeScorePred <= awayScorePred) {
        homeScorePred = awayScorePred + 1;
      } else if (awayProb > 0.5 && awayScorePred <= homeScorePred) {
        awayScorePred = homeScorePred + 1;
      }

      const explanations = featureNames.map((name, idx) => {
        const xNorm = (x[idx] - finalFit.normParams.means[idx]) / finalFit.normParams.stds[idx];
        const impact = finalFit.model.weights[idx] * xNorm;
        return {
          feature: name,
          value: Number(x[idx].toFixed(2)),
          impact: Number(impact.toFixed(4)),
          favors: impact >= 0 ? row.home_team_id : row.away_team_id
        };
      });

      if (marketProb != null) {
        explanations.push({
          feature: 'Market consensus blend',
          value: Number((marketProb * 100).toFixed(1)),
          impact: Number(((marketProb - modelProb) * marketWeight).toFixed(4)),
          favors: marketProb >= 0.5 ? row.home_team_id : row.away_team_id
        });
      }

      explanations.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

      let isCorrect = null;
      if (row.completed && row.home_score !== null && row.away_score !== null && row.home_score !== row.away_score) {
        const homeWon = row.home_score > row.away_score;
        const predictedHomeWin = homeProb >= 0.5;
        isCorrect = homeWon === predictedHomeWin ? 1 : 0;
      }

      insertPred.run(
        row.id,
        modelId,
        new Date().toISOString(),
        homeProb,
        awayProb,
        homeScorePred,
        awayScorePred,
        confidence,
        JSON.stringify(explanations.slice(0, 6)),
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
