/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

// Production: static export to out/, pushed with the staticfile buildpack and served
// through the approuter. Development: proxy /api to the Flask backend on :8080.
const nextConfig = isProd
  ? { output: "export", images: { unoptimized: true } }
  : {
      async rewrites() {
        return [{ source: "/api/:path*", destination: "http://localhost:8080/api/:path*" }];
      },
    };

export default nextConfig;
