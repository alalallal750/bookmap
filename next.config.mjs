/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  outputFileTracingIncludes: {
    '/api/physical-search/**': ['./data/**'],
  },
};

export default nextConfig;