'use client';

import { MoonStar, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem('aurelia-theme') as 'light' | 'dark' | null;
    const nextTheme = stored || (document.documentElement.dataset.theme as 'light' | 'dark') || 'dark';
    document.documentElement.dataset.theme = nextTheme;
    setTheme(nextTheme);
  }, []);

  const toggle = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem('aurelia-theme', nextTheme);
    setTheme(nextTheme);
  };

  return (
    <button type="button" onClick={toggle} className="app-button-secondary min-w-[108px]">
      {theme === 'light' ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}
      {theme === 'light' ? 'Koyu' : 'Açık'}
    </button>
  );
}
