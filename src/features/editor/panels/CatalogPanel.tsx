import { useMemo, useRef } from 'react';
import { Icon } from '../../../components/Icon';
import { ASSET_CATEGORIES, type AssetCategory, type AssetDef } from '../../../services/art/assets.types';
import { ASSETS, assetThumbnail } from '../../../services/art/catalog';
import { useProgressiveThumbnails } from './useProgressiveThumbnails';

interface CatalogPanelProps {
  /** Owned by the editor so the choice survives the panel closing while an item is edited. */
  category: AssetCategory;
  onCategoryChange: (category: AssetCategory) => void;
  onPick: (asset: AssetDef) => void;
  /** The user's photo plants (the "My plants" category). */
  customAssets: readonly AssetDef[];
  onAddCustom: (file: File) => void;
  onDeleteCustom: (asset: AssetDef) => void;
}

const renderThumb = (asset: AssetDef) => assetThumbnail(asset);

export function CatalogPanel({ category, onCategoryChange, onPick, customAssets, onAddCustom, onDeleteCustom }: CatalogPanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const isMine = category === 'mine';
  const items = useMemo(() => (isMine ? [...customAssets] : ASSETS.filter((a) => a.category === category)), [category, customAssets, isMine]);
  const thumbs = useProgressiveThumbnails(items, renderThumb);

  return (
    <div className="panel">
      <div className="chips" role="tablist">
        {ASSET_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === category}
            className={`chip ${c.id === category ? 'chip-active' : ''}`}
            onClick={() => onCategoryChange(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="tile-grid">
        {isMine && (
          <button className="tile" onClick={() => fileInput.current?.click()}>
            <span className="tile-art tile-art-add">
              <Icon name="camera" size={28} />
            </span>
            <span className="tile-label">Add from photo</span>
          </button>
        )}
        {items.map((asset) => (
          <div key={asset.id} className="tile-wrap">
            <button className="tile" onClick={() => onPick(asset)}>
              <span className="tile-art tile-art-checker">
                {thumbs[asset.id] ? <img src={thumbs[asset.id]} alt="" /> : <span className="spinner" />}
              </span>
              <span className="tile-label">{asset.name}</span>
            </button>
            {isMine && (
              <button className="tile-delete" aria-label={`Delete ${asset.name}`} onClick={() => onDeleteCustom(asset)}>
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onAddCustom(file);
        }}
      />
      <p className="hint">
        {isMine
          ? 'Photograph plants from your own stock against a plain background (a wall, the sky, pavement) for the cleanest cut-out.'
          : 'Tap to add, then drag to place. Pinch or use the corner handle to resize.'}
      </p>
    </div>
  );
}
