import { MATERIALS, materialThumbnail } from '../../../services/art/catalog';
import type { MaterialDef } from '../../../services/art/materials';
import type { Point } from '../../../types/Editor.types';
import { Icon } from '../../../components/Icon';
import { useProgressiveThumbnails } from './useProgressiveThumbnails';

interface SurfacePanelProps {
  draft: Point[] | null;
  draftMaterial: MaterialDef | null;
  onPick: (material: MaterialDef) => void;
  onUndoPoint: () => void;
  onCancel: () => void;
  onFinish: () => void;
}

const renderThumb = (m: MaterialDef) => materialThumbnail(m);
const GROUPS = [
  { id: 'ground', label: 'Ground & hardscape' },
  { id: 'wall', label: 'Walls & siding' },
] as const;

export function SurfacePanel({ draft, draftMaterial, onPick, onUndoPoint, onCancel, onFinish }: SurfacePanelProps) {
  const thumbs = useProgressiveThumbnails(MATERIALS, renderThumb);

  if (draft && draftMaterial) {
    return (
      <div className="panel">
        <div className="panel-title">
          <span className="swatch" style={{ background: draftMaterial.swatch }} />
          Outline the {draftMaterial.name.toLowerCase()} area
        </div>
        <p className="hint">
          Tap around the edge of the area to place points. Tap the first point (or Finish) to close the shape. Drag
          to pan, pinch to zoom for precise edges.
        </p>
        <div className="button-row">
          <button className="btn" onClick={onUndoPoint} disabled={draft.length === 0}>
            <Icon name="undo" size={18} /> Point
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onFinish} disabled={draft.length < 3}>
            <Icon name="check" size={18} /> Finish ({draft.length})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      {GROUPS.map((group) => (
        <section key={group.id}>
          <h3 className="section-label">{group.label}</h3>
          <div className="tile-grid">
            {MATERIALS.filter((m) => m.category === group.id).map((m) => (
              <button key={m.id} className="tile" onClick={() => onPick(m)}>
                <span className="tile-art" style={{ background: m.swatch }}>
                  {thumbs[m.id] && <img src={thumbs[m.id]} alt="" className="tile-cover" />}
                </span>
                <span className="tile-label">{m.name}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="hint">Pick a material, then outline where it goes: new lawn, a paver patio, mulch beds, siding…</p>
    </div>
  );
}
