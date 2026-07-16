"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Camera, X, Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function AttachmentUploader({
  paths,
  onChange,
  label = "Photos",
  hint = "Snap the cards + cash at the show, attach them here when you log it.",
}: {
  paths: string[];
  // Accepts a functional updater so concurrent uploads compose without clobbering.
  onChange: Dispatch<SetStateAction<string[]>>;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const toUpload = Array.from(files);
    // Reset the input up front so re-selecting the same file (or a fresh batch
    // mid-upload) isn't blocked by browser dedup.
    if (inputRef.current) inputRef.current.value = "";
    setUploading((n) => n + toUpload.length);
    for (const file of toUpload) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        // Functional update: append to the latest state, never a stale snapshot.
        onChange((prev) => [...prev, data.path]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function remove(p: string) {
    onChange((prev) => prev.filter((x) => x !== p));
  }

  return (
    <div>
      <Label className="mb-1.5 block">{label}</Label>
      <div className="flex flex-wrap items-center gap-3">
        {paths.map((p) => (
          <div
            key={p}
            className="group relative size-20 overflow-hidden rounded-md border border-border bg-muted"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p} alt="attachment" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex size-20 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-muted-foreground transition-colors hover:bg-accent/40",
          )}
        >
          {uploading > 0 ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Camera className="size-5" />
          )}
          <span className="text-[10px]">Add</span>
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
