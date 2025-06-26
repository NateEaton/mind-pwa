import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load .env files from the parent directory (the project root)
  const env = loadEnv(mode, path.resolve(__dirname, '..'), 'VITE_');

  // Add the debug log back in just for this one test run!
  console.log('--- DEBUG: Final check of loaded envs ---');
  console.log(env);
  console.log('--- END DEBUG ---');

  return {
    // The define property is NOT needed when using the VITE_ prefix.
    // Vite handles it automatically.
  };
});