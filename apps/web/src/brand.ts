// One place for the name and outside links, so a rename touches one file.
export const BRAND = "Vialz";
// The button reads as the store listing already. Until the Chrome Web Store listing is live it points at the install
// steps; set VITE_CHROME_URL to the listing and nothing else changes.
export const CHROME_URL = import.meta.env.VITE_CHROME_URL ?? "/docs#install";
export const CHROME_LABEL = "Add to Chrome";
export const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const REPO_URL = "https://github.com/vialzapp/vialz";
export const X_URL = "https://x.com/vialzapp";
