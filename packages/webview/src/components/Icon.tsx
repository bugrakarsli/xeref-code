export type IconName =
  | 'check'
  | 'plug'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'plus'
  | 'file'
  | 'lock'
  | 'send'
  | 'trash'
  | 'search'
  | 'refresh'
  | 'bolt'
  | 'shield';

/** 16x16 stroke icons drawn with currentColor. Inline SVG, so there is no font to load under the webview CSP. */
const PATHS: Record<IconName, string> = {
  check: 'M3.5 8.5l3 3 6-7',
  plug: 'M6 2v3M10 2v3M4.5 5h7v3a3.5 3.5 0 0 1-7 0V5zM8 11.5V14',
  'chevron-down': 'M4 6l4 4 4-4',
  'chevron-right': 'M6 4l4 4-4 4',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  file: 'M4 2h5l3 3v9H4V2zM9 2v3h3',
  lock: 'M4.5 7h7v6h-7V7zM6 7V5a2 2 0 0 1 4 0v2',
  send: 'M8 13V3M4 7l4-4 4 4',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5',
  search: 'M7 11.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM10.5 10.5L14 14',
  refresh: 'M13 8a5 5 0 1 1-1.5-3.5M13 2.5v3h-3',
  bolt: 'M9 2L4 9h4l-1 5 5-7H8l1-5z',
  shield: 'M8 2l5 2v4c0 3-2.5 5-5 6-2.5-1-5-3-5-6V4l5-2z',
};

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** The Xeref chevron-X mark (same geometry as media/xeref.svg). */
export function XerefMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4L10 12L4 20" />
        <path d="M9 4L15 12L9 20" />
        <path d="M20 4L14 12L20 20" />
      </g>
    </svg>
  );
}
