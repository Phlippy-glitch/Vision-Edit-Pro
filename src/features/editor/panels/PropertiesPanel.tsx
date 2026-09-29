import { useRef, type Dispatch } from 'react';
import { Icon } from '../../../components/Icon';
import { degrees, percent, Slider } from '../../../components/Slider';
import { getAsset, MATERIALS, materialThumbnail } from '../../../services/art/catalog';
import { getMaterial } from '../../../services/art/materials';
import type { AreaLayer, Layer, StampLayer } from '../../../types/Editor.types';
import { createId } from '../../../utils/id';
import { randomSeed } from '../../../utils/random';
import type { EditorAction } from '../editorReducer';
import { useProgressiveThumbnails } from './useProgressiveThumbnails';
import type { MaterialDef } from '../../../services/art/materials';

const smallMaterialThumb = (m: MaterialDef) => materialThumbnail(m, 56);

interface PropertiesPanelProps {
  layer: Layer;
  imageWidth: number;
  imageHeight: number;
  /** Photo-measured ground area of the selected surface, if it has one. */
  measuredAreaSqFt?: number;
  dispatch: Dispatch<EditorAction>;
  onDone: () => void;
}

/**
 * Slider edits coalesce into one undo step per drag: the merge key changes
 * each time a drag ends.
 */
function useSliderUpdates(layer: Layer, dispatch: Dispatch<EditorAction>) {
  const session = useRef(0);
  const update = (field: string, changes: Partial<Layer>) =>
    dispatch({ type: 'UPDATE_LAYER', id: layer.id, changes, mergeKey: `${layer.id}:${field}:${session.current}` });
  const commit = () => {
    session.current++;
  };
  return { update, commit };
}

export function PropertiesPanel({ layer, imageWidth, imageHeight, measuredAreaSqFt, dispatch, onDone }: PropertiesPanelProps) {
  const { update, commit } = useSliderUpdates(layer, dispatch);
  const set = (changes: Partial<Layer>) => dispatch({ type: 'UPDATE_LAYER', id: layer.id, changes });

  return (
    <div className="panel">
      <div className="panel-title">
        <span className="panel-title-text">{layer.name}</span>
        <button className="btn btn-small btn-primary" onClick={onDone}>
          <Icon name="check" size={16} /> Done
        </button>
      </div>

      {layer.kind === 'stamp' && (
        <StampControls layer={layer} imageHeight={imageHeight} update={update} commit={commit} set={set} />
      )}
      {layer.kind === 'area' && (
        <AreaControls layer={layer} imageWidth={imageWidth} measuredAreaSqFt={measuredAreaSqFt} update={update} commit={commit} set={set} />
      )}
      {layer.kind === 'removal' && <p className="hint">Removed area. Hide it in Layers to compare, or delete it to undo the removal.</p>}

      <Slider label="Opacity" value={layer.opacity} min={0.1} max={1} format={percent} onChange={(v) => update('opacity', { opacity: v })} onCommit={commit} />

      <div className="button-row">
        {layer.kind !== 'removal' && (
          <button className="btn" onClick={() => dispatch({ type: 'DUPLICATE_LAYER', id: layer.id, newId: createId() })}>
            <Icon name="copy" size={18} /> Duplicate
          </button>
        )}
        <button className="btn" onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'forward' })}>
          <Icon name="up" size={18} /> Front
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'backward' })}>
          <Icon name="down" size={18} /> Back
        </button>
        <button className="btn btn-danger" onClick={() => dispatch({ type: 'REMOVE_LAYER', id: layer.id })}>
          <Icon name="trash" size={18} /> Delete
        </button>
      </div>
    </div>
  );
}

interface ControlsProps<T extends Layer> {
  layer: T;
  update: (field: string, changes: Partial<Layer>) => void;
  commit: () => void;
  set: (changes: Partial<Layer>) => void;
}

