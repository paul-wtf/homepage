import type { Localized } from './i18n';

export interface Project {
  name: string;
  description: Localized<string>;
  stack: string[];
  repoUrl: string;
  liveUrl?: string;
  featured?: boolean;
}

export const projects: Project[] = [
  {
    name: 'linkhop',
    description: {
      de: 'Music-Link-Converter zwischen Streaming-Diensten. Self-hosted Alternative zu Odesli/song.link, mit ISRC/UPC-Matching für Track-Treue statt fuzzy Metadaten. Postgres-persisted Short-Links, Redis-Cache, OpenAPI-Docs.',
      en: 'Converts music links between streaming services. A self-hosted alternative to Odesli/song.link that matches by ISRC and UPC, so it lands on the same recording where fuzzy metadata would only guess. Short links persisted in Postgres, a Redis cache, OpenAPI docs.'
    },
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
    description: {
      de: 'Self-hosted Hörstatistik für Tidal. Da Tidal keine History-API bietet, läuft tidalwave über Last.fm: pollt user.getRecentTracks und aggregiert Top-Artists/Tracks/Alben, Listening-Clock und Scrobble-Verlauf in Postgres. Die Insights-Seite zeigt Streaks, Rekorde, eine Heatmap, Entdeckungen und „An diesem Tag“. Multi-User von Tag eins, mit optionalen Read-only-Share-Links.',
      en: 'Self-hosted listening statistics for Tidal. Tidal has no history API, so tidalwave goes through Last.fm: it polls user.getRecentTracks and aggregates top artists, tracks and albums, a listening clock and the scrobble history in Postgres. The insights page shows streaks, records, a heatmap, discoveries and "On this day". Multi-user from day one, with optional read-only share links.'
    },
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
    description: {
      de: 'Custom-Plugins für Tidal Luna. „Link Copy“ für Spotify- und YouTube-Links direkt aus dem Tidal-Kontextmenü.',
      en: 'Custom plugins for Tidal Luna. "Link Copy" copies Spotify and YouTube links straight from the Tidal context menu.'
    },
    stack: ['TypeScript', 'esbuild', 'Tidal Luna API'],
    repoUrl: 'https://github.com/paul-wtf/luna-plugins'
  },
  {
    name: 'streamcontroller-tidal',
    description: {
      de: 'StreamController-Plugin für Tidal-Wiedergabesteuerung über die TidaLuna WebSocket-API. Play/Pause, Skip, Volume, Now-Playing.',
      en: 'StreamController plugin that controls Tidal playback through the TidaLuna WebSocket API. Play/pause, skip, volume, now playing.'
    },
    stack: ['Python', 'WebSockets', 'StreamController API'],
    repoUrl: 'https://github.com/paul-wtf/streamcontroller-tidal'
  },
  {
    name: 'rodecaster-volume-bridge',
    description: {
      de: 'Brücke vom RodeCaster-USB-MIDI-Fader zur Lautstärke des Musik-Players: Spotify über MPRIS/D-Bus oder Tidal über das TidalAPI-Plugin von TidaLuna, umschaltbar in der Config. Fader anlernen, als systemd-User-Service laufen lassen, und der Hardware-Regler steuert die Lautstärke.',
      en: "A bridge from the RodeCaster USB MIDI fader to the volume of the music player: Spotify over MPRIS/D-Bus or Tidal through TidaLuna's TidalAPI plugin, switchable in the config. Teach it the fader, run it as a systemd user service, and the hardware fader sets the volume."
    },
    stack: ['Python', 'ALSA MIDI', 'MPRIS/D-Bus', 'TidaLuna API', 'systemd'],
    repoUrl: 'https://github.com/paul-wtf/rodecaster-volume-bridge'
  },
  {
    name: 'System-Setup',
    description: {
      de: 'Mein Desktop als Code: deklarative NixOS-Konfiguration (Flakes, modular nach Hosts & Home-Manager) plus Dotfiles — Hyprland, Quickshell-Bar/Shell (QML), fish, kitty.',
      en: 'My desktop as code: a declarative NixOS configuration (flakes, split into hosts and Home Manager modules) plus the dotfiles for Hyprland, the Quickshell bar and shell (QML), fish and kitty.'
    },
    stack: ['Nix', 'NixOS', 'Flakes', 'Hyprland', 'Quickshell', 'fish'],
    repoUrl: 'https://github.com/paul-wtf/nixos'
  }
];
