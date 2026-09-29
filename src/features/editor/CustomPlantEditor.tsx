import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { percent, Slider } from '../../components/Slider';
import type { AssetDef } from '../../services/art/assets.types';
import { floodSelect, makeCutout } from '../../services/cutout';
import { createCustomAsset } from '../../services/customAssets';
import type { Point } from '../../types/Editor.types';
import { createCanvas, get2d } from '../../utils/canvas';
import { distance, fitView, imageToScreen, screenToImage, type ViewTransform } from '../../utils/geometry';
import { blobToCanvas, importPhoto } from '../../utils/image';
import type { RGBAImage } from '../../utils/pixels';

/** Working resolution for cutting out; plenty for an object placed in a scene. */
const EDIT_MAX_DIMENSION = 1200;
const CLOSE_DISTANCE = 22;

const SIZE_PRESETS = [
  { label: 'Groundcover / perennial', value: 0.06 },
  { label: 'Small shrub', value: 0.1 },
  { label: 'Large shrub', value: 0.16 },
  { label: 'Small tree', value: 0.3 },
  { label: 'Large tree', value: 0.5 },
];

type Mode = 'erase' | 'outline';

interface Snapshot {
  erased: Uint8Array | null;
  outline: Point[];
}

interface CustomPlantEditorProps {
  file: File;
  onCancel: () => void;
  onSaved: (asset: AssetDef, price: number | null) => void;
  onError: (message: string) => void;
}

