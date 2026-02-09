#!/usr/bin/env node

/**
 * Script pour incrémenter automatiquement la version de l'application
 * Incrémente le patch version (x.y.z -> x.y.z+1) dans :
 * - package.json
 * - src-tauri/tauri.conf.json
 * - src-tauri/Cargo.toml
 */

const fs = require('fs');
const path = require('path');

// Fonction pour incrémenter une version sémantique (patch)
function incrementVersion(version) {
  const parts = version.split('.');
  if (parts.length !== 3) {
    throw new Error(`Version invalide: ${version}`);
  }
  const [major, minor, patch] = parts;
  const newPatch = parseInt(patch, 10) + 1;
  return `${major}.${minor}.${newPatch}`;
}

// Chemins des fichiers
const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

try {
  // 1. Lire et mettre à jour package.json
  console.log('📦 Mise à jour de package.json...');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const oldVersion = packageJson.version;
  const newVersion = incrementVersion(oldVersion);
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
  console.log(`   ${oldVersion} → ${newVersion}`);

  // 2. Lire et mettre à jour tauri.conf.json
  console.log('⚙️  Mise à jour de src-tauri/tauri.conf.json...');
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
  console.log(`   ${oldVersion} → ${newVersion}`);

  // 3. Lire et mettre à jour Cargo.toml (SEULEMENT version, PAS rust-version)
  console.log('🦀 Mise à jour de src-tauri/Cargo.toml...');
  let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  
  // Trouver la section [package]
  const packageSectionMatch = cargoToml.match(/\[package\]([\s\S]*?)(?=\n\[|$)/);
  if (!packageSectionMatch) {
    throw new Error('Section [package] non trouvée dans Cargo.toml');
  }
  
  const packageSection = packageSectionMatch[1];
  const versionMatch = packageSection.match(/^version\s*=\s*"([^"]+)"/m);
  
  if (!versionMatch) {
    throw new Error('Version non trouvée dans Cargo.toml');
  }
  
  const cargoOldVersion = versionMatch[1];
  
  // Remplacer UNIQUEMENT "version = " dans la section [package]
  const updatedPackageSection = packageSection.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${newVersion}"`
  );
  
  cargoToml = cargoToml.replace(packageSectionMatch[0], `[package]${updatedPackageSection}`);
  fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');
  console.log(`   ${cargoOldVersion} → ${newVersion}`);

  process.exit(0);
} catch (error) {
  console.error('\n❌ Erreur lors de l\'incrémentation de version:');
  console.error(error.message);
  process.exit(1);
}
