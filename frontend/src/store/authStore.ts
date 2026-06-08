import { create } from 'zustand';

export interface User {
  id: number;
  name: string;
  email: string;
  roleName: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

function loadInitialState(): Pick<AuthState, 'user' | 'accessToken' | 'isAuthenticated'> {
  try {
    const raw = localStorage.getItem('user');
    const user: User | null = raw ? (JSON.parse(raw) as User) : null;
    const accessToken = localStorage.getItem('accessToken');
    return {
      user,
      accessToken,
      isAuthenticated: !!user && !!accessToken,
    };
  } catch {
    return { user: null, accessToken: null, isAuthenticated: false };
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  ...loadInitialState(),

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, accessToken, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, accessToken: null, isAuthenticated: false });
  },
}));