export function CustomPlantEditor({ file, onCancel, onSaved, onError }: CustomPlantEditorProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<{ canvas: HTMLCanvasElement; data: RGBAImage } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<Mode>('erase');
  const [tolerance, setTolerance] = useState(0.12);
  const [erased, setErased] = useState<Uint8Array | null>(null);
  const [outline, setOutline] = useState<Point[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [name, setName] = useState('');
  const [heightPreset, setHeightPreset] = useState(0.1);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { blob } = await importPhoto(file);
      const full = await blobToCanvas(blob);
      const scale = Math.min(1, EDIT_MAX_DIMENSION / Math.max(full.width, full.height));
      const canvas = createCanvas(full.width * scale, full.height * scale);
      const ctx = get2d(canvas);
      ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
      if (!cancelled) setSource({ canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height) });
    })().catch((e: unknown) => {
      console.error('Could not open plant photo:', e);
      onError(e instanceof Error ? e.message : 'Could not open that photo.');
    });
    return () => {
      cancelled = true;
    };
  }, [file, onError]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      const rect = stage.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const view: ViewTransform | null = source && size.width ? fitView(source.canvas.width, source.canvas.height, size.width, size.height, 12) : null;

  // Preview: erased pixels become transparent, the area outside the outline is dimmed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || !view) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawChecker(ctx, size.width, size.height);

    const preview = createCanvas(source.canvas.width, source.canvas.height);
    const pctx = get2d(preview);
    const img = pctx.createImageData(preview.width, preview.height);
    img.data.set(source.data.data);
    if (erased) for (let i = 0; i < erased.length; i++) if (erased[i]) img.data[i * 4 + 3] = 0;
    pctx.putImageData(img, 0, 0);
    if (outline.length >= 3) {
      // Fade everything outside the outline so the result is easy to judge.
      pctx.globalCompositeOperation = 'destination-out';
      pctx.fillStyle = 'rgba(0,0,0,0.75)';
      pctx.beginPath();
      pctx.rect(0, 0, preview.width, preview.height);
      outline.forEach((p, i) => (i ? pctx.lineTo(p.x, p.y) : pctx.moveTo(p.x, p.y)));
      pctx.closePath();
      pctx.fill('evenodd');
    }
    ctx.drawImage(preview, view.offsetX, view.offsetY, preview.width * view.scale, preview.height * view.scale);

    if (outline.length) {
      const pts = outline.map((p) => imageToScreen(p, view));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (pts.length >= 3) ctx.closePath();
      ctx.strokeStyle = '#46c47e';
      ctx.lineWidth = 2;
      ctx.stroke();
      pts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#46c47e' : '#fff';
        ctx.fill();
      });
    }
  }, [source, view, size, erased, outline]);

  const pushHistory = () => setHistory((h) => [...h.slice(-19), { erased, outline }]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source || !view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const screen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const p = screenToImage(screen, view);
    if (p.x < 0 || p.y < 0 || p.x >= source.canvas.width || p.y >= source.canvas.height) return;
    pushHistory();
    if (mode === 'erase') {
      const selected = floodSelect(source.data, p.x, p.y, tolerance);
      const next = erased ? Uint8Array.from(erased) : new Uint8Array(selected.length);
      for (let i = 0; i < selected.length; i++) if (selected[i]) next[i] = 1;
      setErased(next);
    } else {
      setOutline((pts) => (pts.length >= 3 && distance(imageToScreen(pts[0], view), screen) < CLOSE_DISTANCE ? pts : [...pts, p]));
    }
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setErased(last.erased);
    setOutline(last.outline);
    setHistory((h) => h.slice(0, -1));
  };

  const save = async () => {
    if (!source) return;
    setSaving(true);
    try {
      const result = makeCutout(source.data, { outline: outline.length >= 3 ? outline : null, erased, feather: 1.5 });
      if (!result) {
        onError('Nothing is left to save. Undo some erasing and try again.');
        return;
      }
      const asset = await createCustomAsset(result.image, name.trim() || 'My plant', heightPreset);
      const parsedPrice = Number(price);
      onSaved(asset, price.trim() !== '' && Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : null);
    } catch (e) {
      console.error('Saving custom plant failed:', e);
      onError(e instanceof Error ? e.message : 'Could not save this plant.');
    } finally {
      setSaving(false);
    }
  };

  const edited = erased !== null || outline.length >= 3;

  return (
    <div className="overlay plant-editor">
      <div className="overlay-bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel">
          <Icon name="close" />
        </button>
        <span className="overlay-title">Cut out your plant</span>
        <button className="icon-btn" onClick={undo} disabled={history.length === 0} aria-label="Undo">
          <Icon name="undo" />
        </button>
      </div>
      <div ref={stageRef} className="plant-stage">
        <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} onPointerUp={onTap} />
        {!source && (
          <div className="center-message">
            <span className="spinner" />
          </div>
        )}
      </div>
      <div className="plant-controls">
        <div className="chips" role="tablist">
          <button role="tab" aria-selected={mode === 'erase'} className={`chip ${mode === 'erase' ? 'chip-active' : ''}`} onClick={() => setMode('erase')}>
            Magic eraser
          </button>
          <button role="tab" aria-selected={mode === 'outline'} className={`chip ${mode === 'outline' ? 'chip-active' : ''}`} onClick={() => setMode('outline')}>
            Outline
          </button>
        </div>
        {mode === 'erase' ? (
          <>
            <p className="hint">Tap the background (sky, pavement, the nursery lot) to remove it. Tap again to remove more.</p>
            <Slider label="Color tolerance" value={tolerance} min={0.02} max={0.4} format={percent} onChange={setTolerance} />
          </>
        ) : (
          <p className="hint">Tap around the plant to outline it, including the pot or root ball if you want them. Everything outside is removed.</p>
        )}
        <label className="field">
          <span>Name</span>
          <input value={name} placeholder="e.g. Limelight hydrangea 3 gal" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="plant-row">
          <label className="field">
            <span>Typical size</span>
            <select value={heightPreset} onChange={(e) => setHeightPreset(Number(e.target.value))}>
              {SIZE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Price each ($)</span>
            <input type="number" inputMode="decimal" min={0} value={price} placeholder="optional" onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <button className="btn btn-primary btn-large" disabled={!source || !edited || saving} onClick={save}>
          {saving ? <span className="spinner spinner-inline" /> : <Icon name="check" size={18} />}
          Save to My plants
        </button>
      </div>
    </div>
  );
}

function drawChecker(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cell = 12;
  ctx.fillStyle = '#2a2f2c';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#3a403c';
  for (let y = 0; y < height; y += cell) {
    for (let x = (y / cell) % 2 ? cell : 0; x < width; x += cell * 2) ctx.fillRect(x, y, cell, cell);
  }
}
