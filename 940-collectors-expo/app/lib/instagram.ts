// Normalize a vendor-entered Instagram value into a bare handle. Vendors paste
// all sorts of things into this field — full profile URLs, share links with a
// ?stkn=… token, a leading @, trailing slashes, or (occasionally) an email
// address. Returns a clean handle, or null when the value isn't a usable
// Instagram username (which also prevents rendering an email as a public link).
export function instagramHandle(raw?: string | null): string | null {
  if (!raw) return null;
  let h = raw.trim();
  const fromUrl = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (fromUrl) h = fromUrl[1];
  h = h
    .replace(/^@+/, "")
    .split(/[?#]/)[0]
    .replace(/\/+$/, "")
    .trim();
  // A real IG username is letters/numbers/periods/underscores, up to 30 chars.
  // Anything else (emails, sentences, phone numbers) is rejected.
  if (!/^[A-Za-z0-9._]{1,30}$/.test(h)) return null;
  return h;
}

export function instagramUrl(handle: string): string {
  return `https://instagram.com/${handle}`;
}
