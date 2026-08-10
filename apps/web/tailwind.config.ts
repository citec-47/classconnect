import type { Config } from 'tailwindcss';

/**
 * UI-001: mobile-first at a 360px reference width, scaling to tablet and desktop.
 * UI-002: interactive targets at least 44 x 44 CSS pixels.
 * UI-003 / NFR-USA-003: WCAG 2.1 AA contrast.
 * NFR-USA-005: primary-level learners get larger type and higher contrast.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    // 360px is the reference device, so the smallest breakpoint sits above it:
    // the base (unprefixed) styles are the 360px design.
    screens: {
      sm: '414px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      colors: {
        /*
         * The mark's colours, carried through the product.
         *
         * The logo is two woven Cs in deep green on cream, with a single amber
         * arc. The interface was blue, which meant the app and its own icon
         * looked like two different products — and on a phone home screen the
         * icon is the only part of the brand a parent sees before they open it.
         *
         * Deep green also reads differently from blue here: trust and growth
         * rather than corporate software, and a nod to Cameroon without wearing
         * the flag. Red and yellow together are deliberately absent — the full
         * tricolour reads as national branding, and this platform is explicitly
         * not government-affiliated.
         *
         * Contrast against white is noted where it matters (UI-003).
         */
        brand: {
          50: '#e9f2ee',
          100: '#cfe3d9',
          500: '#127550',
          600: '#0B5D3B', // 7.9:1 on white — comfortably AA, and AAA for large
          700: '#0B4A34', // the mark's green exactly, 10.3:1 on white
          900: '#052e1f',
        },
        /*
         * The amber from the mark, used sparingly: numerals, rules, the
         * occasional emphasis.
         *
         * The logo's #E8A33D is a fill colour and far too light for text — about
         * 2:1 on white. So the tint keeps the hue and the ink darkens it to
         * 5.6:1, which passes AA for normal text. Same colour to the eye, legible
         * to everyone.
         */
        clay: {
          50: '#fdf3e3',
          100: '#f8e3bd',
          600: '#8a5a08',
          700: '#6d4705',
        },
        success: { 600: '#1a7f4b', 50: '#e8f7ef' },
        warning: { 600: '#8a5a00', 50: '#fdf3e2' },
        danger: { 600: '#b32020', 50: '#fdeaea' },
        /*
         * Subject accents.
         *
         * Colour here is information, not decoration: a learner scanning nine
         * subjects finds Chemistry faster by colour than by reading. Each pair
         * is a tint for a background and a dark tone for text on it, and every
         * `-700` clears 4.5:1 on its own `-50` so the pairing passes UI-003 on
         * its own — no combination in the app depends on a colour the reader
         * can distinguish.
         *
         * Six, not sixteen. Beyond about six, colours stop being told apart and
         * start being guessed at.
         */
        accent: {
          teal50: '#e6f5f3', teal700: '#0f5f57',
          plum50: '#f6ecf6', plum700: '#6b2d6b',
          amber50: '#fdf2e0', amber700: '#7a5200',
          indigo50: '#eceffb', indigo700: '#2f3f9e',
          moss50: '#ecf3e6', moss700: '#3d6122',
          rose50: '#fcecef', rose700: '#8f2740',
        },
        ink: {
          900: '#101828', // body text, 16.1:1 on white
          600: '#475467', // secondary text, 7.6:1 on white
          300: '#d0d5dd',
          100: '#f2f4f7',
        },
      },
      spacing: {
        // UI-002: the minimum interactive target.
        touch: '2.75rem', // 44px
      },
      minHeight: { touch: '2.75rem' },
      minWidth: { touch: '2.75rem' },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Headings in a serif, body in a sans. Both resolve to fonts already on
        // the device, so the §6.1 payload budget pays nothing for the contrast —
        // no web font request, no layout shift while one loads (NFR-PER-008).
        display: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      maxWidth: { prose: '62ch' },
    },
  },
  plugins: [],
};

export default config;
