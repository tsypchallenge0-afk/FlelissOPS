import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { api } from '../lib/Api';
import { getCurrentTenantSlug } from '../lib/tenant';

/* eslint-disable react-refresh/only-export-components */
const BASE = 'http://127.0.0.1:9000';

// Initial setup is handled by api.js request interceptor

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenant, setTenant] = useState(null);
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    const interceptor = api.client.interceptors.response.use(
      response => response,
      error => {
        const status = error?.response?.status;

        if (status === 401) {
          localStorage.removeItem('roboflelis_token');
          setUser(null);
          toast.error('Session expired — please log in again');
          window.location.href = '/login';
        }

        if (status === 403) {
          toast.error('Access denied — insufficient permissions');
        }

        if (status >= 500) {
          toast.error('Server error — please try again', {
            description: `HTTP ${status}`,
          });
        }

        return Promise.reject(error);
      }
    );
    return () => api.client.interceptors.response.eject(interceptor);
  }, []);

  useEffect(() => {
    const checkExpiry = () => {
      const token = localStorage.getItem('roboflelis_token');
      if (!token) return;
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000;
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now >= expiresAt) {
          localStorage.removeItem('roboflelis_token');
          setUser(null);
          window.location.href = '/login';
        } else if (expiresAt - now < fiveMinutes) {
          toast.warning('Session expiring in 5 minutes — save your work');
        }
      } catch {
        return null;
      }
    };

    window.addEventListener('focus', checkExpiry);
    const interval = setInterval(checkExpiry, 2 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', checkExpiry);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const slug = getCurrentTenantSlug();

    // Load tenant branding if on a subdomain
    if (slug && slug !== 'default') {
      api.checkSubdomainAvailable(slug)
        .then(r => {
          setTenant(r.data);
          setBranding(r.data.branding);
          applyBranding(r.data.branding);
        })
        .catch(() => {});
    }

    const token = localStorage.getItem('roboflelis_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => { 
        localStorage.removeItem('roboflelis_token'); 
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login({ username, password });
    localStorage.setItem('roboflelis_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('roboflelis_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, tenant, branding }}>
      {children}
    </AuthContext.Provider>
  );
}

// Apply tenant branding to CSS variables
function applyBranding(branding) {
  if (!branding) return;
  const root = document.documentElement;
  if (branding.primary_color) {
    // Convert hex to RGB components for CSS variable use
    const hex = branding.primary_color.replace('#', '');
    const r   = parseInt(hex.slice(0, 2), 16) / 255;
    const g   = parseInt(hex.slice(2, 4), 16) / 255;
    const b   = parseInt(hex.slice(4, 6), 16) / 255;
    root.style.setProperty('--accent', branding.primary_color);
    root.style.setProperty('--accent-dim', branding.primary_color + 'cc');
    root.style.setProperty('--accent-glow', `rgba(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)},0.15)`);
  }
  if (branding.company_name) {
    document.title = `${branding.company_name} — Farm Control`;
  }
  if (branding.favicon_url) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      document.head.appendChild(link);
    }
    link.type  = 'image/x-icon';
    link.rel   = 'shortcut icon';
    link.href  = branding.favicon_url;
  }
}

export const useAuth = () => useContext(AuthContext);
export const useRole = () => useContext(AuthContext)?.user?.role ?? 'operator';
export const useTenant = () => useContext(AuthContext)?.tenant;
export const useBranding = () => useContext(AuthContext)?.branding;
