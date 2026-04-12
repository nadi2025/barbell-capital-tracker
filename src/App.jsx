import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import OptionsPage from './pages/OptionsPage';
import StocksPage from './pages/StocksPage';
import DepositsPage from './pages/DepositsPage';
import ReportsPage from './pages/ReportsPage';
import DebtPage from './pages/DebtPage';
import CryptoDashboard from './pages/crypto/CryptoDashboard';
import WalletsPage from './pages/crypto/WalletsPage';
import LeveragedPage from './pages/crypto/LeveragedPage';

import CryptoDebtPage from './pages/crypto/CryptoDebtPage';
import InvestorsPage from './pages/crypto/InvestorsPage';
import ActivityPage from './pages/crypto/ActivityPage';
import AavePage from './pages/crypto/AavePage';
import AaveDetailPage from './pages/crypto/AaveDetailPage';
import CryptoOptionsPage from './pages/crypto/OptionsPage';
import OffChainInvestorsPage from './pages/OffChainInvestorsPage';
import WeeklyReportPage from './pages/WeeklyReportPage';
import AssetsPage from './pages/AssetsPage';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/options" element={<OptionsPage />} />
        <Route path="/stocks" element={<StocksPage />} />
        <Route path="/deposits" element={<DepositsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/debt" element={<DebtPage />} />
        <Route path="/crypto" element={<CryptoDashboard />} />
        <Route path="/crypto/wallets" element={<WalletsPage />} />
        <Route path="/crypto/leveraged" element={<LeveragedPage />} />

        <Route path="/crypto/debt" element={<CryptoDebtPage />} />
        <Route path="/crypto/investors" element={<InvestorsPage />} />
        <Route path="/crypto/activity" element={<ActivityPage />} />
        <Route path="/crypto/aave" element={<AaveDetailPage />} />
        <Route path="/crypto/options" element={<CryptoOptionsPage />} />
        <Route path="/offchain-investors" element={<OffChainInvestorsPage />} />
        <Route path="/weekly-report" element={<WeeklyReportPage />} />
        <Route path="/settings/assets" element={<AssetsPage />} />
        <Route path="*" element={<PageNotFound />} />
      </Route>
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App