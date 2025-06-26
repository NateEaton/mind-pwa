export const CONFIG = {
  GOOGLE_API_KEY: import.meta.env.VITE_GOOGLE_API_KEY,
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID,
  DROPBOX_APP_KEY: import.meta.env.VITE_DROPBOX_APP_KEY,
  DEV_MODE: import.meta.env.VITE_DEV_MODE === 'true',
};