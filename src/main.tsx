import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Admin API token handling.
// The server requires "Authorization: Bearer <ADMIN_API_TOKEN>" on /api/admin/* and the order admin actions.
// The token is kept in sessionStorage only (cleared when the tab closes). Until the app has real logins,
// this is what stops arbitrary visitors from moving money.
const ADMIN_PATH = /^\/api\/(admin\/|orders\/[^/]+\/(force-complete|force-cancel|admin-notes|extend-time|mute)|payouts$|refunds$|audit-logs$)/;
const PROMPT_PATH = /^\/api\/(admin\/|orders\/[^/]+\/(force-complete|force-cancel|admin-notes|extend-time|mute))/;
const originalFetch = window.fetch.bind(window);

function getToken(): string {
  try { return sessionStorage.getItem('wph_admin_token') || ''; } catch { return ''; }
}

window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  const path = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];
  if (!ADMIN_PATH.test(path)) return originalFetch(input, init);

  const withToken = (token: string): RequestInit => {
    const headers = new Headers(init?.headers || (typeof input !== 'string' && !(input instanceof URL) ? input.headers : undefined));
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
  };

  let res = await originalFetch(input, withToken(getToken()));
  // Only explicit admin actions ask for the token; background data loads never pop a prompt.
  if (res.status === 401 && PROMPT_PATH.test(path)) {
    const entered = window.prompt('Admin token required for this action:');
    if (entered) {
      try { sessionStorage.setItem('wph_admin_token', entered.trim()); } catch { /* ignore */ }
      res = await originalFetch(input, withToken(entered.trim()));
    }
  }
  return res;
};

createRoot(document.getElementById('root')!).render(<App />);
