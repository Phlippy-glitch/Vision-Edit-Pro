import type { Dispatch } from 'react';
import { Icon } from '../../../components/Icon';
import { getMaterial } from '../../../services/art/materials';
import type { Layer } from '../../../types/Editor.types';
import type { EditorAction } from '../editorReducer';

interface LayersPanelProps {
  layers: readonly Layer[];
  selectedId: string | null;
  dispatch: Dispatch<EditorAction>;
}

function layerBadge(layer: Layer) {
  if (layer.kind === 'area') {
    return <span className="swatch" style={{ background: getMaterial(layer.materialId)?.swatch ?? '#888' }} />;
  }
  return <Icon name={layer.kind === 'stamp' ? 'leaf' : 'eraser'} size={18} />;
}

export function LayersPanel({ layers, selectedId, dispatch }: LayersPanelProps) {
  if (layers.length === 0) {
    return (
      <div className="panel">
        <p className="hint">Nothing added yet. Use Plants, Surfaces and Remove to build the design.</p>
      </div>
    );
  }
  // Top of the list is the front-most layer, like most design tools.
  const ordered = [...layers].reverse();
  return (
    <div className="panel">
      <ul className="layer-list">
        {ordered.map((layer, i) => (
          <li key={layer.id} className={`layer-row ${layer.id === selectedId ? 'layer-row-active' : ''}`}>
            <button className="layer-main" onClick={() => dispatch({ type: 'SELECT', id: layer.id })}>
              <span className="layer-badge">{layerBadge(layer)}</span>
              <span className={`layer-name ${layer.visible ? '' : 'layer-hidden'}`}>{layer.name}</span>
            </button>
            <button
              className="icon-btn"
              aria-label={layer.visible ? 'Hide' : 'Show'}
              onClick={() => dispatch({ type: 'UPDATE_LAYER', id: layer.id, changes: { visible: !layer.visible } })}
            >
              <Icon name={layer.visible ? 'eye' : 'eyeOff'} size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Bring forward"
              disabled={i === 0}
              onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'forward' })}
            >
              <Icon name="up" size={18} />
            </button>
            <button
              className="icon-btn"
              aria-label="Send backward"
              disabled={i === ordered.length - 1}
              onClick={() => dispatch({ type: 'REORDER_LAYER', id: layer.id, direction: 'backward' })}
            >
              <Icon name="down" size={18} />
            </button>
            <button className="icon-btn" aria-label="Delete" onClick={() => dispatch({ type: 'REMOVE_LAYER', id: layer.id })}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div className="button-row">
        <button
          className="btn btn-danger"
          onClick={() => {
            if (window.confirm('Remove every change from this design? You can undo this.')) dispatch({ type: 'CLEAR_ALL' });
          }}
        >
          Clear design
        </button>
      </div>
    </div>
  );
}
