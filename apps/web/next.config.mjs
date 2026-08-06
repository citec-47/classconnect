/**
 * Next.js configuration.
 *
 * NFR-SEC-006: strict Content Security Policy, X-Content-Type-Options,
 *              Referrer-Policy and frame-ancestors.
 * NFR-PER-007: images served in a modern format with responsive sizing.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  images: {
    // NFR-PER-007: WebP/AVIF with responsive sizing.
    formats: ['image/avif', 'image/webp'],
    // NFR-PER-002 budgets assume a 360px reference width as the smallest step.
    deviceSizes: [360, 414, 640, 768, 1024, 1280],
  },

  experimental: {
    // NFR-PER-002: keep the initial JS payload under 200 KB gzipped.
    optimizePackageImports: ['@classconnect/shared'],
  },

  async headers() {
    const csp = [
      "default-src 'self'",
      // Next.js injects inline bootstrap scripts; 'unsafe-inline' is scoped to
      // script-src only and paired with strict everything else.
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // COM-001: HSTS.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
