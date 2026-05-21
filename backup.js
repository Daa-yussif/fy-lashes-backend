/**
 * ═══════════════════════════════════════════════════════
 *   FY LASHES — Full Backup Script
 *   Backs up: MongoDB collections + Cloudinary images
 * ═══════════════════════════════════════════════════════
 *
 *  Usage:
 *    node backup.js                  → full backup (DB + images)
 *    node backup.js --db-only        → MongoDB only
 *    node backup.js --images-only    → Cloudinary images only
 *
 *  Output:
 *    backups/
 *      2025-01-15_14-30-00/
 *        db/
 *          products.json
 *          orders.json
 *          admins.json
 *          _meta.json
 *        images/
 *          product-name.jpg
 *          ...
 *        backup-report.json
 */

require('dotenv').config();

const mongoose  = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs        = require('fs');
const path      = require('path');
const https     = require('https');
const http      = require('http');

/* ── CLI flags ── */
const args       = process.argv.slice(2);
const DB_ONLY     = args.includes('--db-only');
const IMAGES_ONLY = args.includes('--images-only');
const DO_DB       = !IMAGES_ONLY;
const DO_IMAGES   = !DB_ONLY;

/* ── Cloudinary config ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ══════════════════════════════════
   HELPERS
══════════════════════════════════ */

/** Create a timestamped backup folder */
function makeBackupDir() {
  const now    = new Date();
  const stamp  = now.toISOString()
    .replace('T', '_')
    .replace(/:/g, '-')
    .slice(0, 19);                      // e.g. 2025-01-15_14-30-00

  const base = path.join(__dirname, 'backups', stamp);
  fs.mkdirSync(path.join(base, 'db'),     { recursive: true });
  fs.mkdirSync(path.join(base, 'images'), { recursive: true });

  return base;
}

