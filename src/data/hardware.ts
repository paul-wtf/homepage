import type { Localized } from './i18n';

export interface HardwareCategory {
  label: string;
  items: string[];
}

export const workstation: HardwareCategory[] = [
  {
    label: 'Compute',
    items: [
      'AMD Ryzen 9 9950X3D',
      'MSI GeForce RTX 4090 Gaming X Trio',
      '96 GB Kingston Fury Renegade DDR5-6000 CL32',
      'Crucial T700 1 TB NVMe',
      'Crucial P310 4 TB NVMe'
    ]
  },
  {
    label: 'Peripherals',
    items: [
      'Keychron Q1 Max',
      'Logitech G Pro X Superlight 2 Lightspeed'
    ]
  },
  {
    label: 'Displays',
    items: [
      'Alienware AW3225QF',
      'Alienware AW3425DWF',
      'Corsair Xeneon Edge'
    ]
  },
  {
    label: 'Audio',
    items: [
      'Punch Audio Martilo',
      'Kiwi Ears x B_Media: Chorus',
      'FiiO KA17',
      'Fosi Audio ZH3',
      'Rodecaster Duo 2',
      'Shure SM7B'
    ]
  }
];

export const laptop: string =
  'MacBook Pro 14,2" (M4 Pro) · 12-core CPU / 16-core GPU · 24 GB RAM · 512 GB SSD';

export interface Server {
  hostingNote: string;
  lines: string[];
}

export const server: Localized<Server> = {
  de: {
    hostingNote: 'Hosted bei TubeHosting',
    lines: [
      'Ryzen 9 7950X3D · 192 GB RAM',
      '2× 512 GB NVMe (RAID 1, Proxmox-Boot)',
      '2× 4 TB NVMe (RAID 1, VM-Storage)',
      '4× 16 TB HDD (RAID 10, Bulk-Storage)',
      'Uplink: 2× 10 GbE LACP-Bond'
    ]
  },
  en: {
    hostingNote: 'Hosted at TubeHosting',
    lines: [
      'Ryzen 9 7950X3D · 192 GB RAM',
      '2× 512 GB NVMe (RAID 1, Proxmox boot)',
      '2× 4 TB NVMe (RAID 1, VM storage)',
      '4× 16 TB HDD (RAID 10, bulk storage)',
      'Uplink: 2× 10 GbE LACP bond'
    ]
  }
};
