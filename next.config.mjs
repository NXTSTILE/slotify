/** @type {import('next').NextConfig} */
const nextConfig = {
  // Strict mode for catching bugs early
  reactStrictMode: true,

  // Enable standalone output for containerized/Docker production builds
  output: "standalone",

  // Security headers on every response
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires these
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://graph.facebook.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },

  // Silence noisy build warnings from Supabase realtime
  experimental: {
    serverComponentsExternalPackages: [],
    serverActions: {
      allowedOrigins: ["nxtstile.in", "www.nxtstile.in"],
    },
  },

  // Webpack: silence "Critical dependency" warnings from date-fns-tz
  webpack(config) {
    config.module.exprContextCritical = false;
    return config;
  },
};

export default nextConfig;
