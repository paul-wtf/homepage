import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pages = [
  { file: 'og-image.png', tagline: 'Elektrotechniker · Software-Engineering als Hobby' },
  { file: 'og-image-en.png', tagline: 'Electrical technician · Software engineering as a hobby' },
];

const W = 1200;
const H = 630;

// Miniatur des Zen-Desktops: Mantle-Bar + -Frame, Crust-Viewport mit
// konkaven Ecken, Firewatch-Ridgelines, Mocha-Palette. Farben aus
// src/styles/tokens.css.
const mono = "'JetBrains Mono', 'DejaVu Sans Mono', monospace";
const palette = ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'];

const svg = (tagline) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="#181825"/>
  <!-- Viewport mit konkaven Ecken -->
  <rect x="14" y="56" width="${W - 28}" height="${H - 70}" rx="18" fill="#11111b"/>
  <defs>
    <clipPath id="viewport">
      <rect x="14" y="56" width="${W - 28}" height="${H - 70}" rx="18"/>
    </clipPath>
  </defs>

  <!-- Bar -->
  <text x="40" y="38" font-family=${JSON.stringify(mono)} font-size="20" font-weight="700" fill="#cdd6f4">paul.wtf</text>
  <g font-family=${JSON.stringify(mono)} font-size="16">
    <rect x="880" y="14" width="26" height="28" rx="7" fill="#94e2d5"/>
    <text x="893" y="34" text-anchor="middle" fill="#11111b" font-weight="700">1</text>
    ${[2, 3, 4, 5, 6].map((n, i) => `<text x="${925 + i * 34}" y="34" text-anchor="middle" fill="#6c7086">${n}</text>`).join('')}
    <text x="1160" y="34" text-anchor="end" fill="#89dceb">21:37</text>
  </g>

  <g clip-path="url(#viewport)">
    <!-- Firewatch-Ridgelines -->
    <circle cx="890" cy="250" r="120" fill="#94e2d5" opacity="0.06"/>
    <circle cx="890" cy="250" r="80" fill="#94e2d5" opacity="0.08"/>
    <path d="M0 380 L140 320 L300 365 L470 290 L640 355 L820 300 L990 360 L1160 310 L1330 370 L1600 330 L1600 630 L0 630 Z" fill="#1c2030" opacity="0.6"/>
    <path d="M0 450 L180 390 L340 440 L520 375 L720 445 L900 390 L1090 450 L1280 400 L1600 445 L1600 630 L0 630 Z" fill="#181d29" opacity="0.85"/>
    <path d="M0 520 L200 465 L380 510 L580 455 L790 515 L1000 465 L1210 515 L1420 470 L1600 510 L1600 630 L0 630 Z" fill="#131622"/>
    <path d="M0 580 L240 535 L460 570 L700 530 L950 575 L1200 535 L1430 570 L1600 545 L1600 630 L0 630 Z" fill="#0d0d15"/>
  </g>

  <!-- Inhalt -->
  <text x="80" y="200" font-family=${JSON.stringify(mono)} font-size="24" fill="#94e2d5">paul@paul.wtf <tspan fill="#6c7086">:~</tspan></text>
  <text x="76" y="300" font-family=${JSON.stringify(mono)} font-size="84" font-weight="800" letter-spacing="-3" fill="#cdd6f4">Paul <tspan fill="#94e2d5">Reitmayer</tspan></text>
  <text x="80" y="360" font-family=${JSON.stringify(mono)} font-size="27" fill="#a6adc8">${tagline}</text>

  <!-- Mocha-Palette wie im fastfetch -->
  <g>
    ${palette.map((c, i) => `<rect x="${80 + i * 34}" y="420" width="24" height="24" rx="6" fill="${c}"/>`).join('')}
  </g>
</svg>
`;

for (const { file, tagline } of pages) {
  const out = resolve(__dirname, '..', 'public', file);
  await sharp(Buffer.from(svg(tagline))).png().toFile(out);
  console.log('Wrote', out);
}
