import { useEffect, useState } from 'react';

/**
 * Generates thumbnails one per frame so opening a catalog never freezes
 * the UI while procedural artwork renders for the first time.
 */
export function useProgressiveThumbnails<T extends { id: string }>(
  items: readonly T[],
  render: (item: T) => string,
): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    let index = 0;
    let timer = 0;
    const step = () => {
      if (cancelled || index >= items.length) return;
      const item = items[index++];
      const url = render(item);
      setUrls((prev) => (prev[item.id] === url ? prev : { ...prev, [item.id]: url }));
      timer = window.setTimeout(step, 0);
    };
    timer = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [items, render]);

  return urls;
}
