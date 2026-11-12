import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cropRect, defaultCrop, MAX_ZOOM, MIN_ZOOM, type CropView } from "../lib/avatarImage";

type Props = {
  file: File;
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (crop: CropView) => void;
};

/**
 * Pick the part of a photo that becomes the profile picture: drag to move,
 * slider / wheel / +- keys to zoom. The maths lives in `cropRect`, which the
 * upload uses too, so the preview and the saved image always agree.
 */
export function PhotoCropper({ file, saving, error, onCancel, onSave }: Props) {
  const titleId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; centerX: number; centerY: number } | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<CropView | null>(null);
  const [size, setSize] = useState(280);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setNatural(null);
    setView(null);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setSize(node.getBoundingClientRect().width || 280);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const region = natural && view ? cropRect(natural.width, natural.height, view) : null;
  const scale = region ? size / region.side : 1;

  const update = useCallback(
    (next: Partial<CropView>) => {
      setView((current) => {
        if (!current || !natural) return current;
        const merged = { ...current, ...next };
        const clamped = cropRect(natural.width, natural.height, merged);
        return { zoom: clamped.zoom, centerX: clamped.centerX, centerY: clamped.centerY };
      });
    },
    [natural]
  );

  // Wheel zoom needs a non-passive listener so the page does not scroll too.
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) =>
        current ? { ...current, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom - event.deltaY * 0.004)) } : current
      );
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // Closing on Escape keeps the dialog usable without a mouse.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, saving]);

  // Re-clamp after zooming so the crop never reaches past the photo's edge.
  useEffect(() => {
    if (!natural || !view) return;
    const clamped = cropRect(natural.width, natural.height, view);
    if (clamped.centerX !== view.centerX || clamped.centerY !== view.centerY || clamped.zoom !== view.zoom) {
      setView({ zoom: clamped.zoom, centerX: clamped.centerX, centerY: clamped.centerY });
    }
  }, [natural, view]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!region) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, centerX: region.centerX, centerY: region.centerY };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start) return;
    update({
      centerX: start.centerX - (event.clientX - start.x) / scale,
      centerY: start.centerY - (event.clientY - start.y) / scale,
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!region) return;
    const step = region.side * 0.05;
    const moves: Record<string, Partial<CropView>> = {
      ArrowLeft: { centerX: region.centerX - step },
      ArrowRight: { centerX: region.centerX + step },
      ArrowUp: { centerY: region.centerY - step },
      ArrowDown: { centerY: region.centerY + step },
      "+": { zoom: region.zoom + 0.2 },
      "=": { zoom: region.zoom + 0.2 },
      "-": { zoom: region.zoom - 0.2 },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    update(move);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel(); }}>
      <div className="modal cropper" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 id={titleId}>Adjust your photo</h3>
        <p className="cropper-help">Drag to choose the part you want. Zoom with the slider or your scroll wheel.</p>

        <div
          ref={viewportRef}
          className="cropper-viewport"
          tabIndex={0}
          role="group"
          aria-label="Photo crop area. Use arrow keys to move and plus or minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerCancel={() => { dragRef.current = null; }}
          onKeyDown={onKeyDown}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth: width, naturalHeight: height } = event.currentTarget;
                setNatural({ width, height });
                setView(defaultCrop(width, height));
              }}
              style={
                region && natural
                  ? {
                      width: natural.width * scale,
                      height: natural.height * scale,
                      transform: `translate(${-region.x * scale}px, ${-region.y * scale}px)`,
                    }
                  : { visibility: "hidden" }
              }
            />
          )}
          <span className="cropper-grid" aria-hidden="true" />
        </div>

        <div className="cropper-zoom">
          <button
            className="btn btn-ghost"
            type="button"
            aria-label="Zoom out"
            disabled={!view || saving}
            onClick={() => view && update({ zoom: view.zoom - 0.25 })}
          >
            −
          </button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view?.zoom ?? MIN_ZOOM}
            disabled={!view || saving}
            aria-label="Zoom"
            onChange={(event) => update({ zoom: Number(event.target.value) })}
          />
          <button
            className="btn btn-ghost"
            type="button"
            aria-label="Zoom in"
            disabled={!view || saving}
            onClick={() => view && update({ zoom: view.zoom + 0.25 })}
          >
            +
          </button>
        </div>

        {error && <p className="cropper-error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button
            className="btn btn-ghost"
            type="button"
            disabled={!natural || saving}
            onClick={() => natural && setView(defaultCrop(natural.width, natural.height))}
          >
            Reset
          </button>
          <div className="topbar-spacer" />
          <button className="btn" type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!view || saving}
            onClick={() => view && onSave(view)}
          >
            {saving ? "Saving…" : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
