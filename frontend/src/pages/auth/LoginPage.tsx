import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import api from '../../services/api';
import { axiosMsg } from '../../utils/axiosMsg';
import { useAuthStore } from '../../store/authStore';
import type { User } from '../../store/authStore';

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'credentials' | 'totp';

interface LoginResponse {
  requiresTwoFactor: true;
  tempToken: string;
}

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleRedirect(roleName: string): string {
  if (roleName === 'Candidate') return '/candidate';
  if (roleName === 'Examiner') return '/examiner';
  return '/admin';
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [step, setStep]       = useState<Step>('credentials');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ── Step 1: email + password ─────────────────────────────────────────────────

  async function handleCredentialsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data } = await api.post<LoginResponse | AuthResponse>('/auth/login', {
        email,
        password,
      });

      if ('requiresTwoFactor' in data && data.requiresTwoFactor) {
        setTempToken(data.tempToken);
        setStep('totp');
      } else {
        const auth = data as AuthResponse;
        setAuth(auth.user, auth.accessToken, auth.refreshToken);
        navigate(roleRedirect(auth.user.roleName), { replace: true });
      }
    } catch (err) {
      toast.error(axiosMsg(err, 'Login failed. Please check your credentials.'));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Step 2: TOTP code ────────────────────────────────────────────────────────

  async function handleTotpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data } = await api.post<AuthResponse>('/auth/verify-totp', {
        tempToken,
        code: totpCode,
      });

      setAuth(data.user, data.accessToken, data.refreshToken);
      navigate(roleRedirect(data.user.roleName), { replace: true });
    } catch (err) {
      toast.error(axiosMsg(err, 'Invalid code. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">

        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-800">
            {step === 'credentials' ? 'Sign in to your account' : 'Two-Factor Authentication'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'credentials'
              ? 'ISO 17024 Exam Platform'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {/* ── Credentials form ── */}
        {step === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {/* ── TOTP form ── */}
        {step === 'totp' && (
          <form onSubmit={handleTotpSubmit} noValidate className="space-y-5">
            <div>
              <label htmlFor="totp" className="block text-sm font-medium text-gray-700 mb-1">
                Authentication code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 tracking-widest text-center placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="000000"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || totpCode.length !== 6}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Verifying…' : 'Verify code'}
            </button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setTotpCode(''); }}
              className="w-full text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Back to sign in
            </button>
          </form>
        )}

      </div>
    </div>
  );
}
