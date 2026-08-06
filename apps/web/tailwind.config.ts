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
        // Contrast ratios against white are noted where they matter for UI-003.
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          500: '#1b6ec2',
          600: '#1559a0', // 5.9:1 on white — AA for normal text
          700: '#114a86', // 8.1:1 on white
          900: '#0a2e54',
        },
        // A single warm accent, used sparingly: step numerals, rules, the
        // occasional emphasis. Warmth matters for a product parents are asked
        // to trust with their children; an all-blue palette reads as corporate.
        // 5.3:1 on white, so it passes AA for normal text (UI-003).
        clay: {
          50: '#fdf1ea',
          100: '#f8ddcd',
          600: '#b4531f',
          700: '#8f3f16',
        },
        success: { 600: '#1a7f4b', 50: '#e8f7ef' },
        warning: { 600: '#8a5a00', 50: '#fdf3e2' },
        danger: { 600: '#b32020', 50: '#fdeaea' },
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
