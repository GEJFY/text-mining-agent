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
      <Route path="/login" element={<LoginPage />} />

      {/* 認証必須ルート */}
      <Route element={<AuthGuard />}>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="analysis/cluster" element={<ClusterPage />} />
          <Route path="analysis/sentiment" element={<SentimentPage />} />
          <Route path="analysis/cooccurrence" element={<CooccurrencePage />} />
          <Route path="agent" element={<AgentPage />} />
          <Route path="reports" element={<ReportsPage />} />
        </Route>
      </Route>
    </Routes>
    </ErrorBoundary>
  );
}

export default App;
