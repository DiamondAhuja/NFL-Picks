import { useEffect, useState } from 'react';
import { Target, AlertCircle, Percent, Activity } from 'lucide-react';

export default function Performance() {
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/performance')
      .then(r => r.json())
      .then(data => {
        setModel(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nfl-blue"></div></div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Model Performance</h1>
        <p className="text-gray-600">Chronological holdout results for the current regular season and playoff model.</p>
        <div className="mt-4 inline-flex items-center space-x-2 bg-blue-50 text-blue-800 px-4 py-2 rounded-full text-sm font-medium">
          <AlertCircle className="w-4 h-4" />
          <span>Active Model: {model?.version_string}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <Target className="w-10 h-10 mx-auto text-green-500 mb-4" />
          <div className="text-4xl font-black text-gray-900 mb-1">{(model?.accuracy * 100).toFixed(1)}%</div>
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">Overall Accuracy</div>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <Percent className="w-10 h-10 mx-auto text-blue-500 mb-4" />
          <div className="text-4xl font-black text-gray-900 mb-1">{model?.brier_score.toFixed(3)}</div>
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">Brier Score</div>
          <p className="text-xs text-gray-400 mt-2">Lower is better (0.0 = perfect)</p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <Activity className="w-10 h-10 mx-auto text-purple-500 mb-4" />
          <div className="text-4xl font-black text-gray-900 mb-1">{model?.log_loss.toFixed(3)}</div>
          <div className="text-sm font-medium text-gray-500 uppercase tracking-widest">Log Loss</div>
          <p className="text-xs text-gray-400 mt-2">Lower is better</p>
        </div>
      </div>
      
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h3 className="text-xl font-bold mb-4">About the Metrics</h3>
        <ul className="space-y-4 text-gray-600">
          <li><strong className="text-gray-900">Accuracy:</strong> The percentage of holdout games where the model correctly predicted the winning team. Above 60-65% in the NFL is generally considered very strong given the parity of the league.</li>
          <li><strong className="text-gray-900">Brier Score:</strong> Measures the accuracy of probabilistic predictions. A score of 0.0 means the model always predicts 100% win probability and is always correct. A score of 0.25 is equivalent to guessing 50/50 randomly.</li>
          <li><strong className="text-gray-900">Log Loss:</strong> Penalizes false confidence. If the model says a team has a 99% chance to win and they lose, the log loss penalty is very high.</li>
        </ul>
        {model?.description && <p className="text-sm text-gray-500 mt-6">{model.description}</p>}
      </div>
    </div>
  );
}
