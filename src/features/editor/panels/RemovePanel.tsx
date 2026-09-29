import { Icon } from '../../../components/Icon';
import { Slider } from '../../../components/Slider';

interface RemovePanelProps {
  brushSize: number;
  onBrushSize: (size: number) => void;
  strokeCount: number;
  busy: boolean;
  canRetry: boolean;
  onClear: () => void;
  onRemove: () => void;
  onRetry: () => void;
}

export function RemovePanel({ brushSize, onBrushSize, strokeCount, busy, canRetry, onClear, onRemove, onRetry }: RemovePanelProps) {
  return (
    <div className="panel">
      <p className="hint">
        Paint over what you want gone — an old shrub, a dead patch, a hose, a sign. Cover it completely, including its
        shadow. Use two fingers to zoom.
      </p>
      <Slider label="Brush size" value={brushSize} min={8} max={90} step={1} format={(v) => `${v}px`} onChange={onBrushSize} />
      <div className="button-row">
        <button className="btn" onClick={onClear} disabled={strokeCount === 0 || busy}>
          Clear
        </button>
        {canRetry && (
          <button className="btn" onClick={onRetry} disabled={busy}>
            <Icon name="shuffle" size={18} /> Try another fill
          </button>
        )}
        <button className="btn btn-primary" onClick={onRemove} disabled={strokeCount === 0 || busy}>
          {busy ? <span className="spinner spinner-inline" /> : <Icon name="eraser" size={18} />}
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
