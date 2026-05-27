import sharp from "sharp";
import path from "node:path";

const SRC = "C:/Users/HP/Downloads/Gemini_Generated_Image_6savby6savby6sav-removebg-preview.png";
const OUT = "C:/Users/HP/Desktop/normi-login-page/public";

const white = { r: 255, g: 255, b: 255, alpha: 1 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

const size = 512;
const safe = 0.7;
const inner = Math.round(size * safe);
const offset = Math.round((size - inner) / 2);

const resized = await sharp(SRC)
  .resize(inner, inner, { fit: "contain", background: transparent })
  .toBuffer();

await sharp({ create: { width: size, height: size, channels: 4, background: white } })
  .composite([{ input: resized, top: offset, left: offset }])
  .png()
  .toFile(path.join(OUT, "pwa-maskable-512x512.png"));

console.log("OK pwa-maskable-512x512.png con fondo blanco");
