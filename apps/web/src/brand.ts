// One place for the name and outside links, so a rename touches one file.
export const BRAND = "Vialz";
// The Chrome Web Store listing; VITE_CHROME_URL overrides it (a fork points it at its own listing or its install steps).
export const STORE_URL = "https://chromewebstore.google.com/detail/vialz-token-check-for-rob/fbnjfjdoddglgmpjfgcpfjdnobnddinb";
export const CHROME_URL = import.meta.env.VITE_CHROME_URL || STORE_URL;
// the packaged build, for installing by hand when the store is not an option
export const RELEASES_URL = "https://github.com/vialzapp/vialz/releases/latest";
export const ZIP_URL = "https://github.com/vialzapp/vialz/releases/latest/download/vialz-extension.zip";
export const CHROME_LABEL = "Add to Chrome";
export const API_BASE = import.meta.env.VITE_API_URL ?? "";
export const REPO_URL = "https://github.com/vialzapp/vialz";
export const X_URL = "https://x.com/vialzapp";
