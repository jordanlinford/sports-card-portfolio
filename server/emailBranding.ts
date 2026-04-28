/**
 * Branded header used at the top of every transactional and announcement email.
 *
 * Goals:
 *  - Carry the new HobbyAlpha mark + wordmark from the web app into the inbox so
 *    subscribers immediately recognize who the message is from.
 *  - Render reliably in both light and dark email clients without relying on
 *    `prefers-color-scheme` (which Outlook + a number of webmail clients
 *    strip). We achieve this by giving the header its own dark navy background
 *    so the white wordmark always sits on a known surface.
 *  - Use a stable, cacheable absolute URL for the logo image so Gmail's image
 *    proxy and other webmail clients can fetch and cache it once. The PNG is
 *    served from `client/public/email/` (i.e. the SPA's static asset root) so
 *    Vite ships it in dev and the production build copies it to dist/public.
 *
 * Note on file format: most modern clients render SVG, but Outlook for
 * Windows + a number of mobile clients still don't. We rasterize to PNG once
 * at build/dev time so every client renders the mark identically.
 */

const FALLBACK_DOMAIN = "hobbyalpha.com";

function getBrandBaseUrl(): string {
  const domain = process.env.CUSTOM_DOMAIN || FALLBACK_DOMAIN;
  return `https://${domain}`;
}

export function getEmailLogoUrl(): string {
  // We always serve the *light* wordmark (white "Hobby" + gradient "Alpha")
  // because the surrounding header table fills its background with the navy
  // brand color, so the wordmark is visually correct regardless of the email
  // client's light/dark mode. The `-dark` wordmark and the standalone square
  // `hobbyalpha-mark.png` are intentionally pre-rendered by
  // `scripts/brand/build-brand.mjs` and committed at the same path so future
  // template variants (e.g. compact mobile-only headers, or a transparent-bg
  // layout that swaps wordmark by `prefers-color-scheme`) can reach for them
  // without needing another build pass.
  return `${getBrandBaseUrl()}/email/hobbyalpha-wordmark-light.png`;
}

/**
 * Returns the HTML for the branded email header.
 *
 * Designed as a single-cell `<table>` (the most reliably supported layout
 * primitive in HTML email) with a navy background so the white wordmark looks
 * the same in light + dark email clients.
 */
export function buildEmailHeaderHtml(): string {
  const logoUrl = getEmailLogoUrl();
  const homeUrl = `${getBrandBaseUrl()}/`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ` +
    `style="background-color:#0F172A;border-radius:8px;margin:0 0 20px 0;">` +
    `<tr><td align="center" style="padding:20px 16px;">` +
    `<a href="${homeUrl}" style="text-decoration:none;border:0;outline:none;">` +
    `<img src="${logoUrl}" alt="HobbyAlpha" width="240" height="47" ` +
    `style="display:block;border:0;outline:none;text-decoration:none;` +
    `width:240px;height:auto;max-width:80%;" />` +
    `</a>` +
    `</td></tr></table>`
  );
}

/**
 * Plain-text counterpart so the text/plain alternative still announces the
 * brand at the top of the message.
 */
export function buildEmailHeaderText(): string {
  return `HobbyAlpha\n----------\n\n`;
}
