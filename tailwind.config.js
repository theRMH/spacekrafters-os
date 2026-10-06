/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Readability bump — each tier reuses the next tier's own existing
      // values (text-xs gets what text-sm used to be, etc.) so the type
      // scale's proportions stay intact. text-3xl/4xl are left at Tailwind's
      // defaults — real usage in this app is empty-state emoji and large
      // stat-counter numbers, not headings. src/index.css pins buttons,
      // rounded-full badges/pills, and nav/menu chrome (.app-chrome) back to
      // the original pre-bump sizes, since this scale change is global.
      fontSize: {
        xs:    ['0.875rem', { lineHeight: '1.25rem' }],
        sm:    ['1rem',     { lineHeight: '1.5rem'  }],
        base:  ['1.125rem', { lineHeight: '1.75rem' }],
        lg:    ['1.25rem',  { lineHeight: '1.75rem' }],
        xl:    ['1.5rem',   { lineHeight: '2rem'    }],
        '2xl': ['1.875rem', { lineHeight: '2.25rem' }],
      },
      colors: {
        brand: {
          primary: '#0F2A4A',
          dark:    '#081B32',
          gold:    '#C9A24B',
          goldSoft:'#E8D9B0',
          surface: '#EEF2F7',
          soft:    '#F5F3EC',
          mint:    '#E9EEF5',
          border:  '#D7DEE8',
          text:    '#0B1626',
          muted:   '#5B6B80',
        },
        primary: {
          50:  '#EEF2F7',
          100: '#DCE4EF',
          500: '#0F2A4A',
          600: '#0F2A4A',
          700: '#081B32',
          800: '#050F1D',
        },
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.06)',
        nav:   '0 -1px 12px rgba(0,0,0,0.06)',
        fab:   '0 4px 16px rgba(15,42,74,0.35)',
        sheet: '0 -4px 24px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
      },
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-left': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'snack-in': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.25s ease-out',
        'fade-in':  'fade-in 0.2s ease-out',
        'snack-in': 'snack-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
