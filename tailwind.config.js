/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
        // Direct Modus aliases
        modus: ['var(--modus-font-body)'],
        'modus-display': ['var(--modus-font-display)'],
        'modus-mono': ['var(--modus-font-mono)'],
      },
      fontSize: {
        // Modus scale: 64 / 40 / 28 / 20 / 14 / 12 / 10
        eyebrow: ['10px', { letterSpacing: '0.22em', lineHeight: '1.2' }],
        'modus-small': ['12px', { lineHeight: '1.5' }],
        'modus-body': ['14px', { lineHeight: '1.7' }],
        'modus-h3': ['20px', { lineHeight: '1.3' }],
        'modus-h2': ['28px', { lineHeight: '1.25' }],
        'modus-h1': ['40px', { lineHeight: '1.15' }],
        'modus-display': ['64px', { lineHeight: '1.05' }],
      },
      letterSpacing: {
        wordmark: '0.44em',
        eyebrow: '0.22em',
      },
      borderRadius: {
        // Modus radii: 4, 8, 14 — map onto shadcn vars
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'modus-sm': '4px',
        'modus-md': '8px',
        'modus-lg': '14px',
      },
      colors: {
        // Modus tokens — direct access
        ink: 'var(--modus-ink)',
        'ink-2': 'var(--modus-ink-2)',
        paper: 'var(--modus-paper)',
        cream: 'var(--modus-cream)',
        stone: 'var(--modus-stone)',
        gold: 'var(--modus-gold)',
        'warm-brown': 'var(--modus-warm-brown)',

        // Shadcn mappings (preserved for existing components)
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        profit: 'hsl(var(--profit))',
        loss: 'hsl(var(--loss))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border) / 0.10)',
        input: 'hsl(var(--input) / 0.15)',
        ring: 'hsl(var(--ring))',
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
          4: 'hsl(var(--chart-4))',
          5: 'hsl(var(--chart-5))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
