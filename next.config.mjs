/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Standalone output bundles a minimal server + traced dependencies,
  // which is what the Dockerfile copies into the runtime image.
  output: 'standalone',
}

export default nextConfig
