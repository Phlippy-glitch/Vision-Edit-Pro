import { useEffect, useState } from 'react';
import { EditorScreen } from './features/editor/EditorScreen';
import { HomeScreen } from './features/home/HomeScreen';

/**
 * Hash routing keeps the phone's back gesture working (editor → projects)
 * without a router dependency.
 */
function readRoute(): string | null {
  const match = window.location.hash.match(/^#\/design\/(.+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function App() {
  const [projectId, setProjectId] = useState(readRoute);

  useEffect(() => {
    const onHash = () => setProjectId(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (projectId) {
    return (
      <EditorScreen
        key={projectId}
        projectId={projectId}
        onExit={() => {
          if (window.history.length > 1 && window.history.state?.fromHome) window.history.back();
          else window.location.hash = '';
        }}
      />
    );
  }
  return (
    <HomeScreen
      onOpen={(id) => {
        window.history.pushState({ fromHome: true }, '', `#/design/${encodeURIComponent(id)}`);
        setProjectId(id);
      }}
    />
  );
}
