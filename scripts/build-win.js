#!/usr/bin/env node

/**
 * Script de build Windows :
 * 1. Demande la version pour ce build (Major / Minor / Patch / Manuel / Ne rien changer)
 * 2. Build Tauri avec la version sélectionnée
 * 3. Si succès : crée la version portable
 *
 * Usage: node scripts/build-win.js
 * (Appelé par npm run build:win)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Charger les variables d'environnement depuis .env
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#') && line.includes('=')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        if (key && value) {
          process.env[key.trim()] = value;
        }
      }
    });
    console.log('✅ Variables d\'environnement chargées depuis .env');
  } else {
    console.log('⚠️ Fichier .env non trouvé');
  }
}

loadEnvFile();

const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
const targetExe = path.join(rootDir, 'src-tauri', 'target', 'release', 'app.exe');
const releaseDir = path.join(rootDir, 'release');

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return pkg.version;
}

function incrementVersion(version, type) {
  const parts = version.split('.');
  if (parts.length !== 3) throw new Error(`Version invalide: ${version}`);
  const [major, minor, patch] = parts.map((n) => parseInt(n, 10));
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return version;
  }
}

function setVersion(newVersion) {
  const versionRegex = /^\d+\.\d+\.\d+$/;
  if (!versionRegex.test(newVersion)) throw new Error(`Version invalide: ${newVersion}`);

  // package.json
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // tauri.conf.json
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
  tauriConf.version = newVersion;
  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');

  // Cargo.toml
  let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
  cargoToml = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${newVersion}"`);
  fs.writeFileSync(cargoTomlPath, cargoToml, 'utf8');

  return newVersion;
}

function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function promptVersion() {
  const current = getVersion();
  console.log('\n📌 Version actuelle : ' + current);
  console.log('\nVersion pour ce build :');
  console.log('  1 = Major   (ex: ' + current + ' → ' + incrementVersion(current, 'major') + ')');
  console.log('  2 = Minor   (ex: ' + current + ' → ' + incrementVersion(current, 'minor') + ')');
  console.log('  3 = Patch   (ex: ' + current + ' → ' + incrementVersion(current, 'patch') + ')');
  console.log('  4 = Saisir une version manuelle (ex: 1.2.0)');
  console.log('  0 = Ne rien changer');
  const answer = await askQuestion('\nChoix (0-4) : ');

  if (answer === '0') return;

  if (answer === '4') {
    const manual = await askQuestion('Version (ex: 1.2.0) : ');
    if (/^\d+\.\d+\.\d+$/.test(manual)) {
      setVersion(manual);
      console.log('✅ Version définie : ' + manual);
    } else {
      console.log('⚠️ Format invalide, version inchangée.');
    }
    return;
  }

  if (['1', '2', '3'].includes(answer)) {
    const types = { '1': 'major', '2': 'minor', '3': 'patch' };
    const newVer = incrementVersion(current, types[answer]);
    setVersion(newVer);
    console.log('✅ Version incrémentée : ' + current + ' → ' + newVer);
  } else {
    console.log('⚠️ Choix invalide, version inchangée.');
  }
}

function createPortable() {
  if (!fs.existsSync(targetExe)) {
    console.log('⚠️ Exe non trouvé : ' + targetExe);
    return;
  }
  if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });
  const version = getVersion();
  const productName = 'Discord Publisher';
  const destName = `${productName} ${version}-portable.exe`;
  const destPath = path.join(releaseDir, destName);
  fs.copyFileSync(targetExe, destPath);
  console.log('✅ Portable créé : release/' + destName);
}

async function main() {
  console.log('🔨 Build Windows (NSIS + portable)...\n');
  await promptVersion();
  const version = getVersion();
  console.log('\n📦 Build avec la version : ' + version);

  try {
    execSync('npm run build', { 
      stdio: 'inherit', 
      cwd: rootDir,
      env: process.env // Transmet les variables d'environnement
    });
  } catch (e) {
    console.error('\n❌ Build échoué.');
    process.exit(1);
  }

  console.log('\n✅ Build terminé avec succès !');
  createPortable();
  console.log('\n🎉 Terminé.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
