import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart(),
    mode === "production" ? nitro({ preset: "vercel" }) : null,
    viteReact(),
  ],
  server: {
    port: 3001,
  },
}));
