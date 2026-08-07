import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const DARK_RGB = [0xcd, 0xe5, 0x0b] as const;
const LIGHT_RGB = [0x19, 0x19, 0x19] as const;

const artworkPairs = [
  {
    darkSha256:
      "25d8f5b5870066f84e193b70e23599b6cd5404ffd22278092c201228b2affb29",
    fileName: "future-french-house.png",
  },
  {
    darkSha256:
      "f7419604cd30a02800e146342d4d5f9a3b02b646cf6ba4cb539333a63a670c03",
    fileName: "latin-house.png",
  },
  {
    darkSha256:
      "701290d08283619c8a74aef51dc202258e990f4c6de15d716b9447d1376aa5e3",
    fileName: "house.png",
  },
] as const;

function paethPredictor(left: number, up: number, upperLeft: number) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

function decodeRgbaPng(filePath: string) {
  const source = readFileSync(filePath);
  if (!source.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a PNG`);
  }

  let width = 0;
  let height = 0;
  const compressedChunks: Buffer[] = [];
  let offset = PNG_SIGNATURE.length;
  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.toString("ascii", offset + 4, offset + 8);
    const data = source.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [bitDepth, colorType, compression, filter, interlace] =
        data.subarray(8, 13);
      if (
        bitDepth !== 8 ||
        colorType !== 6 ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new Error(`${filePath} must be non-interlaced 8-bit RGBA`);
      }
    } else if (type === "IDAT") {
      compressedChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(compressedChunks));
  const expectedLength = height * (stride + 1);
  if (filtered.length !== expectedLength) {
    throw new Error(`${filePath} has an unexpected decoded length`);
  }

  const pixels = Buffer.alloc(width * height * bytesPerPixel);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filterType = filtered[sourceOffset]!;
    sourceOffset += 1;
    for (let column = 0; column < stride; column += 1) {
      const destinationOffset = row * stride + column;
      const left =
        column >= bytesPerPixel
          ? pixels[destinationOffset - bytesPerPixel]!
          : 0;
      const up = row > 0 ? pixels[destinationOffset - stride]! : 0;
      const upperLeft =
        row > 0 && column >= bytesPerPixel
          ? pixels[destinationOffset - stride - bytesPerPixel]!
          : 0;
      let predictor = 0;
      if (filterType === 1) predictor = left;
      else if (filterType === 2) predictor = up;
      else if (filterType === 3) predictor = Math.floor((left + up) / 2);
      else if (filterType === 4) {
        predictor = paethPredictor(left, up, upperLeft);
      } else if (filterType !== 0) {
        throw new Error(`${filePath} uses unsupported filter ${filterType}`);
      }
      pixels[destinationOffset] =
        (filtered[sourceOffset]! + predictor) & 0xff;
      sourceOffset += 1;
    }
  }

  return { height, pixels, width };
}

describe("featured station light artwork", () => {
  artworkPairs.forEach(({ darkSha256, fileName }) => {
    it(`recolors the ${fileName} master without changing alpha`, () => {
      const darkPath = path.join(
        process.cwd(),
        "src/renderer/public/assets/stations-dark",
        fileName,
      );
      const lightPath = path.join(
        process.cwd(),
        "src/renderer/public/assets/stations",
        fileName,
      );
      const darkBytes = readFileSync(darkPath);
      expect(createHash("sha256").update(darkBytes).digest("hex")).toBe(
        darkSha256,
      );

      const dark = decodeRgbaPng(darkPath);
      const light = decodeRgbaPng(lightPath);
      expect({ height: light.height, width: light.width }).toEqual({
        height: dark.height,
        width: dark.width,
      });

      for (let offset = 0; offset < dark.pixels.length; offset += 4) {
        const pixel = offset / 4;
        const darkPixel = dark.pixels.subarray(offset, offset + 4);
        const lightPixel = light.pixels.subarray(offset, offset + 4);
        if (
          darkPixel[0] !== DARK_RGB[0] ||
          darkPixel[1] !== DARK_RGB[1] ||
          darkPixel[2] !== DARK_RGB[2]
        ) {
          throw new Error(`${fileName} dark RGB mismatch at pixel ${pixel}`);
        }
        if (
          lightPixel[0] !== LIGHT_RGB[0] ||
          lightPixel[1] !== LIGHT_RGB[1] ||
          lightPixel[2] !== LIGHT_RGB[2]
        ) {
          throw new Error(`${fileName} light RGB mismatch at pixel ${pixel}`);
        }
        if (lightPixel[3] !== darkPixel[3]) {
          throw new Error(`${fileName} alpha mismatch at pixel ${pixel}`);
        }
      }
    });
  });
});
