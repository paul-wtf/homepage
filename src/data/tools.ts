export interface Tool {
  label: string;
  value: string;
}

export const tools: Tool[] = [
  { label: 'OS',        value: 'NixOS' },
  { label: 'WM',        value: 'Hyprland' },
  { label: 'Bar/Shell', value: 'Quickshell' },
  { label: 'Shell',     value: 'fish' },
  { label: 'Editor',    value: 'Vim' },
  { label: 'Terminal',  value: 'kitty' },
  { label: 'Browser',   value: 'Brave' },
  { label: 'Music',     value: 'Tidal' }
];

export const palette = [
  '#45475a', '#f38ba8', '#a6e3a1', '#f9e2af',
  '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'
];
