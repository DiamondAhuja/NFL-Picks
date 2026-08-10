import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, TrendingUp, Shield, Activity, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function GameDetails() {
  const { id } = useParams();
  const [game, setGame] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/games/' + id)
      .then(r => r.json())
      .then(data => {
        setGame(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nfl-blue"></div></div>;
  if (!game) return <div>Game not found</div>;

  const explanations = game.explanation_json ? JSON.parse(game.explanation_json) : [];

  const chartData = [
    { name: 'Win Prob', value: (game.away_win_prob * 100), team: game.away_team, fill: '#D50A0A' },
    { name: 'Win Prob', value: (game.home_win_prob * 100), team: game.home_team, fill: '#013369' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link to="/" className="inline-flex items-center text-nfl-blue hover:underline mb-4 font-medium">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
      </Link>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="bg-gradient-to-r from-gray-900 to-nfl-blue p-8 text-white">
          <div className="text-center mb-8">
            <h2 className="text-sm font-bold tracking-widest text-gray-300 uppercase">Week {game.week} Matchup</h2>
            <p className="text-gray-400 mt-1">{game.game_date}</p>
          </div>
          
          <div className="flex justify-between items-center px-4 md:px-12">
            <div className="text-center w-1/3">
              <img src={game.away_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.away_team} className="w-24 h-24 mx-auto mb-4 object-contain bg-white rounded-full p-2" />
              <h2 className="text-2xl font-bold">{game.away_team}</h2>
              <p className="text-gray-300">Away</p>
            </div>
            
            <div className="text-center w-1/3">
              <div className="text-5xl font-black mb-2">{game.predicted_away_score} - {game.predicted_home_score}</div>
              <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium backdrop-blur-sm">
                Predicted Score
              </div>
            </div>
            
            <div className="text-center w-1/3">
              <img src={game.home_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.home_team} className="w-24 h-24 mx-auto mb-4 object-contain bg-white rounded-full p-2" />
              <h2 className="text-2xl font-bold">{game.home_team}</h2>
              <p className="text-gray-300">Home</p>
            </div>
          </div>
        </div>

        <div className="p-8">
          <div className="grid md:grid-cols-2 gap-12">
            
            <div>
              <h3 className="text-xl font-bold mb-6 flex items-center"><Activity className="mr-2 text-nfl-blue" /> Win Probability</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <XAxis dataKey="team" axisLine={false} tickLine={false} tick={{fontWeight: 'bold'}} />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip cursor={{fill: 'transparent'}} formatter={(val) => Number(val).toFixed(1) + '%'} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell key={'cell-' + index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-between items-center text-sm font-medium text-gray-500 mt-2">
                <span>{game.away_team}: {(game.away_win_prob * 100).toFixed(1)}%</span>
                <span>{game.home_team}: {(game.home_win_prob * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold mb-6 flex items-center"><Info className="mr-2 text-nfl-blue" /> Why the model predicts this</h3>
              <div className="space-y-4">
                {explanations.map((exp: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-semibold text-gray-900">{exp.feature}</span>
                      <span className={'text-xs font-bold px-2 py-1 rounded ' + (Math.abs(exp.impact) > 0.5 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800')}>
                        {Math.abs(exp.impact) > 0.5 ? 'Strong Impact' : 'Moderate Impact'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      Favors <span className="font-bold">{exp.favors === game.home_team_id ? game.home_team : game.away_team}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Team Comparison Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-8">
         <h3 className="text-xl font-bold mb-6">Team Comparison (Rolling Averages)</h3>
         <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-100">
                <th className="py-3 px-4 font-semibold text-gray-600">Statistic</th>
                <th className="py-3 px-4 font-semibold text-gray-900">{game.away_team}</th>
                <th className="py-3 px-4 font-semibold text-gray-900">{game.home_team}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-4 flex items-center"><TrendingUp className="w-4 h-4 mr-2 text-gray-400" /> Points / Game</td>
                <td className="py-3 px-4">{Number(game.away_pts).toFixed(1)}</td>
                <td className="py-3 px-4">{Number(game.home_pts).toFixed(1)}</td>
              </tr>
              <tr className="border-b border-gray-50 hover:bg-gray-50">
                <td className="py-3 px-4 flex items-center"><Shield className="w-4 h-4 mr-2 text-gray-400" /> Points Allowed</td>
                <td className="py-3 px-4">{Number(game.away_allow).toFixed(1)}</td>
                <td className="py-3 px-4">{Number(game.home_allow).toFixed(1)}</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-3 px-4 flex items-center"><Activity className="w-4 h-4 mr-2 text-gray-400" /> Win Streak</td>
                <td className="py-3 px-4">{game.away_streak}</td>
                <td className="py-3 px-4">{game.home_streak}</td>
              </tr>
            </tbody>
         </table>
      </div>
    </div>
  );
}
