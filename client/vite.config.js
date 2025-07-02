import { defineConfig, loadEnv } from "vite";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load .env files from the parent directory (the project root)
  const env = loadEnv(mode, path.resolve(__dirname, ".."), "VITE_");

  return {
    // Make environment variables available at build time
    define: {
      __SERVER_FEATURES_ENABLED__: JSON.stringify(
        env.VITE_SERVER_FEATURES_ENABLED === "true"
      ),
      __DEV_MODE__: JSON.stringify(env.VITE_DEV_MODE === "true"),
      __DEMO_MODE__: JSON.stringify(env.VITE_DEMO_MODE === "true"),
    },
  };
});
