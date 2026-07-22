import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const args = process.argv.slice(2);
const required = args.includes('--required');
const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiDir = resolve(scriptDir, '..');
const defaultSourcePath = resolve(uiDir, 'src/assets/app-icon.png');
const sourcePath = resolve(uiDir, getOption(args, '--source') ?? defaultSourcePath);
const publicDir = resolve(uiDir, 'public');
const iconsDir = resolve(publicDir, 'icons');

async function main() {
  const source = await readSource();
  if (!source) {
    return;
  }

  await mkdir(iconsDir, { recursive: true });

  await Promise.all([
    writePng(source, 192, resolve(iconsDir, 'icon-192.png')),
    writePng(source, 512, resolve(iconsDir, 'icon-512.png')),
    writeMaskablePng(source, resolve(iconsDir, 'icon-512-maskable.png')),
    writePng(source, 180, resolve(publicDir, 'apple-touch-icon.png')),
    writeFavicon(source, resolve(publicDir, 'favicon.ico')),
  ]);

  console.log(`Generated PWA icons from ${sourcePath}`);
}

async function readSource() {
  try {
    return await readFile(sourcePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    const message = `PWA icon source not found: ${sourcePath}`;
    if (required) {
      throw new Error(
        `${message}\nPlace the original PNG at apps/kajibun-ui/src/assets/app-icon.png or pass --source path/to/icon.png.`,
      );
    }

    console.warn(`${message}; skipping icon generation.`);
    return null;
  }
}

async function writePng(source, size, outputPath) {
  await sharp(source)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);
}

async function writeMaskablePng(source, outputPath) {
  const innerSize = 410;
  const image = await sharp(source)
    .resize(innerSize, innerSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: image, left: 51, top: 51 }])
    .png()
    .toFile(outputPath);
}

async function writeFavicon(source, outputPath) {
  const entries = await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      png: await sharp(source)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    })),
  );

  await writeFile(outputPath, createIco(entries));
}

function createIco(entries) {
  const headerSize = 6;
  const directoryEntrySize = 16;
  const imageOffset = headerSize + entries.length * directoryEntrySize;
  const totalSize = imageOffset + entries.reduce((sum, entry) => sum + entry.png.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(entries.length, 4);

  let directoryOffset = headerSize;
  let dataOffset = imageOffset;

  for (const entry of entries) {
    ico.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset);
    ico.writeUInt8(entry.size === 256 ? 0 : entry.size, directoryOffset + 1);
    ico.writeUInt8(0, directoryOffset + 2);
    ico.writeUInt8(0, directoryOffset + 3);
    ico.writeUInt16LE(1, directoryOffset + 4);
    ico.writeUInt16LE(32, directoryOffset + 6);
    ico.writeUInt32LE(entry.png.length, directoryOffset + 8);
    ico.writeUInt32LE(dataOffset, directoryOffset + 12);
    entry.png.copy(ico, dataOffset);

    directoryOffset += directoryEntrySize;
    dataOffset += entry.png.length;
  }

  return ico;
}

function getOption(values, name) {
  const equalsValue = values.find((value) => value.startsWith(`${name}=`));
  if (equalsValue) {
    return equalsValue.slice(name.length + 1);
  }

  const index = values.indexOf(name);
  if (index >= 0) {
    return values[index + 1];
  }

  return undefined;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
