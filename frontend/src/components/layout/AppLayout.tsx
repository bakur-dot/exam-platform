import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

function dashboardLink(roleName: string): string {
  if (roleName === 'Candidate') return '/candidate';
  if (roleName === 'Examiner') return '/examiner';
  return '/admin';
}

export default function AppLayout() {
  const { user, logout } = useAuthStore();

  function handleLogout() {
    logout();
    window.location.href = '/login';
  }

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col bg-gray-900 text-white shrink-0">
        {/* App name */}
        <div className="px-6 py-5 border-b border-gray-700">
          <span className="text-lg font-semibold tracking-wide">Exam Platform</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4 space-y-1">
          {user && (
            <Link
              to={dashboardLink(user.roleName)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
          )}
        </nav>

        {/* User info + logout */}
        <div className="px-4 py-4 border-t border-gray-700">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 truncate">{user.roleName}</p>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-lg bg-gray-700 px-3 py-2 text-sm font-medium text-gray-200 hover:bg-red-600 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <Outlet />
      </main>
    </div>
  );
}
