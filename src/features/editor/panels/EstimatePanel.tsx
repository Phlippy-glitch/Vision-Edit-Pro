import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { formatMoney, type Estimate, type EstimateSettings } from '../../../services/estimate';

interface EstimatePanelProps {
  estimate: Estimate;
  settings: EstimateSettings;
  onPriceChange: (priceKey: string, price: number) => void;
  onSettingsChange: (settings: EstimateSettings) => void;
  onCopy: () => void;
}

function NumberField({ value, onChange, label, step = 1 }: { value: number; onChange: (v: number) => void; label: string; step?: number }) {
  // Keep the raw text while typing so "1." or an empty field don't snap back.
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  return (
    <input
      className="num-input"
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      aria-label={label}
      value={focused ? text : String(value)}
      onFocus={() => {
        setText(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setText(e.target.value);
        const parsed = Number(e.target.value);
        if (e.target.value !== '' && Number.isFinite(parsed) && parsed >= 0) onChange(parsed);
      }}
    />
  );
}

export function EstimatePanel({ estimate, settings, onPriceChange, onSettingsChange, onCopy }: EstimatePanelProps) {
  if (estimate.lines.length === 0) {
    return (
      <div className="panel">
        <p className="hint">Add plants, surfaces or removals and they&apos;ll be listed here with prices.</p>
      </div>
    );
  }
  const hasEstimated = estimate.lines.some((l) => l.estimated && l.unit === 'sq ft');
  return (
    <div className="panel">
      <ul className="estimate-list">
        {estimate.lines.map((line) => (
          <li key={line.key} className="estimate-row">
            <div className="estimate-label">
              <strong>{line.label}</strong>
              <small>
                {line.estimated && line.unit === 'sq ft' ? '≈ ' : ''}
                {line.quantity.toLocaleString()} {line.unit === 'each' ? '×' : 'sq ft ×'}
                {line.detail && <> · {line.detail}</>}
              </small>
            </div>
            <label className="estimate-price">
              $
              <NumberField
                label={`${line.label} unit price`}
                value={line.unitPrice}
                step={line.unit === 'sq ft' ? 0.25 : 5}
                onChange={(price) => onPriceChange(line.priceKey, price)}
              />
            </label>
            <span className="estimate-total">{formatMoney(line.total)}</span>
          </li>
        ))}
      </ul>
      <div className="estimate-sum">
        <span>Subtotal</span>
        <span>{formatMoney(estimate.subtotal)}</span>
      </div>
      {settings.taxRate > 0 && (
        <div className="estimate-sum">
          <span>Tax ({settings.taxRate}%)</span>
          <span>{formatMoney(estimate.tax)}</span>
        </div>
      )}
      <div className="estimate-sum estimate-grand">
        <span>Estimated total</span>
        <span>{formatMoney(estimate.total)}</span>
      </div>
      {hasEstimated && (
        <p className="hint">
          ≈ Areas are measured from the photo (assumes it was taken standing, camera about {settings.cameraHeightFt} ft up,
          with the horizon set in Perspective). Accuracy is roughly ±25%. Type exact areas on a surface to override.
        </p>
      )}
      <div className="estimate-settings">
        <label>
          Tax %
          <NumberField label="Tax percent" value={settings.taxRate} step={0.25} onChange={(taxRate) => onSettingsChange({ ...settings, taxRate })} />
        </label>
        <label>
          Camera height ft
          <NumberField
            label="Camera height in feet"
            value={settings.cameraHeightFt}
            step={0.5}
            onChange={(cameraHeightFt) => cameraHeightFt > 0 && onSettingsChange({ ...settings, cameraHeightFt })}
          />
        </label>
      </div>
      <div className="button-row">
        <button className="btn" onClick={onCopy}>
          <Icon name="copy" size={18} /> Copy as text
        </button>
      </div>
      <p className="hint">Prices you edit are remembered on this phone for future estimates.</p>
    </div>
  );
}
