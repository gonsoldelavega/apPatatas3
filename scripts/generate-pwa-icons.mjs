import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const projectRoot = "C:/Users/nando/Documents/apPatatas";

const DARK_GREEN = [0x3d, 0x7a, 0x5a, 0xff];
const LIGHT_GREEN = [0x6a, 0xaf, 0x85, 0xff];
const WHITE = [0xff, 0xff, 0xff, 0xff];

function createImage(size){
  return {
    size,
    data: Buffer.alloc(size * size * 4, 0)
  };
}

function setPixel(image, x, y, rgba){
  if(x < 0 || y < 0 || x >= image.size || y >= image.size) return;
  const offset = (y * image.size + x) * 4;
  image.data[offset] = rgba[0];
  image.data[offset + 1] = rgba[1];
  image.data[offset + 2] = rgba[2];
  image.data[offset + 3] = rgba[3];
}

function fillRoundedRect(image, x, y, width, height, radius, rgba){
  const x2 = x + width;
  const y2 = y + height;
  for(let py = y; py < y2; py += 1){
    for(let px = x; px < x2; px += 1){
      const cx = px < x + radius ? x + radius : px > x2 - radius - 1 ? x2 - radius - 1 : px;
      const cy = py < y + radius ? y + radius : py > y2 - radius - 1 ? y2 - radius - 1 : py;
      const distance = Math.hypot(px - cx, py - cy);
      if(distance <= radius){
        setPixel(image, px, py, rgba);
      }
    }
  }
}

function fillRect(image, x, y, width, height, rgba){
  for(let py = y; py < y + height; py += 1){
    for(let px = x; px < x + width; px += 1){
      setPixel(image, px, py, rgba);
    }
  }
}

function drawGlyphF(image, x, y, scale, rgba){
  fillRect(image, x, y, scale * 3, scale * 18, rgba);
  fillRect(image, x, y, scale * 11, scale * 3, rgba);
  fillRect(image, x, y + scale * 7, scale * 9, scale * 3, rgba);
}

function drawGlyphP(image, x, y, scale, rgba){
  fillRect(image, x, y, scale * 3, scale * 18, rgba);
  fillRect(image, x, y, scale * 10, scale * 3, rgba);
  fillRect(image, x + scale * 7, y + scale * 3, scale * 3, scale * 5, rgba);
  fillRect(image, x, y + scale * 7, scale * 10, scale * 3, rgba);
}

function drawDecoration(image, x, y, width, height, rgba){
  fillRoundedRect(image, x, y, width, height, Math.max(1, Math.round(height / 2)), rgba);
}

function makeIcon(size){
  const image = createImage(size);
  const padding = Math.round(size * 0.055);
  const radius = Math.round(size * 0.22);
  fillRoundedRect(image, padding, padding, size - padding * 2, size - padding * 2, radius, DARK_GREEN);

  const scale = Math.max(3, Math.round(size / 40));
  const glyphHeight = scale * 18;
  const glyphGap = scale * 4;
  const totalGlyphWidth = scale * 11 + glyphGap + scale * 10;
  const glyphX = Math.round((size - totalGlyphWidth) / 2);
  const glyphY = Math.round(size * 0.22);

  drawGlyphF(image, glyphX, glyphY, scale, WHITE);
  drawGlyphP(image, glyphX + scale * 11 + glyphGap, glyphY, scale, WHITE);

  const lineWidth = Math.round(size * 0.24);
  const lineHeight = Math.max(4, Math.round(size * 0.018));
  const lineX = Math.round((size - lineWidth) / 2);
  const lineY = glyphY + glyphHeight + Math.round(size * 0.085);
  drawDecoration(image, lineX, lineY, lineWidth, lineHeight, LIGHT_GREEN);

  return image;
}

function makeCrcTable(){
  const table = new Uint32Array(256);
  for(let n = 0; n < 256; n += 1){
    let c = n;
    for(let k = 0; k < 8; k += 1){
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buffer){
  let crc = 0xffffffff;
  for(let index = 0; index < buffer.length; index += 1){
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data){
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  const crcValue = crc32(Buffer.concat([typeBuffer, data]));
  crcBuffer.writeUInt32BE(crcValue, 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function encodePng(image){
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.size, 0);
  ihdr.writeUInt32BE(image.size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = image.size * 4;
  const raw = Buffer.alloc((stride + 1) * image.size);
  for(let y = 0; y < image.size; y += 1){
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    image.data.copy(raw, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

for(const size of [192, 512]){
  const png = encodePng(makeIcon(size));
  fs.writeFileSync(path.join(projectRoot, `icon-${size}.png`), png);
}

console.log("PWA icons generated.");
