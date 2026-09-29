import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  text: string;
  tone?: 'info' | 'error';
}

interface ToastProps {
  message: ToastMessage | null;
  onDismiss: () => void;
}

const TOAST_DURATION_MS = 3800;

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className={`toast ${message.tone === 'error' ? 'toast-error' : ''}`} role="status" onClick={onDismiss}>
      {message.text}
    </div>
  );
}
