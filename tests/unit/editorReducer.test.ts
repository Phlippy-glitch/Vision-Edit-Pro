import { describe, expect, it } from 'vitest';
import {
  createEditorState,
  editorReducer,
  insertionIndex,
  type EditorState,
} from '../../src/features/editor/editorReducer';
import type { AreaLayer, Layer, RemovalLayer, StampLayer } from '../../src/types/Editor.types';

function stamp(id: string, x = 100): StampLayer {
  return {
    id,
    kind: 'stamp',
    name: 'Shrub',
    visible: true,
    opacity: 1,
    assetId: 'boxwood',
    seed: 1,
    x,
    y: 200,
    height: 80,
    rotation: 0,
    flipX: false,
    brightness: 1,
    shadow: true,
  };
}

function area(id: string): AreaLayer {
  return {
    id,
    kind: 'area',
    name: 'Lawn',
    visible: true,
    opacity: 1,
    materialId: 'lawn',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    tileSize: 100,
    textureAngle: 0,
    perspective: true,
    shading: 0.6,
    brightness: 1,
    feather: 2,
  };
}

function removal(id: string): RemovalLayer {
  return { id, kind: 'removal', name: 'Removed', visible: true, opacity: 1, x: 0, y: 0, width: 4, height: 4, patch: '' };
}

const empty = (): EditorState => createEditorState({ layers: [], horizonY: 300 });

function run(state: EditorState, ...actions: Parameters<typeof editorReducer>[1][]): EditorState {
  return actions.reduce(editorReducer, state);
}

describe('editorReducer', () => {
  describe('ADD_LAYER', () => {
    it('adds and selects the layer', () => {
      const state = run(empty(), { type: 'ADD_LAYER', layer: stamp('a') });
      expect(state.doc.layers.map((l) => l.id)).toEqual(['a']);
      expect(state.selectedId).toBe('a');
      expect(state.past).toHaveLength(1);
    });

    it('keeps removals under surfaces and surfaces under objects', () => {
      const state = run(
        empty(),
        { type: 'ADD_LAYER', layer: stamp('s1') },
        { type: 'ADD_LAYER', layer: area('a1') },
        { type: 'ADD_LAYER', layer: removal('r1') },
        { type: 'ADD_LAYER', layer: area('a2') },
        { type: 'ADD_LAYER', layer: stamp('s2') },
      );
      expect(state.doc.layers.map((l) => l.id)).toEqual(['r1', 'a1', 'a2', 's1', 's2']);
    });
  });

  describe('insertionIndex', () => {
    it('returns the top of the matching band', () => {
      const layers: Layer[] = [removal('r'), area('a'), stamp('s')];
      expect(insertionIndex(layers, 'removal')).toBe(1);
      expect(insertionIndex(layers, 'area')).toBe(2);
      expect(insertionIndex(layers, 'stamp')).toBe(3);
    });
  });

  describe('UPDATE_LAYER', () => {
    it('coalesces updates with the same merge key into one undo step', () => {
      let state = run(empty(), { type: 'ADD_LAYER', layer: stamp('a') });
      for (let x = 101; x <= 110; x++) {
        state = editorReducer(state, { type: 'UPDATE_LAYER', id: 'a', changes: { x }, mergeKey: 'drag-1' });
      }
      expect(state.past).toHaveLength(2);
      state = editorReducer(state, { type: 'UNDO' });
      expect((state.doc.layers[0] as StampLayer).x).toBe(100);
    });

    it('creates separate undo steps for different gestures', () => {
      const state = run(
        empty(),
        { type: 'ADD_LAYER', layer: stamp('a') },
        { type: 'UPDATE_LAYER', id: 'a', changes: { x: 150 }, mergeKey: 'drag-1' },
        { type: 'UPDATE_LAYER', id: 'a', changes: { x: 180 }, mergeKey: 'drag-2' },
        { type: 'UNDO' },
      );
      expect((state.doc.layers[0] as StampLayer).x).toBe(150);
    });

    it('ignores unknown layers without touching history', () => {
      const before = empty();
      const after = editorReducer(before, { type: 'UPDATE_LAYER', id: 'missing', changes: { opacity: 0.5 } });
      expect(after).toBe(before);
    });
  });

  describe('UNDO / REDO', () => {
    it('round-trips and clears redo after a new change', () => {
      let state = run(empty(), { type: 'ADD_LAYER', layer: stamp('a') }, { type: 'ADD_LAYER', layer: stamp('b') });
      state = run(state, { type: 'UNDO' });
      expect(state.doc.layers).toHaveLength(1);
      expect(state.selectedId).toBeNull();
      state = run(state, { type: 'REDO' });
      expect(state.doc.layers).toHaveLength(2);
      state = run(state, { type: 'UNDO' }, { type: 'ADD_LAYER', layer: stamp('c') });
      expect(state.future).toHaveLength(0);
    });

    it('is a no-op with empty history', () => {
      const state = empty();
      expect(editorReducer(state, { type: 'UNDO' })).toBe(state);
      expect(editorReducer(state, { type: 'REDO' })).toBe(state);
    });
  });

  describe('DUPLICATE_LAYER', () => {
    it('inserts an offset copy above the source and selects it', () => {
      const state = run(
        empty(),
        { type: 'ADD_LAYER', layer: stamp('a') },
        { type: 'ADD_LAYER', layer: stamp('b') },
        { type: 'DUPLICATE_LAYER', id: 'a', newId: 'a2' },
      );
      expect(state.doc.layers.map((l) => l.id)).toEqual(['a', 'a2', 'b']);
      const copy = state.doc.layers[1] as StampLayer;
      expect(copy.x).toBeGreaterThan(100);
      expect(copy.seed).not.toBe(1);
      expect(state.selectedId).toBe('a2');
    });
  });

  describe('REORDER_LAYER', () => {
    it('swaps with the neighbor and stops at the ends', () => {
      let state = run(
        empty(),
        { type: 'ADD_LAYER', layer: stamp('a') },
        { type: 'ADD_LAYER', layer: stamp('b') },
        { type: 'REORDER_LAYER', id: 'a', direction: 'forward' },
      );
      expect(state.doc.layers.map((l) => l.id)).toEqual(['b', 'a']);
      const unchanged = editorReducer(state, { type: 'REORDER_LAYER', id: 'a', direction: 'forward' });
      expect(unchanged).toBe(state);
      state = editorReducer(state, { type: 'REORDER_LAYER', id: 'a', direction: 'backward' });
      expect(state.doc.layers.map((l) => l.id)).toEqual(['a', 'b']);
    });
  });

  describe('REMOVE_LAYER', () => {
    it('removes the layer and clears its selection', () => {
      const state = run(empty(), { type: 'ADD_LAYER', layer: stamp('a') }, { type: 'REMOVE_LAYER', id: 'a' });
      expect(state.doc.layers).toHaveLength(0);
      expect(state.selectedId).toBeNull();
    });
  });

  describe('SET_HORIZON', () => {
    it('is undoable', () => {
      const state = run(empty(), { type: 'SET_HORIZON', y: 120, mergeKey: 'h' }, { type: 'SET_HORIZON', y: 140, mergeKey: 'h' });
      expect(state.doc.horizonY).toBe(140);
      expect(editorReducer(state, { type: 'UNDO' }).doc.horizonY).toBe(300);
    });
  });
});
