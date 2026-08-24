export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'pcaarb_theme';

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((listener) => listener());
}

// Module-level pub/sub so ThemeToggle can use useSyncExternalStore instead of
// setState-in-an-effect (forbidden by this project's hooks lint rule — see
// the analogous note in painel/topbar.tsx). localStorage's own `storage`
// event only fires in *other* tabs, not the one that made the write, so a
// same-tab toggle needs this explicit notify.
export function subscribeTheme(listener: Listener) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
    media.removeEventListener('change', listener);
  };
}

export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === 'light' || value === 'dark' ? value : null;
}

export function getEffectiveTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getServerTheme(): Theme {
  return 'light';
}

export function setStoredTheme(theme: Theme) {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
  notify();
}

// Inlined into <head> as a blocking script (see layout.tsx) so data-theme is
// set before first paint. Without this, a stored preference that disagrees
// with the OS would flash the wrong theme for a frame between hydration and
// ThemeToggle's own effect running.
export const NO_FLASH_THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;
