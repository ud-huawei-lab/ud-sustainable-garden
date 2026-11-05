export function vercelConfig(origin) {
  if (!origin)
    throw new Error(
      "Set GARDEN_BACKEND_ORIGIN to the HTTPS origin of the deployed Garden Node backend before deploying to Vercel.",
    );
  const backend = new URL(origin);
  if (
    backend.protocol !== "https:" ||
    backend.origin !== origin ||
    backend.username ||
    backend.password
  )
    throw new Error(
      "GARDEN_BACKEND_ORIGIN must be an HTTPS origin without credentials, path, or trailing slash.",
    );
  return {
    framework: "vite",
    buildCommand: "npm run build",
    outputDirectory: "dist",
    rewrites: [
      { source: "/api/:path*", destination: `${backend.origin}/api/:path*` },
      { source: "/auth/:path*", destination: `${backend.origin}/auth/:path*` },
    ],
    headers: [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'",
          },
        ],
      },
    ],
  };
}
