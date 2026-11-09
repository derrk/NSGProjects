"use client";

import * as React from "react";
import Image from "next/image";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { resizeImage } from "@/lib/image-resize";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Manages the product image list. Uploads to Vercel Blob when configured; always
// allows pasting an image URL, so the form is fully usable before Blob is set up.

const noopSubscribe = () => () => {};

/** True on a phone or tablet, where a camera is worth offering. */
function useTouchDevice(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

export function ImageUpload({ initial = [] }: { initial?: string[] }) {
  const [images, setImages] = React.useState<string[]>(initial);
  const [busy, setBusy] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [urlDraft, setUrlDraft] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const cameraRef = React.useRef<HTMLInputElement>(null);
  const touch = useTouchDevice();

  async function uploadOne(file: File): Promise<string> {
    // Shrink first: a phone photo often exceeds the 4.5MB body limit, and the
    // storefront renders these a few hundred pixels wide regardless.
    const { file: toSend } = await resizeImage(file);
    const fd = new FormData();
    fd.append("file", toSend);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Upload failed");
    return data.url as string;
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const input = e.target;
    if (files.length === 0) return;

    setError(null);
    setBusy(files.length);
    const failures: string[] = [];

    // One at a time: a phone on a weak connection does better sequentially,
    // and a partial failure should still keep the photos that did upload.
    for (const file of files) {
      try {
        const url = await uploadOne(file);
        setImages((imgs) => (imgs.includes(url) ? imgs : [...imgs, url]));
      } catch (err) {
        failures.push(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy((n) => n - 1);
      }
    }

    if (failures.length > 0) {
      setError(
        failures.length === files.length
          ? failures[0]
          : `${failures.length} of ${files.length} didn't upload: ${failures[0]}`,
      );
    }
    input.value = "";
  }

  function addUrl() {
    const url = urlDraft.trim();
    if (!url) return;
    setImages((imgs) => (imgs.includes(url) ? imgs : [...imgs, url]));
    setUrlDraft("");
  }

  function remove(url: string) {
    setImages((imgs) => imgs.filter((i) => i !== url));
  }

  const uploading = busy > 0;

  return (
    <div className="space-y-3">
      <input type="hidden" name="images" value={JSON.stringify(images)} />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((url, i) => (
            <div
              key={url}
              className="relative h-24 w-24 overflow-hidden rounded-md border border-border bg-secondary"
            >
              <Image src={url} alt={`Image ${i + 1}`} fill sizes="96px" className="object-cover" />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-primary/90 py-0.5 text-center text-[10px] font-medium text-primary-foreground">
                  Primary
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(url)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground hover:text-destructive"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Phones only. `capture` opens the rear camera directly instead of a
            file browser; desktop ignores it, so showing it there is just a
            second button that does the same thing as the first. */}
        {touch && (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => cameraRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
              Take photo
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFiles}
              className="hidden"
            />
          </>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading && !touch ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          {touch ? "Choose photos" : "Upload"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFiles}
          className="hidden"
        />

        <span className="text-xs text-muted-foreground">or paste a URL:</span>
        <Input
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="https://…"
          className="h-8 max-w-xs"
        />
        <Button type="button" variant="secondary" size="sm" onClick={addUrl}>
          Add
        </Button>
      </div>

      {uploading && (
        <p className="text-xs text-muted-foreground">
          Uploading {busy} photo{busy === 1 ? "" : "s"}…
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        The first image is the primary shown on the store. Photos are resized
        before upload, so a full-resolution phone picture is fine.
      </p>
    </div>
  );
}
