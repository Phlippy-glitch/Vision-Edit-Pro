import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast, type ToastMessage } from '../../components/Toast';
import { DEFAULT_HORIZON_FRACTION } from '../../constants';
import { deleteProject, listProjects, saveProject } from '../../services/projectStore';
import type { Project } from '../../types/Editor.types';
import { createId } from '../../utils/id';
import { importPhoto } from '../../utils/image';

interface HomeScreenProps {
  onOpen: (projectId: string) => void;
}

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const created = URL.createObjectURL(blob);
    setUrl(created);
    return () => URL.revokeObjectURL(created);
  }, [blob]);
  return url;
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function HomeScreen({ onOpen }: HomeScreenProps) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);

  const notify = useCallback((text: string, tone: 'info' | 'error' = 'info') => setToast({ id: Date.now(), text, tone }), []);

  const refresh = useCallback(() => {
    listProjects()
      .then(setProjects)
      .catch((e: unknown) => {
        setProjects([]);
        notify(e instanceof Error ? e.message : 'Could not load projects.', 'error');
      });
  }, [notify]);

  useEffect(refresh, [refresh]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const { blob, width, height } = await importPhoto(file);
      const now = Date.now();
      const project: Project = {
        id: createId(),
        name: `Design ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(now)}`,
        clientName: '',
        createdAt: now,
        updatedAt: now,
        width,
        height,
        photo: blob,
        thumbnail: null,
        doc: { layers: [], horizonY: height * DEFAULT_HORIZON_FRACTION },
      };
      await saveProject(project);
      onOpen(project.id);
    } catch (e) {
      console.error('Photo import failed:', e);
      notify(e instanceof Error ? e.message : 'Could not open that photo.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const duplicate = async (project: Project) => {
    const now = Date.now();
    await saveProject({ ...project, id: createId(), name: `${project.name} (alt)`, createdAt: now, updatedAt: now });
    notify('Alternative design created — same photo, independent changes.');
    refresh();
  };

  const rename = async (project: Project) => {
    const name = window.prompt('Design name', project.name);
    if (!name?.trim()) return;
    await saveProject({ ...project, name: name.trim(), updatedAt: Date.now() });
    refresh();
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    await deleteProject(project.id);
    refresh();
  };

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="leaf" size={20} />
          </span>
          <div>
            <h1>Vision Edit Pro</h1>
            <p>Landscape design visualizer</p>
          </div>
        </div>
      </header>

      <section className="start">
        <button className="start-btn start-btn-primary" disabled={importing} onClick={() => cameraInput.current?.click()}>
          <Icon name="camera" size={28} />
          <span>Take photo</span>
        </button>
        <button className="start-btn" disabled={importing} onClick={() => libraryInput.current?.click()}>
          <Icon name="image" size={28} />
          <span>Choose photo</span>
        </button>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <input
          ref={libraryInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </section>
      {importing && (
        <p className="importing">
          <span className="spinner spinner-inline" /> Preparing photo…
        </p>
      )}

      <section className="projects">
        <h2>Designs</h2>
        {projects === null && <span className="spinner" />}
        {projects?.length === 0 && (
          <ol className="steps">
            <li>
              <strong>Photograph the property</strong> from where the client usually sees it — street view or back patio.
            </li>
            <li>
              <strong>Design on the photo:</strong> add trees and shrubs, lay new lawn, pavers or mulch beds, and remove
              what&apos;s going away.
            </li>
            <li>
              <strong>Show the client</strong> with a before/after slider, then text or email them the image.
            </li>
          </ol>
        )}
        <ul className="project-grid">
          {projects?.map((p) => (
            <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p.id)} onDuplicate={() => duplicate(p)} onRename={() => rename(p)} onDelete={() => remove(p)} />
          ))}
        </ul>
      </section>
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onOpen: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ProjectCard({ project, onOpen, onDuplicate, onRename, onDelete }: ProjectCardProps) {
  const url = useObjectUrl(project.thumbnail ?? project.photo);
  const [menuOpen, setMenuOpen] = useState(false);
  const changes = project.doc.layers.length;
  return (
    <li className="project-card">
      <button className="project-open" onClick={onOpen}>
        {url ? <img src={url} alt="" /> : <span className="project-placeholder" />}
        <span className="project-info">
          <strong>{project.name}</strong>
          {project.clientName && <span>{project.clientName}</span>}
          <small>
            {dateFormat.format(project.updatedAt)} · {changes} {changes === 1 ? 'change' : 'changes'}
          </small>
        </span>
      </button>
      <button className="icon-btn project-menu-btn" aria-label="More actions" onClick={() => setMenuOpen((o) => !o)}>
        <Icon name="more" />
      </button>
      {menuOpen && (
        <div className="menu" onClick={() => setMenuOpen(false)}>
          <button onClick={onDuplicate}>
            <Icon name="copy" size={18} /> Create alternative design
          </button>
          <button onClick={onRename}>
            <Icon name="edit" size={18} /> Rename
          </button>
          <button className="menu-danger" onClick={onDelete}>
            <Icon name="trash" size={18} /> Delete
          </button>
        </div>
      )}
    </li>
  );
}
