"use client";

// Save an image that we only have as a data: URL (base64). Works around iOS
// Safari, where `<a download>` is ignored for data: URLs — the link looks tappable
// but does nothing. On devices that can share files (iPhone/iPad) this opens the
// native share sheet so the user can "Save Image" to Photos or "Save to Files";
// everywhere else it falls back to a normal file download.
export async function saveImageDataUrl(dataUrl: string, baseName: string): Promise<void> {
  if (!dataUrl) return;
  const safeBase = (baseName || "image").replace(/\.[a-z0-9]+$/i, "") || "image";

  try {
    const blob = await (await fetch(dataUrl)).blob();
    const type = blob.type || "image/jpeg";
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
    const name = `${safeBase}.${ext}`;

    // Native share sheet — the reliable path on iOS (Save to Photos / Files).
    const file = new File([blob], name, { type });
    const nav = navigator as Navigator & { canShare?: (data?: { files?: File[] }) => boolean };
    if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        // User dismissed the share sheet — don't then force a download.
        if ((err as DOMException)?.name === "AbortError") return;
        // Any other share failure: fall through to the download below.
      }
    }

    // Fallback: object-URL download (desktop + Android Chrome).
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    // Last resort: open the image in a new tab so it can be long-pressed / saved.
    try {
      window.open(dataUrl, "_blank");
    } catch {
      /* ignore */
    }
  }
}
