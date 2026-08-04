import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceLogo = resolve(projectRoot, 'assets/mobile-home/logo-transparent.png');
const warmWhite = { r: 250, g: 248, b: 244, alpha: 1 };

async function buildIcon(relativePath, size, logoScale) {
  const output = resolve(projectRoot, relativePath);
  await mkdir(dirname(output), { recursive: true });

  const logo = await sharp(sourceLogo)
    .resize(Math.round(size * logoScale), Math.round(size * logoScale), {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
  const metadata = await sharp(logo).metadata();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: warmWhite,
    },
  })
    .composite([
      {
        input: logo,
        left: Math.round((size - metadata.width) / 2),
        top: Math.round((size - metadata.height) / 2),
      },
    ])
    .png()
    .toFile(output);
}

await Promise.all([
  buildIcon('assets/app/favicon-16.png', 16, 0.92),
  buildIcon('assets/app/favicon-32.png', 32, 0.9),
  buildIcon('assets/app/apple-touch-icon.png', 180, 0.82),
  buildIcon('assets/app/icon-192.png', 192, 0.82),
  buildIcon('assets/app/icon-512.png', 512, 0.82),
  buildIcon('assets/app/icon-maskable-512.png', 512, 0.68),
  buildIcon('assets/courier/icon-192.png', 192, 0.82),
  buildIcon('assets/courier/icon-512.png', 512, 0.82),
]);
