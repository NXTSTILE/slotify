/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for catching bugs early in development
  reactStrictMode: true,

  // Remove the "X-Powered-By: Next.js" header for security hardening
  poweredByHeader: false,

  // Enable gzip compression (Vercel edge handles this, but also useful for
  // any self-hosted fallback or preview deployments)
  compress: true,

  // ── Security headers on every response ───────────────────────────────────
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Prevent clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // Prevent MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Referrer leakage control
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Disable unused browser features
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Strict Transport Security (Vercel always serves HTTPS)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next.js App Router requires unsafe-inline and unsafe-eval for
              // its hydration scripts; narrow this when moving to nonce-based CSP.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              // Allow connections to Supabase (DB/realtime) and Meta Graph API
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  experimental: {
    // Ensure pg, bcryptjs, and sharp are NOT bundled by webpack.
    // These are Node.js native/CJS modules that must be required at runtime.
    // (Next.js 14 uses experimental.serverComponentsExternalPackages;
    //  this was promoted to the top-level in Next.js 15.)
    serverComponentsExternalPackages: ['pg', 'pg-native', 'bcryptjs', 'sharp'],

    serverActions: {
      // All origins that are permitted to invoke Server Actions via fetch.
      // Vercel preview URLs are covered by the *.vercel.app wildcard.
      allowedOrigins: [
        'nxtstile.in',
        'www.nxtstile.in',
        '*.vercel.app',
      ],
    },
  },

  // Webpack: silence spurious "Critical dependency" warnings from date-fns-tz
  webpack(config) {
    config.module.exprContextCritical = false;
    return config;
  },
};

export default nextConfig;
