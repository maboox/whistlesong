import { defineConfig, type Plugin } from "vitest/config";

// Strict CSP, injected for production builds only (dev server needs inline HMR scripts).
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src blob:",
  "worker-src 'self' blob:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const cspPlugin: Plugin = {
  name: "inject-csp",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
};

// Relative base so the site works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: "./",
  plugins: [cspPlugin],
  build: { target: "es2022", sourcemap: false },
  worker: { format: "es" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
