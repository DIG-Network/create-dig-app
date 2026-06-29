/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export — Next emits a folder of static files to out/, which digstore publishes as a
  // capsule. A DIG capsule is a blind static host; there is no Next.js server at runtime.
  output: "export",
  // Relative-friendly asset paths so the build works under a *.on.dig.net subdomain and chia://.
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
