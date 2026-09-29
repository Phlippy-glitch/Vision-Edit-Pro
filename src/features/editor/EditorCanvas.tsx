import { useCallback, useEffect, useLayoutEffect, useRef, type Dispatch, type MutableRefObject } from 'react';
import { HANDLE_RADIUS, MAX_ZOOM, MIN_ZOOM_FACTOR, TAP_SLOP } from '../../constants';
import { getAsset } from '../../services/art/catalog';
import type { BrushStroke } from '../../services/removal';
import type { SceneRenderer } from '../../services/renderer';
import type { AreaLayer, DesignDoc, Point, StampLayer, Tool } from '../../types/Editor.types';
import {
  clamp,
  distance,
  fitView,
  imageToScreen,
  midpoint,
  pointInPolygon,
  rotatePoint,
  screenToImage,
  zoomAt,
  type Rect,
  type ViewTransform,
} from '../../utils/geometry';
import type { EditorAction } from './editorReducer';
import { depthFactor, scalesWithDepth } from './layerFactory';

export interface CanvasApi {
  /** The part of the photo currently on screen, in image coordinates. */
  getVisibleRect(): Rect;
  fit(): void;
}

interface EditorCanvasProps {
  renderer: SceneRenderer;
  doc: DesignDoc;
  selectedId: string | null;
  tool: Tool;
  draftArea: Point[] | null;
  onDraftAreaChange: (points: Point[]) => void;
  onCloseDraftArea: () => void;
  strokes: BrushStroke[];
  onStrokesChange: (strokes: BrushStroke[]) => void;
  /** Removal brush radius in screen pixels. */
  brushSize: number;
  dispatch: Dispatch<EditorAction>;
  redrawToken: number;
  apiRef: MutableRefObject<CanvasApi | null>;
}

type Gesture =
  | { type: 'pan'; start: Point; startView: ViewTransform; moved: boolean; onTap: () => void }
  | { type: 'pinch-view'; startDist: number; startMid: Point; startView: ViewTransform }
  | { type: 'pinch-stamp'; id: string; startDist: number; startAngle: number; startHeight: number; startRotation: number; key: string }
  | { type: 'move-stamp'; id: string; startImg: Point; startX: number; startY: number; startHeight: number; depth: boolean; key: string }
  | { type: 'scale-stamp'; id: string; anchor: Point; startDist: number; startHeight: number; key: string }
  | { type: 'rotate-stamp'; id: string; anchor: Point; startAngle: number; startRotation: number; key: string }
  | { type: 'move-vertex'; id: string; index: number; key: string }
  | { type: 'move-area'; id: string; startImg: Point; startPoints: Point[]; key: string }
  | { type: 'paint'; stroke: BrushStroke }
  | { type: 'horizon'; key: string };

const ACCENT = '#46c47e';
const DOUBLE_TAP_MS = 350;
const ROTATE_HANDLE_OFFSET = 34;
const ROTATION_SNAP = (3 * Math.PI) / 180;

let gestureCounter = 0;
const nextKey = (prefix: string) => `${prefix}-${++gestureCounter}`;

