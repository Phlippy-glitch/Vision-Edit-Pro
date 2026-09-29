import { useMemo } from 'react';
import { ASSET_CATEGORIES, type AssetCategory, type AssetDef } from '../../../services/art/assets.types';
import { ASSETS, assetThumbnail } from '../../../services/art/catalog';
import { useProgressiveThumbnails } from './useProgressiveThumbnails';

interface CatalogPanelProps {
  /** Owned by the editor so the choice survives the panel closing while an item is edited. */
  category: AssetCategory;
  onCategoryChange: (category: AssetCategory) => void;
  onPick: (asset: AssetDef) => void;
}

const renderThumb = (asset: AssetDef) => assetThumbnail(asset);

export function CatalogPanel({ category, onCategoryChange, onPick }: CatalogPanelProps) {
  const items = useMemo(() => ASSETS.filter((a) => a.category === category), [category]);
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
        {items.map((asset) => (
          <button key={asset.id} className="tile" onClick={() => onPick(asset)}>
            <span className="tile-art tile-art-checker">
              {thumbs[asset.id] ? <img src={thumbs[asset.id]} alt="" /> : <span className="spinner" />}
            </span>
            <span className="tile-label">{asset.name}</span>
          </button>
        ))}
      </div>
      <p className="hint">Tap to add, then drag to place. Pinch or use the corner handle to resize.</p>
    </div>
  );
}
