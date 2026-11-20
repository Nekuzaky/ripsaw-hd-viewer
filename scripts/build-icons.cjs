const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const BUILD = join(__dirname, '..', 'build');
const MASTER = 512;
const ICO_SIZES = [256, 128, 64, 48, 32, 24, 16];

function toIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  const svg = readFileSync(join(BUILD, 'icon.svg'), 'utf8');
  const window = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;overflow:hidden;background:transparent">${svg.replace(
    '<svg ',
    `<svg style="display:block" width="${MASTER}" height="${MASTER}" `,
  )}</body></html>`;
  await window.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const master = await window.webContents.capturePage({ x: 0, y: 0, width: MASTER, height: MASTER });
  const resized = (size) =>
    nativeImage.createFromBuffer(master.toPNG()).resize({ width: size, height: size, quality: 'best' });

  writeFileSync(join(BUILD, 'icon.png'), resized(512).toPNG());
  writeFileSync(
    join(BUILD, 'icon.ico'),
    toIco(ICO_SIZES.map((size) => ({ size, png: resized(size).toPNG() }))),
  );
  app.quit();
});
