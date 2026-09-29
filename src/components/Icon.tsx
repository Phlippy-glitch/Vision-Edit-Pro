const PATHS = {
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5a1.5 1.5 0 1 0 0-.01',
  back: 'M15 5l-7 7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  compare: 'M12 3v18M5 6h4v12H5zM15 6h4v12h-4z',
  share: 'M12 15V3M8 7l4-4 4 4M5 12v8h14v-8',
  tree: 'M12 22v-6M12 2a6 6 0 0 0-6 6 5 5 0 0 0 1 3 4 4 0 0 0 5 5 4 4 0 0 0 5-5 5 5 0 0 0 1-3 6 6 0 0 0-6-6z',
  surface: 'M3 20l4-12h10l4 12zM5.5 14h13M12 8v12M8 20l2-12M16 20l-2-12',
  eraser: 'M16 3l5 5-11 11H5l-2-2 13-14zM9 8l6 6M10 19h11',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5',
  horizon: 'M2 12h20M12 12L4 21M12 12l8 9M12 12v9M7 16.5h10',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 5.4-1.6',
  flip: 'M12 3v18M9 7L4 17h5zM15 7l5 10h-5z',
  shuffle: 'M3 7h4l10 10h4M17 3l4 4-4 4M3 17h4l3-3M14 10l3-3h4M17 21l4-4-4-4',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4 12l5 5L20 6',
  plus: 'M12 5v14M5 12h14',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  leaf:'M5 19C5 9 11 4 20 4c0 9-5 15-15 15zM5 19l8-8',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 22 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.2 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
