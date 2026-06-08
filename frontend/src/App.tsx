import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import LoginPage from './pages/auth/LoginPage';
import CandidateDashboard from './pages/candidate/CandidateDashboard';
import ExaminerDashboard from './pages/examiner/ExaminerDashboard';

function UnauthorizedPage() {
  return <p className="p-8 text-gray-700">403 Unauthorized</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />

        {/* Protected shell — auth gate wraps the layout so Outlet is always inside it */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route
            path="candidate"
            element={
              <ProtectedRoute allowedRoles={['Candidate']}>
                <CandidateDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="examiner"
            element={
              <ProtectedRoute allowedRoles={['Examiner']}>
                <ExaminerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin"
            element={
              <ProtectedRoute allowedRoles={['Admin', 'SuperAdmin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Default authenticated landing */}
          <Route index element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
