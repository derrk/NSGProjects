import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

// Photo upload. On Vercel (BLOB_READ_WRITE_TOKEN present) files go to Vercel
// Blob — the serverless filesystem is ephemeral. Locally they land in
// public/uploads as before.

const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// Allow-list of image MIME types -> the extension WE choose (never trust the
// client filename, which could be x.svg/x.html and become a stored-XSS vector).
const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
};

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 400 });
    }
    // Require a recognized image content-type (empty/absent type is rejected).
    const ext = MIME_EXT[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported or missing image type: ${file.type || "none"}` },
        { status: 400 },
      );
    }

    const name = `${randomUUID()}${ext}`;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(`uploads/${name}`, file, {
        access: "public",
        contentType: file.type,
      });
      return NextResponse.json({ path: blob.url });
    }

    // Local-dev fallback: write to public/uploads.
    const buf = Buffer.from(await file.arrayBuffer());
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, name), buf);
    return NextResponse.json({ path: `/uploads/${name}` });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 },
    );
  }
}
