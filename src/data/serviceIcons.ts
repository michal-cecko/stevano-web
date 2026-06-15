// Line-icon SVG inner markup per service (viewBox 0 0 24 24, stroke=currentColor).
export const SERVICE_ICONS: Record<string,string> = {
  hotel:   '<path d="M3 8v10M3 13h15a3 3 0 0 1 3 3v2M21 18v-2"/><path d="M3 18h18"/><path d="M7 13v-3h6v3"/>',
  rest:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6"/>',
  apt:     '<rect x="4" y="3" width="10" height="18" rx="1"/><path d="M14 8h6v13h-6"/><path d="M3 21h18"/><path d="M7 7h2M7 11h2M7 15h2"/>',
  kitchen: '<path d="M9 9h4v2H9z"/><path d="M9 9V5h3.5"/><path d="M13 6h3l1.2 2.4H13"/><rect x="8" y="11" width="7" height="10" rx="2"/>',
  machine: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  office:  '<circle cx="8" cy="12" r="3.4"/><path d="M11.4 12H21M18 12v3M15 12v2.4"/>',
};

// home-page service cards: order + which photo each uses
export const SERVICE_CARDS = [
  { key: 'hotel',   img: 'room' },
  { key: 'rest',    img: 'restaurant' },
  { key: 'apt',     img: 'lounge' },
  { key: 'kitchen', img: 'kitchen' },
  { key: 'office',  img: 'office' },
  { key: 'machine', img: 'corridor' },
];
