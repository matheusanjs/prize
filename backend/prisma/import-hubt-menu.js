/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const https = require('https');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'menu');
const PUBLIC_BASE = 'https://api.marinaprizeclub.com/uploads/menu';
const FEED_URL = 'https://www.hubt.com.br/site/publishedJson?url=Prizeclub';

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extractImageUrl(item) {
  const imgs = item.images || [];
  if (!imgs.length) return null;
  const src = imgs[0].src || '';
  const i = src.indexOf('://');
  if (i < 0) return null;
  // strip the hubt prefix and rebuild as https://...
  const after = src.slice(i + 3);
  return `https://${after}`;
}

function parsePrice(item) {
  const ps = item.prices || [];
  if (!ps.length) return null;
  const raw = String(ps[0].value || '').trim();
  if (!raw) return null;
  const n = parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

async function main() {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  console.log('Baixando feed Hubt...');
  const buf = await get(FEED_URL);
  const data = JSON.parse(buf.toString('utf8'));
  const modules = data.modules || [];

  let categoriesCreated = 0;
  let itemsCreated = 0;
  let itemsUpdated = 0;
  let imgsDownloaded = 0;
  let imgsSkipped = 0;
  let imgsFailed = 0;
  let order = 0;

  for (const mod of modules) {
    const props = mod.properties || {};
    const title = props.title;
    const items = mod.items || [];
    if (!title || !items.length) continue;

    const slug = slugify(title);
    const cat = await prisma.menuCategory.upsert({
      where: { slug },
      create: { name: title, slug, order: order++, isActive: true },
      update: { name: title, isActive: true },
    });
    categoriesCreated++;
    console.log(`\n[${title}] (${slug}) - ${items.length} itens`);

    let itemOrder = 0;
    for (const it of items) {
      const name = (it.title || '').trim();
      if (!name) continue;
      const description = (it.desc || '').trim() || null;
      const price = parsePrice(it);
      if (price == null) {
        console.log(`  ⚠ ${name}: sem preço, pulando`);
        continue;
      }

      // image
      let imageUrl = null;
      const remote = extractImageUrl(it);
      if (remote) {
        const filename = `${slug}-${slugify(name)}.jpg`;
        const filepath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(filepath)) {
          imgsSkipped++;
          imageUrl = `${PUBLIC_BASE}/${filename}`;
        } else {
          try {
            const img = await get(remote);
            fs.writeFileSync(filepath, img);
            imgsDownloaded++;
            imageUrl = `${PUBLIC_BASE}/${filename}`;
            console.log(`    ✓ img: ${filename} (${(img.length / 1024).toFixed(0)}KB)`);
          } catch (e) {
            imgsFailed++;
            console.log(`    ✗ img falhou ${name}: ${e.message}`);
          }
        }
      }

      // upsert by (categoryId, name) — fall back to find first
      const existing = await prisma.menuItem.findFirst({
        where: { categoryId: cat.id, name },
      });
      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: {
            description,
            price,
            order: itemOrder++,
            isAvailable: true,
            ...(imageUrl ? { image: imageUrl } : {}),
          },
        });
        itemsUpdated++;
      } else {
        await prisma.menuItem.create({
          data: {
            categoryId: cat.id,
            name,
            description,
            price,
            order: itemOrder++,
            isAvailable: true,
            image: imageUrl,
          },
        });
        itemsCreated++;
      }
    }
  }

  console.log(`\n=== Resultado ===`);
  console.log(`Categorias:   ${categoriesCreated}`);
  console.log(`Itens novos:  ${itemsCreated}`);
  console.log(`Itens upd.:   ${itemsUpdated}`);
  console.log(`Imgs novas:   ${imgsDownloaded}`);
  console.log(`Imgs cache:   ${imgsSkipped}`);
  console.log(`Imgs falha:   ${imgsFailed}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
