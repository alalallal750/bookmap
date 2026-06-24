/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  outputFileTracingIncludes: {
    'app/api/physical-search/route': ['./data/**'],
  },
};

export default nextConfig;