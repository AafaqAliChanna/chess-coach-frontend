// Single source of truth for the backend's base URL. Every fetch() call in
// the app should import this instead of hardcoding a URL — swapping
// environments (local dev vs. staging vs. production) then means changing
// one env variable, not hunting through every page file.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";
