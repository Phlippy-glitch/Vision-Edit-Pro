import { useId } from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Formats the value readout, e.g. as a percentage. */
  format?: (value: number) => string;
  onChange: (value: number) => void;
  /** Called once when the user finishes a drag, for undo grouping. */
  onCommit?: () => void;
}

export function Slider({ label, value, min, max, step = 0.01, format, onChange, onCommit }: SliderProps) {
  const id = useId();
  return (
    <div className="slider">
      <label htmlFor={id}>
        <span>{label}</span>
        <output>{format ? format(value) : value.toFixed(2)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
    </div>
  );
}

export const percent = (v: number) => `${Math.round(v * 100)}%`;
export const degrees = (v: number) => `${Math.round((v * 180) / Math.PI)}°`;
