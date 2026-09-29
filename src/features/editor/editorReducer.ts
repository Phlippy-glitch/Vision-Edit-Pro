import { HISTORY_LIMIT } from '../../constants';
import type { DesignDoc, Layer } from '../../types/Editor.types';

export interface EditorState {
  doc: DesignDoc;
  past: DesignDoc[];
  future: DesignDoc[];
  selectedId: string | null;
  /**
   * Consecutive updates sharing a merge key (one drag, one slider scrub)
   * collapse into a single undo step.
   */
  lastMergeKey: string | null;
}

export type EditorAction =
  | { type: 'LOAD'; doc: DesignDoc }
  | { type: 'ADD_LAYER'; layer: Layer }
  | { type: 'UPDATE_LAYER'; id: string; changes: Partial<Layer>; mergeKey?: string }
  | { type: 'REMOVE_LAYER'; id: string }
  | { type: 'DUPLICATE_LAYER'; id: string; newId: string }
  | { type: 'REORDER_LAYER'; id: string; direction: 'forward' | 'backward' }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_HORIZON'; y: number; mergeKey?: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export function createEditorState(doc: DesignDoc): EditorState {
  return { doc, past: [], future: [], selectedId: null, lastMergeKey: null };
}

/** Render order bands: removals sit on the photo, surfaces above, objects on top. */
const KIND_ORDER: Record<Layer['kind'], number> = { removal: 0, area: 1, stamp: 2 };

/** Index at which a new layer goes: the top of its kind's band. */
export function insertionIndex(layers: readonly Layer[], kind: Layer['kind']): number {
  let index = 0;
  layers.forEach((layer, i) => {
    if (KIND_ORDER[layer.kind] <= KIND_ORDER[kind]) index = i + 1;
  });
  return index;
}

function commit(state: EditorState, doc: DesignDoc, mergeKey: string | null = null): EditorState {
  if (mergeKey !== null && mergeKey === state.lastMergeKey) {
    return { ...state, doc };
  }
  const past = [...state.past, state.doc].slice(-HISTORY_LIMIT);
  return { ...state, doc, past, future: [], lastMergeKey: mergeKey };
}

function mapLayer(doc: DesignDoc, id: string, fn: (layer: Layer) => Layer): DesignDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? fn(l) : l)) };
}

function selectionAfter(doc: DesignDoc, selectedId: string | null): string | null {
  return selectedId && doc.layers.some((l) => l.id === selectedId) ? selectedId : null;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOAD':
      return createEditorState(action.doc);

    case 'ADD_LAYER': {
      const layers = [...state.doc.layers];
      layers.splice(insertionIndex(layers, action.layer.kind), 0, action.layer);
      return { ...commit(state, { ...state.doc, layers }), selectedId: action.layer.id };
    }

    case 'UPDATE_LAYER': {
      if (!state.doc.layers.some((l) => l.id === action.id)) return state;
      const doc = mapLayer(state.doc, action.id, (l) => ({ ...l, ...action.changes }) as Layer);
      return commit(state, doc, action.mergeKey ?? null);
    }

    case 'REMOVE_LAYER': {
      const layers = state.doc.layers.filter((l) => l.id !== action.id);
      if (layers.length === state.doc.layers.length) return state;
      const next = commit(state, { ...state.doc, layers });
      return { ...next, selectedId: selectionAfter(next.doc, state.selectedId) };
    }

    case 'DUPLICATE_LAYER': {
      const index = state.doc.layers.findIndex((l) => l.id === action.id);
      if (index < 0) return state;
      const source = state.doc.layers[index];
      const copy = offsetCopy({ ...source, id: action.newId, name: `${source.name} copy` } as Layer);
      const layers = [...state.doc.layers];
      layers.splice(index + 1, 0, copy);
      return { ...commit(state, { ...state.doc, layers }), selectedId: copy.id };
    }

    case 'REORDER_LAYER': {
      const layers = [...state.doc.layers];
      const index = layers.findIndex((l) => l.id === action.id);
      const target = action.direction === 'forward' ? index + 1 : index - 1;
      if (index < 0 || target < 0 || target >= layers.length) return state;
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return commit(state, { ...state.doc, layers });
    }

    case 'SELECT':
      return { ...state, selectedId: action.id, lastMergeKey: null };

    case 'SET_HORIZON':
      return commit(state, { ...state.doc, horizonY: action.y }, action.mergeKey ?? null);

    case 'CLEAR_ALL':
      if (state.doc.layers.length === 0) return state;
      return { ...commit(state, { ...state.doc, layers: [] }), selectedId: null };

    case 'UNDO': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future],
        selectedId: selectionAfter(previous, state.selectedId),
        lastMergeKey: null,
      };
    }

    case 'REDO': {
      const next = state.future[0];
      if (!next) return state;
      return {
        doc: next,
        past: [...state.past, state.doc],
        future: state.future.slice(1),
        selectedId: selectionAfter(next, state.selectedId),
        lastMergeKey: null,
      };
    }

    default:
      return state;
  }
}

/** Nudges a duplicated layer so the copy is visible next to the original. */
function offsetCopy(layer: Layer): Layer {
  switch (layer.kind) {
    case 'stamp': {
      const shift = layer.height * 0.35;
      return { ...layer, x: layer.x + shift, seed: (layer.seed * 1103515245 + 12345) >>> 0 };
    }
    case 'area': {
      const shift = 24;
      return { ...layer, points: layer.points.map((p) => ({ x: p.x + shift, y: p.y + shift })) };
    }
    default:
      return layer;
  }
}
