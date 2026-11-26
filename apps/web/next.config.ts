import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a build/start run against its own output dir instead of the default
  // .next — needed when another dev server is already running against .next
  // in the same checkout (concurrent writes there corrupt page data).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),

  // The self-hosted MediaPipe WASM runtime + task models under public/cv are
  // ~10-20MB and never change without a deploy, but ship with no Cache-Control
  // by default — every reload re-downloads them, which is most of the
  // "camera takes forever to open" latency. A week is long enough to avoid
  // repeat downloads across sessions, short enough that a model/runtime swap
  // in a future deploy isn't stuck behind a stale cache for long (these
  // filenames aren't content-hashed, so no `immutable`).
  async headers() {
    return [
      {
        source: "/cv/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
