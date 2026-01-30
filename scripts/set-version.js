#!/usr/bin/env node

/**
 * Script pour définir manuellement la version de l'application
 * Utile pour définir une version spécifique (ex: 2.0.0 pour une release majeure)
 * 
 * Usage: node scripts/set-version.js <version>
 * Exemple: node scripts/set-version.js 2.0.0
 */

const fs = require('fs');
const path = require('path');

// Vérifier les arguments
const args = process.argv.slice(2);
if (args.length !== 1) {
  console.error('❌ Usage: node scripts/set-version.js <version>');
  console.error('   Exemple: node scripts/set-version.js 2.0.0');
  process.exit(1);
}

const newVersion = args[0];

// Valider le format de version (x.y.z)
const versionRegex = /^\d+\.\d+\.\d+$/;
if (!versionRegex.test(newVersion)) {
  console.error(`❌ Version invalide: ${newVersion}`);
  console.error('   Format attendu: x.y.z (ex: 2.0.0)');
  process.exit(1);
}

// Chemins des fichiers
const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

try {
  // 1. Mettre à jour package.json
  console.log('📦 Mise à jour de package.json...');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const oldVersion = packageJson.version;
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`   ${oldVersion} → ${newVersion}`);

  // 2. Mettre à jour tauri.conf.json
  console.log('⚙️  Mise à jour de src-tauri/tauri.conf.json...');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log(`   ${tauriConf.version} → ${newVersion}`);

  // 3. Mettre à jour Cargo.toml
  console.log('🦀 Mise à jour de src-tauri/Cargo.toml...');
  let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  const versionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);

  if (!versionMatch) {
    throw new Error('Version non trouvée dans Cargo.toml');
  }

  const cargoOldVersion = versionMatch[1];
  cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/, `version = "${newVersion}"`);
  fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');
  console.log(`   ${cargoOldVersion} → ${newVersion}`);

  console.log('\n✅ Version définie avec succès !');
  console.log(`   Nouvelle version: ${newVersion}`);

  process.exit(0);
} catch (error) {
  console.error('\n❌ Erreur lors de la définition de version:');
  console.error(error.message);
  process.exit(1);
}
