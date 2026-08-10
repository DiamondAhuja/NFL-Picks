import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import GameDetails from './pages/GameDetails';
import Performance from './pages/Performance';
import { Activity, Trophy, BarChart3 } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        <nav className="bg-nfl-blue text-white shadow-lg sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center space-x-8">
                <Link to="/" className="flex items-center space-x-2 text-xl font-bold tracking-tight">
                  <Trophy className="w-6 h-6 text-red-400" />
                  <span>NFL Predictor AI</span>
                </Link>
                <div className="hidden md:flex space-x-6">
                  <Link to="/" className="hover:text-gray-200 transition-colors flex items-center space-x-1">
                    <Activity className="w-4 h-4" />
                    <span>Upcoming Games</span>
                  </Link>
                  <Link to="/performance" className="hover:text-gray-200 transition-colors flex items-center space-x-1">
                    <BarChart3 className="w-4 h-4" />
                    <span>Model Performance</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/game/:id" element={<GameDetails />} />
            <Route path="/performance" element={<Performance />} />
          </Routes>
        </main>
        
        <footer className="bg-gray-900 text-gray-400 py-8 text-center mt-auto">
          <p className="text-sm">NFL Predictor AI &copy; 2026. Powered by AI and NFLverse data.</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
