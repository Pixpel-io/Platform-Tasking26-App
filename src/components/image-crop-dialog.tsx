"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui";

// Interactive square-crop dialog: drops the user into a Cropper that lets them
// pan / zoom the source image until the tile-sized region looks right, then
// spits back a Blob rendered from that region. Output is always PNG so
// workspace / avatar tiles with transparent backgrounds stay transparent.
export function ImageCropDialog({
  file,
  aspect = 1,
  title = "Crop image",
  confirmLabel = "Save",
  onDone,
  onCancel,
}: {
  file: File;
  aspect?: number;
  title?: string;
  confirmLabel?: string;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropped, setCropped] = useState<Area | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCropped(pixels);
  }, []);

  async function save() {
    if (!imgUrl || !cropped) return;
    setPending(true);
    try {
      const blob = await cropToBlob(imgUrl, cropped);
      onDone(blob);
    } finally {
      setPending(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-100 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg animate-scale-in rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted">
          Drag to reposition, pinch or use the slider to zoom.
        </p>

        {imgUrl && (
          <div className="relative mt-4 h-64 w-full overflow-hidden rounded-xl bg-black sm:h-72">
            <Cropper
              image={imgUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid={false}
              objectFit="contain"
            />
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-medium text-muted">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1 flex-1 cursor-pointer accent-primary"
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !cropped}>
            {pending ? "Cropping…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Draw the requested pixel region of the source image onto a canvas and hand
// back a PNG blob. PNG (not JPEG) keeps transparency for logos with alpha.
async function cropToBlob(imgUrl: string, area: Area): Promise<Blob> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = imgUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("image load failed"));
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(area.width));
  canvas.height = Math.max(1, Math.round(area.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not supported");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob failed"))),
      "image/png",
    );
  });
}
