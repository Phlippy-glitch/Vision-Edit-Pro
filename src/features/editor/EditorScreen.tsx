import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Toast, type ToastMessage } from '../../components/Toast';
import { AUTOSAVE_DELAY_MS, DEFAULT_HORIZON_FRACTION, DEFAULT_REMOVE_BRUSH, THUMBNAIL_SIZE } from '../../constants';
import type { AssetCategory, AssetDef } from '../../services/art/assets.types';
import type { MaterialDef } from '../../services/art/materials';
import { buildEstimate, estimateToText, groundArea, type EstimateSettings } from '../../services/estimate';
import { loadEstimateSettings, loadPrices, saveEstimateSettings, savePrices } from '../../services/priceList';
import { getProject, saveProject } from '../../services/projectStore';
import { resultToLayer, runInpaint, strokesToMask, type BrushStroke } from '../../services/removal';
import { SceneRenderer } from '../../services/renderer';
import type { Layer, Point, Project, Tool } from '../../types/Editor.types';
import type { Rect } from '../../utils/geometry';
import { blobToCanvas, canvasToBlob } from '../../utils/image';
import { CompareOverlay } from './CompareOverlay';
import { EditorCanvas, type CanvasApi } from './EditorCanvas';
import { createEditorState, editorReducer } from './editorReducer';
import { ExportSheet } from './ExportSheet';
import { createAreaLayer, createStampLayer } from './layerFactory';
import { CatalogPanel } from './panels/CatalogPanel';
import { EstimatePanel } from './panels/EstimatePanel';
import { HorizonPanel } from './panels/HorizonPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { RemovePanel } from './panels/RemovePanel';
import { SurfacePanel } from './panels/SurfacePanel';

type PanelId = 'plants' | 'surfaces' | 'remove' | 'horizon' | 'layers' | 'estimate';

const TABS: { id: PanelId; label: string; icon: IconName }[] = [
  { id: 'plants', label: 'Plants', icon: 'tree' },
  { id: 'surfaces', label: 'Surfaces', icon: 'surface' },
  { id: 'remove', label: 'Remove', icon: 'eraser' },
  { id: 'horizon', label: 'Perspective', icon: 'horizon' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
  { id: 'estimate', label: 'Estimate', icon: 'receipt' },
];

/**
 * Steps a new object sideways until it no longer sits on top of an existing
 * one, so adding several shrubs in a row doesn't hide them behind each other.
 */
function freeSpotX(layers: readonly Layer[], x: number, y: number, width: number, visible: Rect): number {
  const step = Math.max(8, width * 0.9);
  const taken = (cx: number) =>
    layers.some((l) => l.kind === 'stamp' && Math.abs(l.x - cx) < step * 0.6 && Math.abs(l.y - y) < l.height * 0.5);
  for (let i = 0; i < 12; i++) {
    // Alternate right/left: +1, -1, +2, -2...
    const offset = Math.ceil(i / 2) * (i % 2 ? 1 : -1) * step;
    const cx = x + offset;
    if (cx < visible.x || cx > visible.x + visible.width) continue;
    if (!taken(cx)) return cx;
  }
  return x;
}

interface EditorScreenProps {
  projectId: string;
  onExit: () => void;
}

export function EditorScreen({ projectId, onExit }: EditorScreenProps) {
  const [loaded, setLoaded] = useState<{ project: Project; photo: HTMLCanvasElement } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const project = await getProject(projectId);
      if (!project) throw new Error('This project no longer exists on this device.');
      const photo = await blobToCanvas(project.photo);
      if (!cancelled) setLoaded({ project, photo });
    })().catch((e: unknown) => {
      console.error('Failed to open project:', e);
      if (!cancelled) setError(e instanceof Error ? e.message : 'Could not open this project.');
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="center-message">
        <p>{error}</p>
        <button className="btn" onClick={onExit}>
          Back to projects
        </button>
      </div>
    );
  }
  if (!loaded) {
    return (
      <div className="center-message">
        <span className="spinner" />
      </div>
    );
  }
  return <Editor project={loaded.project} photo={loaded.photo} onExit={onExit} />;
}

