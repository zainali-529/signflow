import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-playfair)', 'Georgia', 'serif'],
        body: ['var(--font-instrument)', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: '#080810',
        surface: '#0F0F1A',
        elevated: '#161624',
        border: '#252535',
        gold: {
          DEFAULT: '#C9933A',
          light: '#E8B84B',
          dim: '#7A5820',
        },
        ink: {
          primary: '#EDE8DF',
          secondary: '#9A94A8',
          muted: '#4A4A60',
        },
        success: '#3DB87A',
        danger: '#E05B5B',
      },
    },
  },
  plugins: [],
}
export default config
