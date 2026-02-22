import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import AuthGuard from "./components/AuthGuard";
import ErrorBoundary from "./components/ErrorBoundary";
import ToastContainer from "./components/ToastContainer";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import ImportPage from "./pages/ImportPage";
import ClusterPage from "./pages/ClusterPage";
import SentimentPage from "./pages/SentimentPage";
import CooccurrencePage from "./pages/CooccurrencePage";
import AgentPage from "./pages/AgentPage";
import ReportsPage from "./pages/ReportsPage";
import CausalChainPage from "./pages/CausalChainPage";
import ContradictionPage from "./pages/ContradictionPage";
import ActionabilityPage from "./pages/ActionabilityPage";
import TaxonomyPage from "./pages/TaxonomyPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import LandingPage from "./pages/LandingPage";

/**
 * NexusText AI v7.0 メインアプリケーション
 * ルーティングとレイアウトの定義
 */
function App() {
  return (
    <ErrorBoundary>
    <ToastContainer />
    <Routes>
      {/* 認証不要ルート */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />

      {/* 認証必須ルート */}
      <Route element={<AuthGuard />}>
        <Route element={<AppLayout />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="analysis/cluster" element={<ClusterPage />} />
          <Route path="analysis/sentiment" element={<SentimentPage />} />
          <Route path="analysis/cooccurrence" element={<CooccurrencePage />} />
          <Route path="analysis/causal-chain" element={<CausalChainPage />} />
          <Route path="analysis/contradiction" element={<ContradictionPage />} />
          <Route path="analysis/actionability" element={<ActionabilityPage />} />
          <Route path="analysis/taxonomy" element={<TaxonomyPage />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
        </Route>
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}

export default App;
