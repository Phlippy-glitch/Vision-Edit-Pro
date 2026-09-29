interface HorizonPanelProps {
  onReset: () => void;
}

export function HorizonPanel({ onReset }: HorizonPanelProps) {
  return (
    <div className="panel">
      <p className="hint">
        Drag on the photo to move the yellow <strong>horizon line</strong> to camera eye level — where distant ground
        would meet the sky (for a photo taken standing, usually around the middle of the house&apos;s first floor). The
        guide lines should run parallel to paths, driveways and edging. Lawn, pavers and mulch use this to shrink
        realistically into the distance, and plants resize as you drag them farther away.
      </p>
      <div className="button-row">
        <button className="btn" onClick={onReset}>
          Reset to default
        </button>
      </div>
    </div>
  );
}
