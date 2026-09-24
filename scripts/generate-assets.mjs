import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function brandSvg({ width, height, eyebrow, title, note, fontData }) {
  const unit = width / 1200;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      @font-face{font-family:LocalManrope;src:url(data:font/woff2;base64,${fontData}) format("woff2");font-weight:200 800}
      text{font-family:LocalManrope,sans-serif}
    </style>
    <rect width="${width}" height="${height}" fill="#050505"/>
    <rect x="${80 * unit}" y="${92 * unit}" width="${160 * unit}" height="${4 * unit}" fill="#b9855b"/>
    <text x="${80 * unit}" y="${height * 0.22}" fill="#cfcfcf" font-size="${34 * unit}" font-weight="600" letter-spacing="${5 * unit}">${escapeXml(eyebrow)}</text>
    <text x="${80 * unit}" y="${height * 0.58}" fill="#fff" font-size="${104 * unit}" font-weight="500" letter-spacing="${7 * unit}">${escapeXml(title)}</text>
    <text x="${80 * unit}" y="${height * 0.78}" fill="#d8d8d8" font-size="${38 * unit}" font-weight="400">${escapeXml(note)}</text>
    <text x="${80 * unit}" y="${height * 0.94}" fill="#9a9a9a" font-size="${24 * unit}" font-weight="500" letter-spacing="${3 * unit}">VLR—DMITROV / 2026</text>
  </svg>`);
}

export async function ensureMediaAssets() {
  const font = await readFile(path.join(root, 'assets/fonts/manrope-cyrillic.woff2'));
  const fontData = font.toString('base64');
  await mkdir(path.join(root, 'img'), { recursive: true });

  await sharp(brandSvg({
    width: 1200,
    height: 630,
    eyebrow: 'REAL ESTATE / DMITROV',
    title: 'ВЛР—ДМИТРОВ',
    note: 'Каталог объектов · Дмитровский округ',
    fontData
  })).jpeg({ quality: 88, progressive: true, chromaSubsampling: '4:4:4' }).toFile(path.join(root, 'img/og-default.jpg'));

  const iconPng = await sharp(path.join(root, 'assets/icons/favicon.svg')).resize(32, 32).png().toBuffer();
  const iconHeader = Buffer.alloc(22);
  iconHeader.writeUInt16LE(0, 0);
  iconHeader.writeUInt16LE(1, 2);
  iconHeader.writeUInt16LE(1, 4);
  iconHeader.writeUInt8(32, 6);
  iconHeader.writeUInt8(32, 7);
  iconHeader.writeUInt16LE(1, 10);
  iconHeader.writeUInt16LE(32, 12);
  iconHeader.writeUInt32LE(iconPng.length, 14);
  iconHeader.writeUInt32LE(22, 18);
  await writeFile(path.join(root, 'favicon.ico'), Buffer.concat([iconHeader, iconPng]));

  await sharp(brandSvg({
    width: 1920,
    height: 1080,
    eyebrow: 'АВТОРСКОЕ ВИДЕО / ОЖИДАЕТ МАТЕРИАЛЫ',
    title: 'ДМИТРОВ',
    note: 'Лицензия и права на публикацию будут проверены',
    fontData
  })).jpeg({ quality: 86, progressive: true, chromaSubsampling: '4:2:0' }).toFile(path.join(root, 'img/dmitrov-poster.jpg'));
}
