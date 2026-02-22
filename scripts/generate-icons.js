#!/usr/bin/env node
// ============================================================
// generate-icons.js — Rasterize icon.svg into PNGs + .icns
// Usage: node scripts/generate-icons.js
// ============================================================

import sharp from 'sharp';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, '..');

const svgPath = join(root, 'resources', 'icon.svg');
const iconsetDir = join(root, 'build', 'icon.iconset');
const buildDir = join(root, 'build');
const resourcesDir = join(root, 'resources');

// macOS iconutil expects these exact filenames
const iconsetSizes = [
  { name: 'icon_16x16.png', size: 16 },
  { name: 'icon_16x16@2x.png', size: 32 },
  { name: 'icon_32x32.png', size: 32 },
  { name: 'icon_32x32@2x.png', size: 64 },
  { name: 'icon_128x128.png', size: 128 },
  { name: 'icon_128x128@2x.png', size: 256 },
  { name: 'icon_256x256.png', size: 256 },
  { name: 'icon_256x256@2x.png', size: 512 },
  { name: 'icon_512x512.png', size: 512 },
  { name: 'icon_512x512@2x.png', size: 1024 },
];

async function main() {
  const svgBuffer = readFileSync(svgPath);

  // Ensure output directories exist
  for (const dir of [iconsetDir, buildDir, resourcesDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  console.log('Generating icon PNGs from SVG...');

  // Generate iconset PNGs for macOS .icns
  for (const { name, size } of iconsetSizes) {
    const outPath = join(iconsetDir, name);
    await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
    console.log(`  ${name} (${size}x${size})`);
  }

  // Generate resources/icon.png (512px) for dev-mode dock icon
  const iconPng = join(resourcesDir, 'icon.png');
  await sharp(svgBuffer).resize(512, 512).png().toFile(iconPng);
  console.log(`  resources/icon.png (512x512)`);

  // Generate tray icons (template images for macOS menu bar)
  const tray1x = join(resourcesDir, 'tray-icon.png');
  const tray2x = join(resourcesDir, 'tray-icon@2x.png');
  await sharp(svgBuffer).resize(22, 22).png().toFile(tray1x);
  await sharp(svgBuffer).resize(44, 44).png().toFile(tray2x);
  console.log(`  resources/tray-icon.png (22x22)`);
  console.log(`  resources/tray-icon@2x.png (44x44)`);

  // Build .icns on macOS using iconutil
  if (process.platform === 'darwin') {
    const icnsPath = join(buildDir, 'icon.icns');
    try {
      execSync(`iconutil --convert icns "${iconsetDir}" --output "${icnsPath}"`);
      console.log(`  build/icon.icns (macOS bundle icon)`);
    } catch (err) {
      console.error('Warning: iconutil failed. .icns not generated.', err.message);
    }
  } else {
    console.log('  Skipping .icns generation (not macOS)');
  }

  // Also save a 256px PNG in build/ for electron-builder (linux/win)
  const buildIcon = join(buildDir, 'icon.png');
  await sharp(svgBuffer).resize(256, 256).png().toFile(buildIcon);
  console.log(`  build/icon.png (256x256)`);

  console.log('\nDone! Icon files generated successfully.');
}

main().catch((err) => {
  console.error('Icon generation failed:', err);
  process.exit(1);
});
