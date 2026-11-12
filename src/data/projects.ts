export interface Project {
  name: string;
  description: string;
  stack: string[];
  repoUrl: string;
  liveUrl?: string;
  featured?: boolean;
}

export const projects: Project[] = [
  {
    name: 'linkhop',
    description:
      'Music-Link-Converter zwischen Streaming-Diensten. Self-hosted Alternative zu Odesli/song.link, mit ISRC/UPC-Matching für Track-Treue statt fuzzy Metadaten. Postgres-persisted Short-Links, Redis-Cache, OpenAPI-Docs.',
    stack: [
      'SvelteKit',
      'TypeScript',
      'FastAPI',
      'Python',
      'Postgres',
      'Redis',
      'Docker',
      'FluxCD',
      'RKE2'
    ],
    repoUrl: 'https://github.com/paul-wtf/linkhop',
    liveUrl: 'https://linkhop.paul.wtf',
    featured: true
  },
  {
    name: 'tidalwave',
    description:
      'Self-hosted Hörstatistik für Tidal. Da Tidal keine History-API bietet, läuft tidalwave über Last.fm: pollt user.getRecentTracks und aggregiert Top-Artists/Tracks/Alben, Listening-Clock und Scrobble-Verlauf in Postgres. Die Insights-Seite zeigt Streaks, Rekorde, eine Heatmap, Entdeckungen und „An diesem Tag“. Multi-User von Tag eins, mit optionalen Read-only-Share-Links.',
    stack: [
      'SvelteKit',
      'TypeScript',
      'FastAPI',
      'Python',
      'Postgres',
      'Helm',
      'FluxCD',
      'RKE2'
    ],
    repoUrl: 'https://github.com/paul-wtf/tidalwave',
    liveUrl: 'https://tidalwave.paul.wtf',
    featured: true
  },
  {
    name: 'luna-plugins',
    description:
      'Custom-Plugins für Tidal Luna. „Link Copy“ für Spotify- und YouTube-Links direkt aus dem Tidal-Kontextmenü.',
    stack: ['TypeScript', 'esbuild', 'Tidal Luna API'],
    repoUrl: 'https://github.com/paul-wtf/luna-plugins'
  },
  {
    name: 'streamcontroller-tidal',
    description:
      'StreamController-Plugin für Tidal-Wiedergabesteuerung über die TidaLuna WebSocket-API. Play/Pause, Skip, Volume, Now-Playing.',
    stack: ['Python', 'WebSockets', 'StreamController API'],
    repoUrl: 'https://github.com/paul-wtf/streamcontroller-tidal'
  },
  {
    name: 'rodecaster-volume-bridge',
    description:
      'Brücke vom RodeCaster-USB-MIDI-Fader zur Lautstärke des Musik-Players: Spotify über MPRIS/D-Bus oder Tidal über das TidalAPI-Plugin von TidaLuna, umschaltbar in der Config. Fader anlernen, als systemd-User-Service laufen lassen, und der Hardware-Regler steuert die Lautstärke.',
    stack: ['Python', 'ALSA MIDI', 'MPRIS/D-Bus', 'TidaLuna API', 'systemd'],
    repoUrl: 'https://github.com/paul-wtf/rodecaster-volume-bridge'
  },
  {
    name: 'System-Setup',
    description:
      'Mein Desktop als Code: deklarative NixOS-Konfiguration (Flakes, modular nach Hosts & Home-Manager) plus Dotfiles — Hyprland, Quickshell-Bar/Shell (QML), fish, kitty.',
    stack: ['Nix', 'NixOS', 'Flakes', 'Hyprland', 'Quickshell', 'fish'],
    repoUrl: 'https://github.com/paul-wtf/nixos'
  }
];
