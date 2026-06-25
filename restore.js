/**
 * ═══════════════════════════════════════════════════════
 *   FY LASHES — Restore Script
 *   Restores MongoDB collections from a backup folder
 * ═══════════════════════════════════════════════════════
 *
 *  Usage:
 *    node restore.js <backup-folder>
 *
 *  Example:
 *    node restore.js backups/2025-01-15_14-30-00
 *
 *  ⚠️  WARNING: This REPLACES existing collection data.
 *      Always test on a staging database first.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

/* ── Prompt helper ── */
function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

async function run() {
  console.log('╔══════════════════════════════════╗');
  console.log('║   🌸  FY LASHES RESTORE TOOL      ║');
  console.log('╚══════════════════════════════════╝');

  // ── Validate backup folder arg ──
  const backupDir = process.argv[2];
  if (!backupDir) {
    console.error('\n❌  Usage: node restore.js <backup-folder>');
    console.error('    Example: node restore.js backups/2025-01-15_14-30-00\n');
    process.exit(1);
  }

  const dbDir = path.join(backupDir, 'db');
  if (!fs.existsSync(dbDir)) {
    console.error(`\n❌  Folder not found: ${dbDir}\n`);
    process.exit(1);
  }

  // ── Show backup meta ──
  const metaPath = path.join(dbDir, '_meta.json');
  if (fs.existsSync(metaPath)) {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    console.log(`\n   📅  Backup date:  ${meta.backedUpAt}`);
    console.log(`   🗄️   Mongo host:   ${meta.mongoHost}`);
    const counts = Object.entries(meta.collections)
      .map(([k, v]) => `${k}(${v.count ?? '?'})`)
      .join(', ');
    console.log(`   📦  Collections: ${counts}`);
  }

  // ── Confirm ──
  console.log(`\n⚠️   This will OVERWRITE data in: ${process.env.MONGO_URI}`);
  const answer = await ask('   Type "yes" to continue: ');
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n   Restore cancelled.\n');
    process.exit(0);
  }

  // ── Connect ──
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  console.log('\n   ✅  Connected to MongoDB');

  const db          = mongoose.connection.db;
  const collections = ['products', 'orders', 'admins'];

  for (const name of collections) {
    const file = path.join(dbDir, `${name}.json`);
    if (!fs.existsSync(file)) {
      console.log(`   ⏭️   ${name}: file not found, skipping`);
      continue;
    }

    const docs = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!docs.length) {
      console.log(`   ⏭️   ${name}: empty, skipping`);
      continue;
    }

    // Drop existing data and re-insert
    await db.collection(name).deleteMany({});
    await db.collection(name).insertMany(docs);
    console.log(`   ✅  ${name}: ${docs.length} document(s) restored`);
  }

  await mongoose.disconnect();

  console.log('\n╔══════════════════════════════════╗');
  console.log('║         RESTORE COMPLETE          ║');
  console.log('╚══════════════════════════════════╝\n');
}

run().catch((err) => {
  console.error('\n❌  Restore failed:', err.message);
  process.exit(1);
});