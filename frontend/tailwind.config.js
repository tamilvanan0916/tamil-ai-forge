/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        cinema: {
          void: '#07090e',
          950: '#090b10',
          900: '#0b0e14',
          850: '#0e121b',
          800: '#121824',
          750: '#161e2d',
          700: '#1b2333',
          600: '#26334a',
          500: '#334460',
          border: '#1e293b',
          borderLight: '#334155',
          text: '#f1f5f9',
          textMuted: '#94a3b8',
          textDim: '#64748b',
          red: '#e50914',
          redHover: '#f40612',
          ai: '#00e5ff',
          aiPurple: '#8b5cf6',
          clipVideo: '#1e3a8a',
          clipAudio: '#14532d',
          clipVo: '#065f46',
          clipMusic: '#701a75',
          clipSfx: '#831843',
          clipAmbience: '#365314',
          clipCaptions: '#9a3412',
          clipGfx: '#4c1d95',
          clipAdj: '#581c87',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
