import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CheckCircle, XCircle } from 'lucide-react';

export default function Dashboard() {
  const [upcomingGames, setUpcomingGames] = useState<any[]>([]);
  const [pastGames, setPastGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming-pre' | 'upcoming-reg' | 'past'>('upcoming-pre');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('http://localhost:3001/api/games/upcoming').then(r => r.json()),
      fetch('http://localhost:3001/api/games/past').then(r => r.json())
    ]).then(([upcoming, past]) => {
      setUpcomingGames(upcoming);
      setPastGames(past);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-nfl-blue"></div></div>;

  const gamesToDisplay = activeTab === 'upcoming-pre' 
    ? upcomingGames.filter(g => g.game_type === 'PRE')
    : activeTab === 'upcoming-reg'
    ? upcomingGames.filter(g => g.game_type !== 'PRE')
    : pastGames;

  return (
    <div>
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">NFL Predictions</h1>
          <p className="text-gray-600">AI-powered predictions for the 2026 season.</p>
        </div>
        
        <div className="mt-4 md:mt-0 flex bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('upcoming-pre')}
            className={'px-4 py-2 text-sm font-medium rounded-md transition-colors ' + (activeTab === 'upcoming-pre' ? 'bg-white shadow-sm text-nfl-blue' : 'text-gray-600 hover:text-gray-900')}
          >
            Preseason
          </button>
          <button 
            onClick={() => setActiveTab('upcoming-reg')}
            className={'px-4 py-2 text-sm font-medium rounded-md transition-colors ' + (activeTab === 'upcoming-reg' ? 'bg-white shadow-sm text-nfl-blue' : 'text-gray-600 hover:text-gray-900')}
          >
            Regular Season
          </button>
          <button 
            onClick={() => setActiveTab('past')}
            className={'px-4 py-2 text-sm font-medium rounded-md transition-colors ' + (activeTab === 'past' ? 'bg-white shadow-sm text-nfl-blue' : 'text-gray-600 hover:text-gray-900')}
          >
            Past Results
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gamesToDisplay.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-12">No games found for this category.</div>
        )}
        
        {gamesToDisplay.map(game => (
          <Link key={game.id} to={'/game/' + game.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow group relative">
            
            {activeTab === 'past' && game.is_correct !== null && (
              <div className={'absolute top-0 right-0 px-3 py-1 text-xs font-bold rounded-bl-lg text-white ' + (game.is_correct ? 'bg-green-500' : 'bg-red-500')}>
                {game.is_correct ? <span className="flex items-center"><CheckCircle className="w-3 h-3 mr-1"/> Correct</span> : <span className="flex items-center"><XCircle className="w-3 h-3 mr-1"/> Missed</span>}
              </div>
            )}

            <div className="p-6 pt-8">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-2">
                  <span className={'text-xs font-bold px-2 py-1 rounded ' + (game.game_type === 'PRE' ? 'bg-purple-100 text-purple-800' : game.game_type === 'POST' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800')}>
                    {game.game_type === 'PRE' ? 'Preseason' : game.game_type === 'POST' ? 'Playoffs' : 'Regular'}
                  </span>
                  <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">Week {game.week}</span>
                </div>
                
                {(activeTab === 'upcoming-reg' || activeTab === 'upcoming-pre') && game.confidence_level && (
                  <span className={'text-xs font-bold px-2 py-1 rounded ' + (
                    game.confidence_level === 'Very High' ? 'bg-green-100 text-green-800' :
                    game.confidence_level === 'High' ? 'bg-blue-100 text-blue-800' :
                    game.confidence_level === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  )}>
                    {game.confidence_level} Conf
                  </span>
                )}
              </div>

              <div className="flex justify-between items-center">
                <div className="text-center flex-1">
                  <img src={game.away_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.away_team} className="w-16 h-16 mx-auto mb-2 object-contain" />
                  <div className="font-bold text-gray-900">{game.away_team}</div>
                  
                  {(activeTab === 'upcoming-reg' || activeTab === 'upcoming-pre') ? (
                    <>
                      <div className="text-sm text-gray-500">{game.away_win_prob ? (game.away_win_prob * 100).toFixed(0) + '%' : 'N/A'}</div>
                      <div className="text-lg font-semibold text-gray-700 mt-1">{game.predicted_away_score}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black text-gray-900 mt-1">{game.away_score}</div>
                      <div className="text-xs text-gray-400">Predicted: {game.predicted_away_score}</div>
                    </>
                  )}
                </div>
                
                <div className="text-gray-400 font-medium px-4">@</div>
                
                <div className="text-center flex-1">
                  <img src={game.home_logo || 'https://a.espncdn.com/i/teamlogos/nfl/500/scoreboard/nfl.png'} alt={game.home_team} className="w-16 h-16 mx-auto mb-2 object-contain" />
                  <div className="font-bold text-gray-900">{game.home_team}</div>
                  
                  {(activeTab === 'upcoming-reg' || activeTab === 'upcoming-pre') ? (
                    <>
                      <div className="text-sm text-gray-500">{game.home_win_prob ? (game.home_win_prob * 100).toFixed(0) + '%' : 'N/A'}</div>
                      <div className="text-lg font-semibold text-gray-700 mt-1">{game.predicted_home_score}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-2xl font-black text-gray-900 mt-1">{game.home_score}</div>
                      <div className="text-xs text-gray-400">Predicted: {game.predicted_home_score}</div>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center group-hover:bg-blue-50 transition-colors">
              <span className="text-sm font-medium text-nfl-blue">View Details</span>
              <ChevronRight className="w-4 h-4 text-nfl-blue" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
