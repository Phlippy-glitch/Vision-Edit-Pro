import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { Slider } from '../../../components/Slider';

const PRESETS = [
  'Xeriscape with decomposed granite, boulders, agave and ornamental grasses',
  'Fresh dark mulch bed with flowering perennials and boxwoods',
  'Natural flagstone patio with tight joints',
  'Lush, freshly mowed green lawn',
  'Native pollinator garden with coneflowers, black-eyed susans and salvia',
  'Remove what is there and fill naturally with the surroundings',
];

interface AiPanelProps {
  brushSize: number;
  onBrushSize: (size: number) => void;
  strokeCount: number;
  busy: boolean;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onClear: () => void;
  canRetry: boolean;
  onRetry: () => void;
  accessCode: string;
  onAccessCodeChange: (code: string) => void;
  /** Open the settings, e.g. after the server rejected the access code. */
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
}

export function AiPanel(props: AiPanelProps) {
  const { brushSize, onBrushSize, strokeCount, busy, prompt, onPromptChange, onGenerate, onCancel, onClear, canRetry, onRetry } = props;
  const [showPresets, setShowPresets] = useState(prompt === '');

  if (busy) {
    return (
      <div className="panel ai-busy">
        <span className="spinner" />
        <p>
          Designing “{prompt}”…
          <br />
          <small>This usually takes 15–60 seconds.</small>
        </p>
        <button className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <p className="hint">
        1. Paint the area to redesign. 2. Describe what should be there. The AI only changes what you paint, and
        the result is a layer you can hide, undo or try again.
      </p>
      <Slider label="Brush size" value={brushSize} min={8} max={90} step={1} format={(v) => `${v}px`} onChange={onBrushSize} />
      <label className="field">
        <span>What should go there?</span>
        <textarea
          className="ai-prompt"
          rows={2}
          maxLength={800}
          value={prompt}
          placeholder="e.g. river rock dry creek bed with native grasses"
          onChange={(e) => onPromptChange(e.target.value)}
        />
      </label>
      <button className="link-btn" onClick={() => setShowPresets((s) => !s)}>
        {showPresets ? 'Hide ideas' : 'Show ideas'}
      </button>
      {showPresets && (
        <div className="preset-list">
          {PRESETS.map((p) => (
            <button key={p} className="chip preset-chip" onClick={() => onPromptChange(p)}>
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="button-row">
        <button className="btn" onClick={onClear} disabled={strokeCount === 0}>
          Clear
        </button>
        {canRetry && (
          <button className="btn" onClick={onRetry}>
            <Icon name="shuffle" size={18} /> Try again
          </button>
        )}
        <button className="btn btn-primary" onClick={onGenerate} disabled={strokeCount === 0 || !prompt.trim()}>
          <Icon name="sparkle" size={18} /> Generate
        </button>
      </div>
      <p className="hint ai-privacy">
        The painted part of the photo (with some surroundings) is sent to OpenAI to generate the design. Each
        generation has a small cost on your OpenAI account.
      </p>
      <button className="link-btn" onClick={() => props.onSettingsOpenChange(!props.settingsOpen)}>
        AI settings
      </button>
      {props.settingsOpen && (
        <label className="field">
          <span>Access code (from whoever set up the AI server)</span>
          <input type="password" autoComplete="off" value={props.accessCode} onChange={(e) => props.onAccessCodeChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}
