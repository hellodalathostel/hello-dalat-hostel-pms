// Sinh icon PWA từ public/icons/logo-source.png (nền trắng, vuông).
// Chạy: npm run icons
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsDir = join(root, 'public', 'icons')
const source = join(iconsDir, 'logo-source.png')
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }

if (!existsSync(source)) {
  console.error(`Không tìm thấy ${source}`)
  process.exit(1)
}

async function square(size, file) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE })
    .png()
    .toFile(join(iconsDir, file))
  console.log(`✓ ${file}`)
}

// Maskable: logo thu về 80%, lề trắng 10% mỗi bên (safe zone)
async function maskable(size, file) {
  const inner = Math.round(size * 0.8)
  const pad = Math.round(size * 0.1)
  await sharp(source)
    .resize(inner, inner, { fit: 'contain', background: WHITE })
    .flatten({ background: WHITE })
    .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: WHITE })
    .png()
    .toFile(join(iconsDir, file))
  console.log(`✓ ${file}`)
}

await square(192, 'icon-192.png')
await square(512, 'icon-512.png')
await maskable(512, 'icon-maskable-512.png')
await square(180, 'apple-touch-icon.png')