interface EditorProps {
  project: Project;
  photo: HTMLCanvasElement;
  onExit: () => void;
}

function Editor({ project, photo, onExit }: EditorProps) {
  const [redrawToken, requestRedraw] = useReducer((n: number) => n + 1, 0);
  const [renderer] = useState(() => new SceneRenderer(photo, requestRedraw));
  const [state, dispatch] = useReducer(editorReducer, project.doc, createEditorState);
  const [details, setDetails] = useState({ name: project.name, clientName: project.clientName });
  const [panel, setPanel] = useState<PanelId>('plants');
  const [catalogCategory, setCatalogCategory] = useState<AssetCategory>('trees');
  const [draftArea, setDraftArea] = useState<Point[] | null>(null);
  const [draftMaterial, setDraftMaterial] = useState<MaterialDef | null>(null);
  const [strokes, setStrokes] = useState<BrushStroke[]>([]);
  const [brushSize, setBrushSize] = useState(DEFAULT_REMOVE_BRUSH / 2);
  const [removing, setRemoving] = useState(false);
  const [lastRemoval, setLastRemoval] = useState<{ layerId: string; strokes: BrushStroke[]; candidate: number } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const canvasApi = useRef<CanvasApi | null>(null);
  const [prices, setPrices] = useState(loadPrices);
  const [estimateSettings, setEstimateSettings] = useState(loadEstimateSettings);

  const { doc, selectedId } = state;
  const estimate = useMemo(
    () => buildEstimate(doc, prices, estimateSettings, { width: renderer.width, height: renderer.height }),
    [doc, prices, estimateSettings, renderer],
  );

  const changePrice = (priceKey: string, price: number) => {
    const next = { ...prices, [priceKey]: price };
    setPrices(next);
    savePrices(next);
  };
  const changeEstimateSettings = (next: EstimateSettings) => {
    setEstimateSettings(next);
    saveEstimateSettings(next);
  };
  const estimateText = () =>
    estimateToText(estimate, [details.name, details.clientName].filter(Boolean).join(' – '), estimateSettings.taxRate);
  const selected = doc.layers.find((l) => l.id === selectedId) ?? null;
  const tool: Tool = panel === 'remove' ? 'remove' : panel === 'horizon' ? 'horizon' : draftArea ? 'area' : 'select';

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => setToast({ id: Date.now(), text, tone }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  // --- Autosave -----------------------------------------------------------
  const latest = useRef({ doc, details });
  latest.current = { doc, details };
  const dirty = useRef(false);
  const firstRender = useRef(true);
  const thumbnailRef = useRef(project.thumbnail);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const { doc: currentDoc, details: currentDetails } = latest.current;
    const record = () => ({ ...project, ...currentDetails, doc: currentDoc, thumbnail: thumbnailRef.current, updatedAt: Date.now() });
    try {
      // Write the design first: the app may be closing, and the thumbnail
      // render below takes long enough to be cut off.
      await saveProject(record());
      await renderer.whenReady(currentDoc);
      thumbnailRef.current = await canvasToBlob(renderer.composite(currentDoc, true, THUMBNAIL_SIZE), 'image/jpeg', 0.8);
      if (!dirty.current) await saveProject(record());
    } catch (e) {
      dirty.current = true;
      console.error('Autosave failed:', e);
      notify(e instanceof Error ? e.message : 'Could not save changes.', 'error');
    }
  }, [notify, project, renderer]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    dirty.current = true;
    const timer = setTimeout(save, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [doc, details, save]);

  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden') void save();
    };
    const flushNow = () => void save();
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('pagehide', flushNow);
    };
  }, [save]);

  useEffect(() => renderer.prune(doc), [doc, renderer]);

  const exit = async () => {
    await save();
    onExit();
  };

  // --- Keyboard shortcuts (tablets with keyboards, desktop) ---------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'REDO' : 'UNDO' });
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId) {
        dispatch({ type: 'REMOVE_LAYER', id: state.selectedId });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'SELECT', id: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.selectedId]);

  // --- Actions ------------------------------------------------------------
  const switchPanel = (next: PanelId) => {
    if (next === panel) return;
    setDraftArea(null);
    setDraftMaterial(null);
    if (panel === 'remove') {
      setStrokes([]);
      setLastRemoval(null);
    }
    if (next === 'remove' || next === 'horizon') dispatch({ type: 'SELECT', id: null });
    setPanel(next);
  };

  const addAsset = (asset: AssetDef) => {
    const visible = canvasApi.current?.getVisibleRect() ?? { x: 0, y: 0, width: renderer.width, height: renderer.height };
    // Objects stand on the ground, so start them in the foreground of what's
    // on screen rather than dead center (often near the horizon).
    const anchor = { x: visible.x + visible.width / 2, y: visible.y + visible.height * 0.8 };
    const layer = createStampLayer(asset, anchor, renderer.height, doc.horizonY);
    layer.x = freeSpotX(doc.layers, layer.x, layer.y, layer.height * asset.aspect, visible);
    dispatch({ type: 'ADD_LAYER', layer });
  };

  const startArea = (material: MaterialDef) => {
    dispatch({ type: 'SELECT', id: null });
    setDraftMaterial(material);
    setDraftArea([]);
  };

  const finishArea = () => {
    if (!draftArea || !draftMaterial || draftArea.length < 3) return;
    const layer = createAreaLayer(draftMaterial, draftArea, renderer.width);
    dispatch({ type: 'ADD_LAYER', layer });
    if (layer.perspective && Math.min(...draftArea.map((p) => p.y)) < doc.horizonY) {
      notify('Part of this area is above the horizon line. Adjust it in Perspective if the fill looks cut off.');
    }
    setDraftArea(null);
    setDraftMaterial(null);
  };

  const runRemoval = async (strokesToUse: BrushStroke[], candidate: number, replaceId: string | null) => {
    setRemoving(true);
    try {
      const sourceDoc = replaceId ? { ...doc, layers: doc.layers.filter((l) => l.id !== replaceId) } : doc;
      const source = renderer.removalSource(sourceDoc);
      const mask = strokesToMask(strokesToUse, renderer.width, renderer.height);
      const result = await runInpaint(source, mask, candidate);
      if (!result) {
        notify('Could not find enough surrounding texture. Try a smaller area, away from the photo edge.', 'error');
        return;
      }
      const count = doc.layers.filter((l) => l.kind === 'removal').length;
      const layer = resultToLayer(result, `Removed area ${count + (replaceId ? 0 : 1)}`);
      if (replaceId) {
        const { x, y, width, height, patch } = layer;
        dispatch({ type: 'UPDATE_LAYER', id: replaceId, changes: { x, y, width, height, patch }, mergeKey: `retry-${replaceId}` });
        setLastRemoval({ layerId: replaceId, strokes: strokesToUse, candidate });
      } else {
        dispatch({ type: 'ADD_LAYER', layer });
        dispatch({ type: 'SELECT', id: null });
        setLastRemoval({ layerId: layer.id, strokes: strokesToUse, candidate });
      }
      setStrokes([]);
    } catch (e) {
      console.error('Removal failed:', e);
      notify('Removal failed. Please try again with a smaller area.', 'error');
    } finally {
      setRemoving(false);
    }
  };

  const lastRemovalExists = lastRemoval !== null && doc.layers.some((l) => l.id === lastRemoval.layerId);

  // --- Bottom panel -------------------------------------------------------
  const showProperties = selected !== null && tool === 'select';
  let content;
  if (showProperties) {
    content = (
      <PropertiesPanel
        key={selected.id}
        layer={selected}
        imageWidth={renderer.width}
        imageHeight={renderer.height}
        measuredAreaSqFt={
          selected.kind === 'area' && selected.perspective
            ? groundArea(selected.points, doc.horizonY, renderer.width, renderer.height, estimateSettings.cameraHeightFt).sqFt
            : undefined
        }
        dispatch={dispatch}
        onDone={() => dispatch({ type: 'SELECT', id: null })}
      />
    );
  } else if (panel === 'plants') {
    content = <CatalogPanel category={catalogCategory} onCategoryChange={setCatalogCategory} onPick={addAsset} />;
  } else if (panel === 'surfaces') {
    content = (
      <SurfacePanel
        draft={draftArea}
        draftMaterial={draftMaterial}
        onPick={startArea}
        onUndoPoint={() => setDraftArea((d) => (d ? d.slice(0, -1) : d))}
        onCancel={() => {
          setDraftArea(null);
          setDraftMaterial(null);
        }}
        onFinish={finishArea}
      />
    );
  } else if (panel === 'remove') {
    content = (
      <RemovePanel
        brushSize={brushSize}
        onBrushSize={setBrushSize}
        strokeCount={strokes.length}
        busy={removing}
        canRetry={lastRemovalExists && strokes.length === 0}
        onClear={() => setStrokes([])}
        onRemove={() => runRemoval(strokes, 0, null)}
        onRetry={() => lastRemoval && runRemoval(lastRemoval.strokes, lastRemoval.candidate + 1, lastRemoval.layerId)}
      />
    );
  } else if (panel === 'horizon') {
    content = (
      <HorizonPanel onReset={() => dispatch({ type: 'SET_HORIZON', y: renderer.height * DEFAULT_HORIZON_FRACTION })} />
    );
  } else if (panel === 'estimate') {
    content = (
      <EstimatePanel
        estimate={estimate}
        settings={estimateSettings}
        onPriceChange={changePrice}
        onSettingsChange={changeEstimateSettings}
        onCopy={() =>
          navigator.clipboard
            .writeText(estimateText())
            .then(() => notify('Estimate copied — paste it into a text or email.'))
            .catch(() => notify('Could not copy on this device.', 'error'))
        }
      />
    );
  } else {
    content = <LayersPanel layers={doc.layers} selectedId={selectedId} dispatch={dispatch} />;
  }

  return (
    <div className="editor">
      <header className="topbar">
        <button className="icon-btn" onClick={exit} aria-label="Back to projects">
          <Icon name="back" />
        </button>
        <button className="topbar-title" onClick={() => setExportOpen(true)}>
          <span>{details.name}</span>
          {details.clientName && <small>{details.clientName}</small>}
        </button>
        <button className="icon-btn" onClick={() => dispatch({ type: 'UNDO' })} disabled={state.past.length === 0} aria-label="Undo">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => dispatch({ type: 'REDO' })} disabled={state.future.length === 0} aria-label="Redo">
          <Icon name="redo" />
        </button>
        <button className="icon-btn" onClick={() => setCompareOpen(true)} aria-label="Compare before and after">
          <Icon name="compare" />
        </button>
        <button className="icon-btn icon-btn-accent" onClick={() => setExportOpen(true)} aria-label="Share">
          <Icon name="share" />
        </button>
      </header>

      <EditorCanvas
        renderer={renderer}
        doc={doc}
        selectedId={selectedId}
        tool={tool}
        draftArea={draftArea}
        onDraftAreaChange={setDraftArea}
        onCloseDraftArea={finishArea}
        strokes={strokes}
        onStrokesChange={setStrokes}
        brushSize={brushSize}
        dispatch={dispatch}
        redrawToken={redrawToken}
        apiRef={canvasApi}
      />

      <section className="bottom">
        <div className="bottom-content">{content}</div>
        <nav className="tabbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab ${panel === tab.id ? 'tab-active' : ''}`}
              onClick={() => {
                switchPanel(tab.id);
                if (tab.id !== 'layers') dispatch({ type: 'SELECT', id: null });
              }}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      </section>

      {compareOpen && <CompareOverlay renderer={renderer} doc={doc} onClose={() => setCompareOpen(false)} />}
      {exportOpen && (
        <ExportSheet
          renderer={renderer}
          doc={doc}
          name={details.name}
          clientName={details.clientName}
          onDetailsChange={setDetails}
          onClose={() => setExportOpen(false)}
          onMessage={notify}
          estimate={estimate}
          taxRate={estimateSettings.taxRate}
        />
      )}
      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
