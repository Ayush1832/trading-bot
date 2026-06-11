/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces — layered ink scale
        ink: {
          950: '#07080b', // page
          900: '#0b0d12', // surface
          850: '#10131a', // raised panel
          800: '#151924', // hover / inset
          750: '#1a1f2c', // active
        },
        // Hairlines
        line: {
          DEFAULT: '#1b2030',
          soft: '#141823',
          strong: '#262d40',
        },
        // Text
        tx: {
          DEFAULT: '#e8ebf2',
          2: '#9aa3b8',
          dim: '#5e6778',
          faint: '#3b4254',
        },
        // Brand + semantics
        accent: { DEFAULT: '#7aa2ff', dim: '#42537d', glow: '#a8c1ff' },
        up: { DEFAULT: '#19c685', dim: '#0e3f2f', glow: '#5eebb4' },
        down: { DEFAULT: '#f0445c', dim: '#43141f', glow: '#ff8095' },
        warn: { DEFAULT: '#e7a13d', dim: '#3d2c12' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        panel: '10px',
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 0 0 1px #1b2030',
        'glow-up': '0 0 12px rgba(25,198,133,0.35)',
        'glow-down': '0 0 12px rgba(240,68,92,0.35)',
      },
      animation: {
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'enter': 'enter 0.25s cubic-bezier(0.16,1,0.3,1) both',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        enter: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
