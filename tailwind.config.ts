import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--canvas)',
        panel: 'var(--panel)',
        panelElevated: 'var(--panel-elevated)',
        line: 'var(--line)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        accent: 'var(--accent)',
        accentSoft: 'var(--accent-soft)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      boxShadow: {
        soft: '0 18px 60px rgba(15, 23, 42, 0.12)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'Inter', 'system-ui', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