export function EditorCanvas(props: EditorCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const viewRef = useRef<ViewTransform>({ scale: 1, offsetX: 0, offsetY: 0 });
  const fitScaleRef = useRef(1);
  const userMovedViewRef = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const pointersRef = useRef(new Map<number, Point>());
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef(0);
  const lastTapRef = useRef({ time: 0, key: '' });

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { renderer, doc, tool, draftArea, strokes, selectedId } = propsRef.current;
    const { width, height, dpr } = sizeRef.current;
    const view = viewRef.current;
    const gesture = gestureRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f1412';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);
    ctx.imageSmoothingQuality = 'high';
    const draftIds = gesture && (gesture.type === 'move-vertex' || gesture.type === 'move-area') ? new Set([gesture.id]) : undefined;
    renderer.drawScene(ctx, doc, { draftIds });
    if (tool === 'horizon') drawHorizonGuide(ctx, renderer, doc.horizonY, view.scale);
    ctx.restore();

    const allStrokes = gesture?.type === 'paint' ? [...strokes, gesture.stroke] : strokes;
    if (allStrokes.length) drawStrokes(ctx, allStrokes, view, width, height, dpr, overlayRef);
    if (draftArea) drawDraftArea(ctx, draftArea, view);
    const selected = doc.layers.find((l) => l.id === selectedId);
    if (selected && tool === 'select' && selected.visible) {
      if (selected.kind === 'stamp') drawStampSelection(ctx, renderer, selected, view);
      else if (selected.kind === 'area') drawAreaSelection(ctx, selected, view);
      else {
        const a = imageToScreen(selected, view);
        dashedRect(ctx, a.x, a.y, selected.width * view.scale, selected.height * view.scale);
      }
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const fit = useCallback(() => {
    const { renderer } = propsRef.current;
    const { width, height } = sizeRef.current;
    if (!width || !height) return;
    viewRef.current = fitView(renderer.width, renderer.height, width, height);
    fitScaleRef.current = viewRef.current.scale;
    userMovedViewRef.current = false;
    scheduleDraw();
  }, [scheduleDraw]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const observer = new ResizeObserver(() => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      if (!userMovedViewRef.current) fit();
      else {
        fitScaleRef.current = fitView(propsRef.current.renderer.width, propsRef.current.renderer.height, rect.width, rect.height).scale;
        scheduleDraw();
      }
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [fit, scheduleDraw]);

  useEffect(() => {
    props.apiRef.current = {
      getVisibleRect: () => {
        const { width, height } = sizeRef.current;
        const { renderer } = propsRef.current;
        const a = screenToImage({ x: 0, y: 0 }, viewRef.current);
        const b = screenToImage({ x: width, y: height }, viewRef.current);
        const x = clamp(a.x, 0, renderer.width);
        const y = clamp(a.y, 0, renderer.height);
        return { x, y, width: clamp(b.x, 0, renderer.width) - x, height: clamp(b.y, 0, renderer.height) - y };
      },
      fit,
    };
  }, [fit, props.apiRef]);

  useEffect(scheduleDraw, [
    scheduleDraw,
    props.doc,
    props.selectedId,
    props.tool,
    props.draftArea,
    props.strokes,
    props.redrawToken,
  ]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const setView = (view: ViewTransform) => {
    viewRef.current = view;
    userMovedViewRef.current = true;
    scheduleDraw();
  };

  /** Limits a zoom factor so the result stays within the allowed range. */
  const limitZoom = (from: ViewTransform, factor: number) =>
    clamp(from.scale * factor, fitScaleRef.current * MIN_ZOOM_FACTOR, MAX_ZOOM) / from.scale;

  const localPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const clampToImage = (p: Point): Point => {
    const { renderer } = propsRef.current;
    return { x: clamp(p.x, 0, renderer.width), y: clamp(p.y, 0, renderer.height) };
  };

  const isDoubleTap = (key: string) => {
    const now = performance.now();
    const hit = lastTapRef.current.key === key && now - lastTapRef.current.time < DOUBLE_TAP_MS;
    lastTapRef.current = hit ? { time: 0, key: '' } : { time: now, key };
    return hit;
  };

  const beginPinch = () => {
    const [a, b] = [...pointersRef.current.values()];
    const { doc, selectedId, dispatch } = propsRef.current;
    const current = gestureRef.current;
    if (current?.type === 'paint') gestureRef.current = null; // second finger: navigating, not painting
    const selected = doc.layers.find((l) => l.id === selectedId);
    const onStamp =
      current && selected?.kind === 'stamp' && ['move-stamp', 'scale-stamp', 'rotate-stamp'].includes(current.type);
    if (onStamp && selected?.kind === 'stamp') {
      if (current?.type === 'move-stamp') {
        // Undo the small drag the first finger made before the second landed.
        dispatch({ type: 'UPDATE_LAYER', id: selected.id, changes: { x: current.startX, y: current.startY, height: current.startHeight }, mergeKey: current.key });
      }
      gestureRef.current = {
        type: 'pinch-stamp',
        id: selected.id,
        startDist: Math.max(1, distance(a, b)),
        startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        startHeight: selected.height,
        startRotation: selected.rotation,
        key: current && 'key' in current ? current.key : nextKey('pinch'),
      };
    } else {
      gestureRef.current = { type: 'pinch-view', startDist: Math.max(1, distance(a, b)), startMid: midpoint(a, b), startView: viewRef.current };
    }
  };

  const hitSelectedHandles = (screen: Point, img: Point): Gesture | null => {
    const { doc, selectedId, renderer, dispatch } = propsRef.current;
    const view = viewRef.current;
    const selected = doc.layers.find((l) => l.id === selectedId);
    if (!selected || !selected.visible) return null;
    if (selected.kind === 'stamp') {
      const h = stampHandles(renderer, selected, view);
      if (distance(screen, h.rotate) < HANDLE_RADIUS) {
        return {
          type: 'rotate-stamp',
          id: selected.id,
          anchor: h.anchor,
          startAngle: Math.atan2(screen.y - h.anchor.y, screen.x - h.anchor.x),
          startRotation: selected.rotation,
          key: nextKey('rotate'),
        };
      }
      if (distance(screen, h.scale) < HANDLE_RADIUS) {
        return {
          type: 'scale-stamp',
          id: selected.id,
          anchor: h.anchor,
          startDist: Math.max(1, distance(screen, h.anchor)),
          startHeight: selected.height,
          key: nextKey('scale'),
        };
      }
    }
    if (selected.kind === 'area') {
      const pts = selected.points.map((p) => imageToScreen(p, view));
      const vertex = pts.findIndex((p) => distance(p, screen) < HANDLE_RADIUS);
      if (vertex >= 0) {
        if (isDoubleTap(`${selected.id}:${vertex}`) && selected.points.length > 3) {
          dispatch({ type: 'UPDATE_LAYER', id: selected.id, changes: { points: selected.points.filter((_, i) => i !== vertex) } });
          return null;
        }
        return { type: 'move-vertex', id: selected.id, index: vertex, key: nextKey('vertex') };
      }
      const mid = pts.findIndex((p, i) => distance(midpoint(p, pts[(i + 1) % pts.length]), screen) < HANDLE_RADIUS * 0.8);
      if (mid >= 0) {
        const points = [...selected.points];
        points.splice(mid + 1, 0, clampToImage(img));
        const key = nextKey('vertex');
        dispatch({ type: 'UPDATE_LAYER', id: selected.id, changes: { points }, mergeKey: key });
        return { type: 'move-vertex', id: selected.id, index: mid + 1, key };
      }
    }
    return null;
  };

  const hitLayer = (img: Point) => {
    const { doc, renderer } = propsRef.current;
    const slop = 6 / viewRef.current.scale;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const layer = doc.layers[i];
      if (!layer.visible) continue;
      if (layer.kind === 'stamp' && renderer.hitTestStamp(layer, img, slop)) return layer;
      if (layer.kind === 'area' && pointInPolygon(img, layer.points)) return layer;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const screen = localPoint(e);
    pointersRef.current.set(e.pointerId, screen);
    if (pointersRef.current.size === 2) {
      beginPinch();
      scheduleDraw();
      return;
    }
    if (pointersRef.current.size > 2) return;

    const { tool, doc, dispatch, selectedId, brushSize, renderer, onDraftAreaChange, onCloseDraftArea } = propsRef.current;
    const view = viewRef.current;
    const img = screenToImage(screen, view);
    const pan = (onTap: () => void): Gesture => ({ type: 'pan', start: screen, startView: view, moved: false, onTap });

    switch (tool) {
      case 'remove':
        gestureRef.current = { type: 'paint', stroke: { points: [img], radius: brushSize / view.scale } };
        break;
      case 'horizon': {
        const key = nextKey('horizon');
        gestureRef.current = { type: 'horizon', key };
        dispatch({ type: 'SET_HORIZON', y: clamp(img.y, -renderer.height, renderer.height * 0.95), mergeKey: key });
        break;
      }
      case 'area':
        gestureRef.current = pan(() => {
          const draft = propsRef.current.draftArea ?? [];
          if (draft.length >= 3 && distance(imageToScreen(draft[0], viewRef.current), screen) < HANDLE_RADIUS) {
            onCloseDraftArea();
          } else {
            onDraftAreaChange([...draft, clampToImage(img)]);
          }
        });
        break;
      case 'select': {
        const handle = hitSelectedHandles(screen, img);
        if (handle) {
          gestureRef.current = handle;
          break;
        }
        const hit = hitLayer(img);
        if (hit) {
          if (hit.id !== selectedId) dispatch({ type: 'SELECT', id: hit.id });
          if (hit.kind === 'stamp') {
            const asset = getAsset(hit.assetId);
            gestureRef.current = {
              type: 'move-stamp',
              id: hit.id,
              startImg: img,
              startX: hit.x,
              startY: hit.y,
              startHeight: hit.height,
              depth: asset ? scalesWithDepth(asset) : false,
              key: nextKey('move'),
            };
          } else if (hit.kind === 'area') {
            gestureRef.current = { type: 'move-area', id: hit.id, startImg: img, startPoints: hit.points, key: nextKey('move') };
          }
        } else {
          gestureRef.current = pan(() => {
            if (isDoubleTap('empty')) fit();
            else if (doc.layers.some((l) => l.id === propsRef.current.selectedId)) dispatch({ type: 'SELECT', id: null });
          });
        }
        break;
      }
    }
    scheduleDraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    const screen = localPoint(e);
    pointersRef.current.set(e.pointerId, screen);
    const gesture = gestureRef.current;
    if (!gesture) return;
    const { dispatch, doc, renderer } = propsRef.current;
    const view = viewRef.current;
    const img = screenToImage(screen, view);

    switch (gesture.type) {
      case 'pan': {
        if (!gesture.moved && distance(screen, gesture.start) < TAP_SLOP) return;
        gesture.moved = true;
        setView({
          scale: gesture.startView.scale,
          offsetX: gesture.startView.offsetX + screen.x - gesture.start.x,
          offsetY: gesture.startView.offsetY + screen.y - gesture.start.y,
        });
        return;
      }
      case 'pinch-view': {
        const [a, b] = [...pointersRef.current.values()];
        if (!b) return;
        const mid = midpoint(a, b);
        const factor = limitZoom(gesture.startView, distance(a, b) / gesture.startDist);
        const limited = zoomAt(gesture.startView, gesture.startMid, factor);
        setView({ ...limited, offsetX: limited.offsetX + mid.x - gesture.startMid.x, offsetY: limited.offsetY + mid.y - gesture.startMid.y });
        return;
      }
      case 'pinch-stamp': {
        const [a, b] = [...pointersRef.current.values()];
        if (!b) return;
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        dispatch({
          type: 'UPDATE_LAYER',
          id: gesture.id,
          changes: {
            height: Math.max(4, gesture.startHeight * (distance(a, b) / gesture.startDist)),
            rotation: snapRotation(gesture.startRotation + angle - gesture.startAngle),
          },
          mergeKey: gesture.key,
        });
        return;
      }
      case 'move-stamp': {
        const x = gesture.startX + img.x - gesture.startImg.x;
        const y = gesture.startY + img.y - gesture.startImg.y;
        let height = gesture.startHeight;
        if (gesture.depth) {
          // Keep apparent size consistent with distance as the object moves.
          const from = depthFactor(gesture.startY, doc.horizonY, renderer.height);
          height = gesture.startHeight * (depthFactor(y, doc.horizonY, renderer.height) / from);
        }
        dispatch({ type: 'UPDATE_LAYER', id: gesture.id, changes: { x, y, height }, mergeKey: gesture.key });
        return;
      }
      case 'scale-stamp':
        dispatch({
          type: 'UPDATE_LAYER',
          id: gesture.id,
          changes: { height: Math.max(4, gesture.startHeight * (distance(screen, gesture.anchor) / gesture.startDist)) },
          mergeKey: gesture.key,
        });
        return;
      case 'rotate-stamp': {
        const angle = Math.atan2(screen.y - gesture.anchor.y, screen.x - gesture.anchor.x);
        dispatch({
          type: 'UPDATE_LAYER',
          id: gesture.id,
          changes: { rotation: snapRotation(gesture.startRotation + angle - gesture.startAngle) },
          mergeKey: gesture.key,
        });
        return;
      }
      case 'move-vertex': {
        const layer = doc.layers.find((l): l is AreaLayer => l.id === gesture.id && l.kind === 'area');
        if (!layer) return;
        const points = layer.points.map((p, i) => (i === gesture.index ? clampToImage(img) : p));
        dispatch({ type: 'UPDATE_LAYER', id: gesture.id, changes: { points }, mergeKey: gesture.key });
        return;
      }
      case 'move-area': {
        const dx = img.x - gesture.startImg.x;
        const dy = img.y - gesture.startImg.y;
        const points = gesture.startPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        dispatch({ type: 'UPDATE_LAYER', id: gesture.id, changes: { points }, mergeKey: gesture.key });
        return;
      }
      case 'paint': {
        const last = gesture.stroke.points[gesture.stroke.points.length - 1];
        if (distance(imageToScreen(last, view), screen) > 2) {
          gesture.stroke.points.push(img);
          scheduleDraw();
        }
        return;
      }
      case 'horizon':
        dispatch({ type: 'SET_HORIZON', y: clamp(img.y, -renderer.height, renderer.height * 0.95), mergeKey: gesture.key });
        return;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.delete(e.pointerId)) return;
    const gesture = gestureRef.current;
    if (!gesture) return;
    if (gesture.type === 'pinch-view' || gesture.type === 'pinch-stamp') {
      // Lifting one finger ends the pinch; don't turn the remaining finger into a pan jump.
      if (pointersRef.current.size <= 1) gestureRef.current = null;
      return;
    }
    if (pointersRef.current.size > 0) return;
    gestureRef.current = null;
    if (e.type === 'pointercancel') {
      scheduleDraw();
      return;
    }
    if (gesture.type === 'pan' && !gesture.moved) gesture.onTap();
    if (gesture.type === 'paint') {
      propsRef.current.onStrokesChange([...propsRef.current.strokes, gesture.stroke]);
    }
    scheduleDraw();
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const factor = limitZoom(viewRef.current, Math.exp(-e.deltaY * 0.0015));
    setView(zoomAt(viewRef.current, localPoint(e), factor));
  };

  return (
    <div ref={wrapperRef} className="editor-canvas">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

function snapRotation(rotation: number): number {
  return Math.abs(rotation) < ROTATION_SNAP ? 0 : rotation;
}

function stampHandles(renderer: SceneRenderer, layer: StampLayer, view: ViewTransform) {
  const { width, height } = renderer.stampSize(layer);
  const anchorImg = { x: layer.x, y: layer.y };
  const corner = (lx: number, ly: number) =>
    imageToScreen(rotatePoint({ x: layer.x + lx, y: layer.y + ly }, anchorImg, layer.rotation), view);
  const corners = [corner(-width / 2, -height), corner(width / 2, -height), corner(width / 2, 0), corner(-width / 2, 0)];
  const topCenter = corner(0, -height);
  const up = { x: Math.sin(layer.rotation), y: -Math.cos(layer.rotation) };
  return {
    anchor: imageToScreen(anchorImg, view),
    corners,
    topCenter,
    scale: corners[1],
    rotate: { x: topCenter.x + up.x * ROTATE_HANDLE_OFFSET, y: topCenter.y + up.y * ROTATE_HANDLE_OFFSET },
  };
}

function handleDot(ctx: CanvasRenderingContext2D, p: Point, r: number, fill = '#fff') {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = ACCENT;
  ctx.stroke();
}

function outlinePath(ctx: CanvasRenderingContext2D, points: readonly Point[], close: boolean) {
  ctx.beginPath();
  points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  if (close) ctx.closePath();
  ctx.setLineDash([]);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.setLineDash([]);
}

function dashedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  outlinePath(
    ctx,
    [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    true,
  );
}

function drawStampSelection(ctx: CanvasRenderingContext2D, renderer: SceneRenderer, layer: StampLayer, view: ViewTransform) {
  const h = stampHandles(renderer, layer, view);
  outlinePath(ctx, h.corners, true);
  ctx.beginPath();
  ctx.moveTo(h.topCenter.x, h.topCenter.y);
  ctx.lineTo(h.rotate.x, h.rotate.y);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  handleDot(ctx, h.rotate, 10, ACCENT);
  ctx.beginPath();
  ctx.arc(h.rotate.x, h.rotate.y, 5, -Math.PI * 0.9, Math.PI * 0.5);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  handleDot(ctx, h.scale, 10);
  ctx.beginPath();
  ctx.moveTo(h.scale.x - 4, h.scale.y + 4);
  ctx.lineTo(h.scale.x + 4, h.scale.y - 4);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Ground anchor marker.
  ctx.beginPath();
  ctx.arc(h.anchor.x, h.anchor.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
}

function drawAreaSelection(ctx: CanvasRenderingContext2D, layer: AreaLayer, view: ViewTransform) {
  const pts = layer.points.map((p) => imageToScreen(p, view));
  outlinePath(ctx, pts, true);
  pts.forEach((p, i) => {
    const m = midpoint(p, pts[(i + 1) % pts.length]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m.x - 3.5, m.y);
    ctx.lineTo(m.x + 3.5, m.y);
    ctx.moveTo(m.x, m.y - 3.5);
    ctx.lineTo(m.x, m.y + 3.5);
    ctx.stroke();
  });
  pts.forEach((p) => handleDot(ctx, p, 8));
}

function drawDraftArea(ctx: CanvasRenderingContext2D, draft: readonly Point[], view: ViewTransform) {
  const pts = draft.map((p) => imageToScreen(p, view));
  if (pts.length >= 3) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(70,196,126,0.25)';
    ctx.fill();
  }
  if (pts.length >= 2) outlinePath(ctx, pts, false);
  pts.forEach((p, i) => {
    if (i === 0 && pts.length >= 3) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, HANDLE_RADIUS * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,196,126,0.35)';
      ctx.fill();
    }
    handleDot(ctx, p, i === 0 ? 9 : 7, i === 0 ? ACCENT : '#fff');
  });
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly BrushStroke[],
  view: ViewTransform,
  width: number,
  height: number,
  dpr: number,
  overlayRef: MutableRefObject<HTMLCanvasElement | null>,
) {
  // Strokes are drawn opaque on a scratch canvas, then composited once, so
  // overlapping strokes don't stack darker.
  let overlay = overlayRef.current;
  if (!overlay) overlay = overlayRef.current = document.createElement('canvas');
  overlay.width = Math.round(width * dpr);
  overlay.height = Math.round(height * dpr);
  const o = overlay.getContext('2d')!;
  o.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.offsetX, dpr * view.offsetY);
  o.strokeStyle = o.fillStyle = '#ff4057';
  o.lineCap = 'round';
  o.lineJoin = 'round';
  for (const stroke of strokes) {
    if (stroke.points.length === 1) {
      o.beginPath();
      o.arc(stroke.points[0].x, stroke.points[0].y, stroke.radius, 0, Math.PI * 2);
      o.fill();
    } else {
      o.lineWidth = stroke.radius * 2;
      o.beginPath();
      stroke.points.forEach((p, i) => (i ? o.lineTo(p.x, p.y) : o.moveTo(p.x, p.y)));
      o.stroke();
    }
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(overlay, 0, 0);
  ctx.restore();
}

function drawHorizonGuide(ctx: CanvasRenderingContext2D, renderer: SceneRenderer, horizonY: number, scale: number) {
  const w = renderer.width;
  const h = renderer.height;
  const cx = w / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.lineWidth = 1.2 / scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  // Receding lines toward the vanishing point, and ground rows spaced by depth.
  for (let k = -8; k <= 8; k++) {
    ctx.beginPath();
    ctx.moveTo(cx, horizonY);
    ctx.lineTo(cx + k * w * 0.2, h * 2);
    ctx.stroke();
  }
  for (let n = 1; n < 14; n++) {
    const y = horizonY + (h * 1.6 - horizonY) / (n * 0.75);
    if (y > h) continue;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.lineWidth = 3 / scale;
  ctx.strokeStyle = '#ffd24a';
  ctx.setLineDash([12 / scale, 8 / scale]);
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(w, horizonY);
  ctx.stroke();
  ctx.restore();
}
