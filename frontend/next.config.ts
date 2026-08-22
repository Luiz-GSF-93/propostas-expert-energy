import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/energiapro/index.html',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, noarchive, nosnippet, noimageindex' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" }
        ]
      },
      {
        source: '/proposta-base.html',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, noarchive, nosnippet, noimageindex' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" }
        ]
      }
    ];
  },

  experimental: {
    proxyClientMaxBodySize: 10 * 1024 * 1024, // 10 MB
  },

  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://127.0.0.1:4000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
