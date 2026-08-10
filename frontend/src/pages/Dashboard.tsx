import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export default function Dashboard() {
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/games/upcoming')
      .then(r => r.json())
      .then(data => {
        setGames(data);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nfl-blue"></div></div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Upcoming Games</h1>
        <p className="text-gray-600">AI-powered predictions for the next week of NFL action.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map(game => (
          <Link key={game.id} to={'/game/' + game.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Week {game.week}</span>
                {game.confidence_level && (
                  <span className={'text-xs font-bold px-2 py-1 rounded ' + (
                    game.confidence_level === 'Very High' ? 'bg-green-100 text-green-800' :
                    game.confidence_level === 'High' ? 'bg-blue-100 text-blue-800' :
                    game.confidence_level === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  )}>
                    {game.confidence_level} Confidence
                  </span>
                )}
              </div>

              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <img src={game.away_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.away_team} className="w-16 h-16 mx-auto mb-2 object-contain" />
                  <div className="font-bold text-gray-900">{game.away_team}</div>
                  <div className="text-sm text-gray-500">{game.away_win_prob ? (game.away_win_prob * 100).toFixed(0) + '%' : 'N/A'}</div>
                  <div className="text-lg font-semibold text-gray-700 mt-1">{game.predicted_away_score}</div>
                </div>
                
                <div className="text-gray-400 font-medium px-4">@</div>
                
                <div className="text-center flex-1">
                  <img src={game.home_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.home_team} className="w-16 h-16 mx-auto mb-2 object-contain" />
                  <div className="font-bold text-gray-900">{game.home_team}</div>
                  <div className="text-sm text-gray-500">{game.home_win_prob ? (game.home_win_prob * 100).toFixed(0) + '%' : 'N/A'}</div>
                  <div className="text-lg font-semibold text-gray-700 mt-1">{game.predicted_home_score}</div>
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center group-hover:bg-blue-50 transition-colors">
              <span className="text-sm font-medium text-nfl-blue">View Prediction</span>
              <ChevronRight className="w-4 h-4 text-nfl-blue" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