/** Download a file from a URL to disk */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file     = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      // Follow redirect (Cloudinary sometimes issues one)
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        return downloadFile(response.headers.location, dest)
          .then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${response.statusCode} for ${url}`));
      }

      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/** Format bytes to human-readable */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k     = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/** Safe filename from a Cloudinary public_id */
function safeFilename(publicId, format) {
  const name = publicId.replace(/[\/\\?%*:|"<>]/g, '_');
  return `${name}.${format || 'jpg'}`;
}

/* ══════════════════════════════════
   DB BACKUP
══════════════════════════════════ */

async function backupDatabase(backupDir) {
  console.log('\n📦  Starting MongoDB backup...');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('   ✅  Connected to MongoDB');

  const db      = mongoose.connection.db;
  const dbDir   = path.join(backupDir, 'db');
  const results = {};

  // ── Collections to back up ──
  const collections = ['products', 'orders', 'admins'];

  for (const name of collections) {
    try {
      const docs  = await db.collection(name).find({}).toArray();
      const file  = path.join(dbDir, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(docs, null, 2));
      results[name] = { count: docs.length, file: `db/${name}.json` };
      console.log(`   ✅  ${name}: ${docs.length} document(s) saved`);
    } catch (err) {
      results[name] = { error: err.message };
      console.warn(`   ⚠️  ${name}: ${err.message}`);
    }
  }

  // ── Meta ──
  const meta = {
    backedUpAt:  new Date().toISOString(),
    mongoHost:   mongoose.connection.host,
    collections: results,
  };
  fs.writeFileSync(path.join(dbDir, '_meta.json'), JSON.stringify(meta, null, 2));
  console.log('   📝  Meta saved → db/_meta.json');

  await mongoose.disconnect();
  return results;
}

/* ══════════════════════════════════
   CLOUDINARY BACKUP
══════════════════════════════════ */

async function backupCloudinary(backupDir) {
  console.log('\n🖼️   Starting Cloudinary image backup...');

  const imagesDir = path.join(backupDir, 'images');
  const folder    = 'fy-lashes';   // ← your Cloudinary folder

  // ── Fetch all resources in the folder ──
  let resources = [];
  let nextCursor;

  do {
    const options = { type: 'upload', prefix: folder, max_results: 500 };
    if (nextCursor) options.next_cursor = nextCursor;

    const result = await cloudinary.api.resources(options);
    resources    = resources.concat(result.resources);
    nextCursor   = result.next_cursor;
  } while (nextCursor);

  console.log(`   📷  Found ${resources.length} image(s) in "${folder}"`);

  if (resources.length === 0) {
    console.log('   ℹ️   No images to download.');
    return { downloaded: 0, failed: 0, images: [] };
  }

  // ── Download each image ──
  let downloaded = 0;
  let failed     = 0;
  const manifest = [];

  for (const [i, res] of resources.entries()) {
    const filename = safeFilename(res.public_id, res.format);
    const dest     = path.join(imagesDir, filename);
    const url      = res.secure_url;

    process.stdout.write(`   [${i + 1}/${resources.length}] ${filename} ... `);

    try {
      await downloadFile(url, dest);
      const size = fs.statSync(dest).size;
      console.log(`✅  (${formatBytes(size)})`);
      manifest.push({ publicId: res.public_id, filename, url, bytes: size });
      downloaded++;
    } catch (err) {
      console.log(`❌  ${err.message}`);
      manifest.push({ publicId: res.public_id, filename, url, error: err.message });
      failed++;
    }
  }

  // ── Save image manifest ──
  fs.writeFileSync(
    path.join(imagesDir, '_manifest.json'),
    JSON.stringify({ total: resources.length, downloaded, failed, images: manifest }, null, 2)
  );
  console.log(`   📝  Manifest saved → images/_manifest.json`);

  return { downloaded, failed, images: manifest };
}

/* ══════════════════════════════════
   MAIN
══════════════════════════════════ */

async function run() {
  console.log('╔══════════════════════════════════╗');
  console.log('║   🌸  FY LASHES BACKUP TOOL       ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Mode: ${DB_ONLY ? 'DB only' : IMAGES_ONLY ? 'Images only' : 'Full (DB + Images)'}`);

  // ── Validate ENV ──
  const required = ['MONGO_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`\n❌  Missing environment variables: ${missing.join(', ')}`);
    console.error('    Make sure your .env file is present and complete.\n');
    process.exit(1);
  }

  const backupDir = makeBackupDir();
  console.log(`\n📁  Backup folder: ${backupDir}`);

  const startTime = Date.now();
  const report    = { startedAt: new Date().toISOString(), backupDir };

  // ── Run selected steps ──
  if (DO_DB) {
    report.database = await backupDatabase(backupDir);
  }

  if (DO_IMAGES) {
    report.images = await backupCloudinary(backupDir);
  }

  // ── Final report ──
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  report.finishedAt    = new Date().toISOString();
  report.durationSecs  = parseFloat(elapsed);

  fs.writeFileSync(
    path.join(backupDir, 'backup-report.json'),
    JSON.stringify(report, null, 2)
  );

  // ── Summary ──
  console.log('\n╔══════════════════════════════════╗');
  console.log('║          BACKUP COMPLETE          ║');
  console.log('╚══════════════════════════════════╝');
  if (report.database) {
    const total = Object.values(report.database).reduce((s, r) => s + (r.count || 0), 0);
    console.log(`   📦  DB documents:  ${total}`);
  }
  if (report.images) {
    console.log(`   🖼️   Images saved:  ${report.images.downloaded}`);
    if (report.images.failed > 0) {
      console.log(`   ⚠️   Images failed: ${report.images.failed}`);
    }
  }
  console.log(`   ⏱️   Duration:       ${elapsed}s`);
  console.log(`   📁  Saved to:       ${backupDir}\n`);
}

run().catch((err) => {
  console.error('\n❌  Backup failed:', err.message);
  process.exit(1);
});