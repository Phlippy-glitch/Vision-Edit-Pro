import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { exportFilename, renderExport, shareOrDownload, type ExportMode } from '../../services/exporter';
import type { SceneRenderer } from '../../services/renderer';
import type { DesignDoc } from '../../types/Editor.types';

const COMPANY_KEY = 'vep.companyName';

function readCompany(): string {
  try {
    return localStorage.getItem(COMPANY_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeCompany(value: string) {
  try {
    localStorage.setItem(COMPANY_KEY, value);
  } catch {
    // Storage may be unavailable (private mode); the name just won't persist.
  }
}

interface ExportSheetProps {
  renderer: SceneRenderer;
  doc: DesignDoc;
  name: string;
  clientName: string;
  onDetailsChange: (details: { name: string; clientName: string }) => void;
  onClose: () => void;
  onMessage: (text: string, tone?: 'info' | 'error') => void;
}

export function ExportSheet({ renderer, doc, name, clientName, onDetailsChange, onClose, onMessage }: ExportSheetProps) {
  const [company, setCompany] = useState(readCompany);
  const [busy, setBusy] = useState<ExportMode | null>(null);
  // Mobile Safari only opens the share sheet right after a tap, so images are
  // rendered ahead of time and shared without awaiting anything first.
  const prepared = useRef(new Map<string, Blob>());
  const keyFor = (mode: ExportMode) => (mode === 'after' ? 'after' : JSON.stringify([name, clientName, company.trim()]));
  const render = (mode: ExportMode) =>
    renderExport(renderer, doc, { name, clientName }, mode, { companyName: company.trim() });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const mode of ['before-after', 'after'] as const) {
        const key = keyFor(mode);
        if (prepared.current.has(key)) continue;
        try {
          const blob = await render(mode);
          if (!cancelled) prepared.current.set(key, blob);
        } catch {
          // Rendering is retried on demand when the user taps.
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, clientName, company]);

  const exportImage = async (mode: ExportMode) => {
    setBusy(mode);
    try {
      const blob = prepared.current.get(keyFor(mode)) ?? (await render(mode));
      const outcome = await shareOrDownload(blob, exportFilename(name, mode), name);
      if (outcome === 'downloaded') onMessage('Image saved to your downloads.');
    } catch (error) {
      console.error('Export failed:', error);
      onMessage('Could not create the image. Please try again.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Share design" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h2>Share with your client</h2>
        <label className="field">
          <span>Design name</span>
          <input value={name} onChange={(e) => onDetailsChange({ name: e.target.value, clientName })} />
        </label>
        <label className="field">
          <span>Client / property</span>
          <input
            value={clientName}
            placeholder="e.g. Smith residence, 42 Oak St"
            onChange={(e) => onDetailsChange({ name, clientName: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Your company (shown on before/after)</span>
          <input
            value={company}
            placeholder="e.g. GreenScape Landscaping"
            onChange={(e) => {
              setCompany(e.target.value);
              writeCompany(e.target.value);
            }}
          />
        </label>
        <div className="sheet-actions">
          <button className="btn btn-primary btn-large" disabled={busy !== null} onClick={() => exportImage('before-after')}>
            {busy === 'before-after' ? <span className="spinner spinner-inline" /> : <Icon name="compare" size={18} />}
            Before &amp; after image
          </button>
          <button className="btn btn-large" disabled={busy !== null} onClick={() => exportImage('after')}>
            {busy === 'after' ? <span className="spinner spinner-inline" /> : <Icon name="share" size={18} />}
            Proposed design only
          </button>
        </div>
        <p className="hint">Opens your phone&apos;s share sheet so you can text, email or AirDrop the image.</p>
      </div>
    </div>
  );
}