function StampControls({ layer, imageHeight, update, commit, set }: ControlsProps<StampLayer> & { imageHeight: number }) {
  const asset = getAsset(layer.assetId);
  return (
    <>
      {asset?.colors && (
        <div className="swatch-row" role="radiogroup" aria-label="Color">
          {asset.colors.map((c) => (
            <button
              key={c.value}
              role="radio"
              aria-checked={(layer.color ?? asset.colors![0].value) === c.value}
              className={`swatch-btn ${(layer.color ?? asset.colors![0].value) === c.value ? 'swatch-btn-active' : ''}`}
              onClick={() => set({ color: c.value })}
              title={c.label}
            >
              <span className="swatch" style={{ background: c.value === 'mixed' ? 'conic-gradient(#e8364a, #f6c12a, #8b5cc7, #e85da8, #e8364a)' : c.value }} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>
      )}
      <Slider
        label="Size"
        value={layer.height / imageHeight}
        min={0.01}
        max={1.2}
        step={0.005}
        format={percent}
        onChange={(v) => update('height', { height: v * imageHeight })}
        onCommit={commit}
      />
      <Slider label="Rotation" value={layer.rotation} min={-Math.PI / 4} max={Math.PI / 4} format={degrees} onChange={(v) => update('rotation', { rotation: v })} onCommit={commit} />
      <Slider label="Brightness" value={layer.brightness} min={0.5} max={1.5} step={0.05} format={percent} onChange={(v) => update('brightness', { brightness: v })} onCommit={commit} />
      <div className="button-row">
        {!asset?.isPhoto && (
          <button className="btn" onClick={() => set({ seed: randomSeed() })}>
            <Icon name="shuffle" size={18} /> New look
          </button>
        )}
        <button className={`btn ${layer.flipX ? 'btn-on' : ''}`} onClick={() => set({ flipX: !layer.flipX })}>
          <Icon name="flip" size={18} /> Flip
        </button>
        {asset?.groundShadow && (
          <button className={`btn ${layer.shadow ? 'btn-on' : ''}`} onClick={() => set({ shadow: !layer.shadow })}>
            Shadow {layer.shadow ? 'on' : 'off'}
          </button>
        )}
      </div>
    </>
  );
}

function AreaControls({
  layer,
  imageWidth,
  measuredAreaSqFt,
  update,
  commit,
  set,
}: ControlsProps<AreaLayer> & { imageWidth: number; measuredAreaSqFt?: number }) {
  const material = getMaterial(layer.materialId);
  const thumbs = useProgressiveThumbnails(MATERIALS, smallMaterialThumb);
  return (
    <>
      <div className="material-strip">
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            className={`material-chip ${m.id === layer.materialId ? 'material-chip-active' : ''}`}
            onClick={() => set({ materialId: m.id, name: m.name, perspective: m.perspective, shading: m.shading, tileSize: m.defaultTile * imageWidth })}
            title={m.name}
          >
            <span className="material-chip-art" style={{ background: m.swatch }}>
              {thumbs[m.id] && <img src={thumbs[m.id]} alt="" />}
            </span>
            <span>{m.name}</span>
          </button>
        ))}
      </div>
      <p className="hint">Drag the points to fit edges exactly. Tap + to add a point, double-tap a point to delete it.</p>
      <label className="area-field">
        <span>Area for estimate</span>
        <input
          className="num-input"
          type="number"
          inputMode="decimal"
          min={0}
          placeholder={measuredAreaSqFt !== undefined ? `≈ ${Math.round(measuredAreaSqFt)}` : 'enter'}
          value={layer.areaOverrideSqFt ?? ''}
          onChange={(e) => {
            const value = Number(e.target.value);
            set({ areaOverrideSqFt: e.target.value === '' || !Number.isFinite(value) ? undefined : Math.max(0, value) });
          }}
        />
        <span>sq ft</span>
      </label>
      {layer.areaOverrideSqFt === undefined && measuredAreaSqFt === undefined && (
        <p className="hint">Walls can&apos;t be measured from the photo — type the area to include it in the estimate.</p>
      )}
      <Slider
        label="Pattern size"
        value={layer.tileSize / imageWidth}
        min={0.02}
        max={0.6}
        step={0.005}
        format={percent}
        onChange={(v) => update('tile', { tileSize: v * imageWidth })}
        onCommit={commit}
      />
      <Slider label="Pattern angle" value={layer.textureAngle} min={-Math.PI / 2} max={Math.PI / 2} format={degrees} onChange={(v) => update('angle', { textureAngle: v })} onCommit={commit} />
      <Slider label="Keep photo shadows" value={layer.shading} min={0} max={1} format={percent} onChange={(v) => update('shading', { shading: v })} onCommit={commit} />
      <Slider label="Brightness" value={layer.brightness} min={0.5} max={1.5} step={0.02} format={percent} onChange={(v) => update('brightness', { brightness: v })} onCommit={commit} />
      <Slider
        label="Edge softness"
        value={layer.feather / imageWidth}
        min={0}
        max={0.02}
        step={0.0005}
        format={(v) => `${Math.round(v * imageWidth)}px`}
        onChange={(v) => update('feather', { feather: v * imageWidth })}
        onCommit={commit}
      />
      <div className="button-row">
        <button className={`btn ${layer.perspective ? 'btn-on' : ''}`} onClick={() => set({ perspective: !layer.perspective })}>
          <Icon name="horizon" size={18} /> {layer.perspective ? 'Ground perspective' : 'Flat (wall)'}
        </button>
        {material && material.perspective !== layer.perspective && <span className="hint">Default for {material.name}: {material.perspective ? 'ground' : 'flat'}</span>}
      </div>
    </>
  );
}
