import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import type { SceneRenderer } from '../../services/renderer';
import type { DesignDoc } from '../../types/Editor.types';
import { clamp, fitView } from '../../utils/geometry';

interface CompareOverlayProps {
  renderer: SceneRenderer;
  doc: DesignDoc;
  onClose: () => void;
}

/** Full-screen before/after wipe for walking a client through the proposal. */
export function CompareOverlay({ renderer, doc, onClose }: CompareOverlayProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [after, setAfter] = useState<HTMLCanvasElement | null>(null);
  const [split, setSplit] = useState(0.5);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const draggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    renderer.whenReady(doc).then(() => {
      if (!cancelled) setAfter(renderer.composite(doc, true));
    });
    return () => {
      cancelled = true;
    };
  }, [renderer, doc]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const observer = new ResizeObserver(() => {
      const rect = wrapper.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  const view = size.width ? fitView(renderer.width, renderer.height, size.width, size.height, 0) : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view || !after) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.imageSmoothingQuality = 'high';
    const w = renderer.width * view.scale;
    const h = renderer.height * view.scale;
    ctx.drawImage(renderer.photoCanvas, view.offsetX, view.offsetY, w, h);
    const splitX = view.offsetX + w * split;
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, size.width, size.height);
    ctx.clip();
    ctx.drawImage(after, view.offsetX, view.offsetY, w, h);
    ctx.restore();
  }, [after, renderer, size, split, view]);

  const updateSplit = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    setSplit(clamp((x - view.offsetX) / (renderer.width * view.scale), 0, 1));
  };

  const handleX = view ? view.offsetX + renderer.width * view.scale * split : 0;

  return (
    <div className="overlay compare">
      <div className="overlay-bar">
        <span className="overlay-title">Before / After</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close comparison">
          <Icon name="close" />
        </button>
      </div>
      <div
        ref={wrapperRef}
        className="compare-stage"
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateSplit(e.clientX);
        }}
        onPointerMove={(e) => draggingRef.current && updateSplit(e.clientX)}
        onPointerUp={() => (draggingRef.current = false)}
        onPointerCancel={() => (draggingRef.current = false)}
      >
        <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} />
        {!after && <div className="center-message"><span className="spinner" /></div>}
        {view && after && (
          <>
            <div className="compare-divider" style={{ left: handleX }}>
              <span className="compare-knob">
                <Icon name="compare" size={18} />
              </span>
            </div>
            <span className="compare-label" style={{ left: 12 }}>
              Before
            </span>
            <span className="compare-label compare-label-right">After</span>
          </>
        )}
      </div>
      <p className="overlay-hint">Drag across the photo to reveal the proposed design.</p>
    </div>
  );
}
