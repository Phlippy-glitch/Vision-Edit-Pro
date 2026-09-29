import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import { Toast, type ToastMessage } from '../../components/Toast';
import { AUTOSAVE_DELAY_MS, DEFAULT_HORIZON_FRACTION, DEFAULT_REMOVE_BRUSH, THUMBNAIL_SIZE } from '../../constants';
import type { AssetDef } from '../../services/art/assets.types';
import type { MaterialDef } from '../../services/art/materials';
import { getProject, saveProject } from '../../services/projectStore';
import { resultToLayer, runInpaint, strokesToMask, type BrushStroke } from '../../services/removal';
import { SceneRenderer } from '../../services/renderer';
import type { Point, Project, Tool } from '../../types/Editor.types';
import { blobToCanvas, canvasToBlob } from '../../utils/image';
import { CompareOverlay } from './CompareOverlay';
import { EditorCanvas, type CanvasApi } from './EditorCanvas';
import { createEditorState, editorReducer } from './editorReducer';
import { ExportSheet } from './ExportSheet';
import { createAreaLayer, createStampLayer } from './layerFactory';
import { CatalogPanel } from './panels/CatalogPanel';
import { HorizonPanel } from './panels/HorizonPanel';
import { LayersPanel } from './panels/LayersPanel';
import { PropertiesPanel } from './panels/PropertiesPanel';
import { RemovePanel } from './panels/RemovePanel';
import { SurfacePanel } from './panels/SurfacePanel';

type PanelId = 'plants' | 'surfaces' | 'remove' | 'horizon' | 'layers';

const TABS: { id: PanelId; label: string; icon: IconName }[] = [
  { id: 'plants', label: 'Plants', icon: 'tree' },
  { id: 'surfaces', label: 'Surfaces', icon: 'surface' },
  { id: 'remove', label: 'Remove', icon: 'eraser' },
  { id: 'horizon', label: 'Perspective', icon: 'horizon' },
  { id: 'layers', label: 'Layers', icon: 'layers' },
];

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

  const { doc, selectedId } = state;
  const selected = doc.layers.find((l) => l.id === selectedId) ?? null;
  const tool: Tool = panel === 'remove' ? 'remove' : panel === 'horizon' ? 'horizon' : draftArea ? 'area' : 'select';

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => setToast({ id: Date.now(), text, tone }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  // --- Autosave -----------------------------------------------------------
  const latest = useRef({ doc, details });
  latest.current = { doc, details };
  const dirty = useRef(false);
  const firstRender = useRef(true);

  const save = useCallback(async () => {
    if (!dirty.current) return;
    dirty.current = false;
    const { doc: currentDoc, details: currentDetails } = latest.current;
    try {
      await renderer.whenReady(currentDoc);
      const thumbnail = await canvasToBlob(renderer.composite(currentDoc, true, THUMBNAIL_SIZE), 'image/jpeg', 0.8);
      await saveProject({ ...project, ...currentDetails, doc: currentDoc, thumbnail, updatedAt: Date.now() });
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
    document.addEventListener('visibilitychange', flush);
    return () => document.removeEventListener('visibilitychange', flush);
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
    dispatch({ type: 'ADD_LAYER', layer: createStampLayer(asset, anchor, renderer.height, doc.horizonY) });
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
        dispatch={dispatch}
        onDone={() => dispatch({ type: 'SELECT', id: null })}
      />
    );
  } else if (panel === 'plants') {
    content = <CatalogPanel onPick={addAsset} />;
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
        />
      )}
      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
