const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const { spawn } = require('child_process');

// Processus Python pour les bots
let pythonBotsProcess = null;
let pythonApiProcess = null;

// Vérifier si Python est installé
function checkPythonInstalled() {
  return new Promise((resolve) => {
    const pythonCheck = spawn('python', ['--version']);
    pythonCheck.on('error', () => resolve(false));
    pythonCheck.on('close', (code) => resolve(code === 0));
  });
}

// Obtenir le chemin vers Python (système ou embarqué)
function getPythonExecutable() {
  const isDev = process.env.VITE_DEV_SERVER_URL != null;
  const isStandalone = process.env.BUILD_STANDALONE === 'true' || fs.existsSync(path.join(process.resourcesPath, 'python-embed', 'python.exe'));
  
  if (isDev) {
    return 'python'; // Python système en dev
  }
  
  if (isStandalone) {
    // Python embarqué en production standalone
    return path.join(process.resourcesPath, 'python-embed', 'python.exe');
  }
  
  return 'python'; // Python système par défaut
}

function startPythonBots() {
  // En production, les fichiers Python sont dans resources/python
  // En dev, ils sont dans le dossier python à la racine
  const isDev = process.env.VITE_DEV_SERVER_URL != null;
  const pythonScript = isDev 
    ? path.join(__dirname, 'python', 'main_bots.py')
    : path.join(process.resourcesPath, 'python', 'main_bots.py');
  
  // Vérifier si le fichier existe
  if (!fs.existsSync(pythonScript)) {
    console.warn('⚠️  Bots Python non trouvés:', pythonScript);
    return;
  }

  console.log('🤖 Démarrage des bots Discord...');
  
  const pythonExe = getPythonExecutable();
  const workDir = isDev ? __dirname : process.resourcesPath;
  
  // Lancer le processus Python
  pythonBotsProcess = spawn(pythonExe, [pythonScript], {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Logger les sorties
  pythonBotsProcess.stdout.on('data', (data) => {
    console.log('[Bots]', data.toString().trim());
  });

  pythonBotsProcess.stderr.on('data', (data) => {
    console.error('[Bots Error]', data.toString().trim());
  });

  pythonBotsProcess.on('close', (code) => {
    console.log(`🤖 Bots arrêtés (code: ${code})`);
    pythonBotsProcess = null;
  });
}

function startPythonApi() {
  // En production, les fichiers Python sont dans resources/python
  // En dev, ils sont dans le dossier python à la racine
  const isDev = process.env.VITE_DEV_SERVER_URL != null;
  const pythonScript = isDev 
    ? path.join(__dirname, 'python', 'publisher_api.py')
    : path.join(process.resourcesPath, 'python', 'publisher_api.py');
  
  // Vérifier si le fichier existe
  if (!fs.existsSync(pythonScript)) {
    console.warn('⚠️  API Publisher non trouvée:', pythonScript);
    return;
  }

  console.log('🚀 Démarrage de l\'API Publisher...');
  
  const pythonExe = getPythonExecutable();
  const workDir = isDev ? __dirname : process.resourcesPath;
  
  // Lancer le processus Python
  pythonApiProcess = spawn(pythonExe, [pythonScript], {
    cwd: workDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // Logger les sorties
  pythonApiProcess.stdout.on('data', (data) => {
    console.log('[API]', data.toString().trim());
  });

  pythonApiProcess.stderr.on('data', (data) => {
    console.error('[API Error]', data.toString().trim());
  });

  pythonApiProcess.on('close', (code) => {
    console.log(`🚀 API arrêtée (code: ${code})`);
    pythonApiProcess = null;
  });
}

function stopPythonProcesses() {
  console.log('⏹️  Arrêt des processus Python...');
  
  if (pythonBotsProcess) {
    pythonBotsProcess.kill();
    pythonBotsProcess = null;
  }
  
  if (pythonApiProcess) {
    pythonApiProcess.kill();
    pythonApiProcess = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: true
    }
  });

  // Activer le correcteur orthographique pour cette fenêtre
  win.webContents.session.setSpellCheckerEnabled(true);
  win.webContents.session.setSpellCheckerLanguages(['fr-FR', 'fr']);

  const devUrl = process.env.VITE_DEV_SERVER_URL || null;
  if(devUrl){
    // En dev, charger le serveur Vite
    win.loadURL(devUrl).catch(err=>{
      console.error('Failed to load dev server:', err);
    });
  } else {
    // production : charger le build front
    const prodIndex = path.join(__dirname, 'dist', 'frontend', 'index.html');
    if(require('fs').existsSync(prodIndex)){
      win.loadFile(prodIndex);
    } else {
      console.error('Frontend build not found. Run: npm run build');
    }
  }
  // win.webContents.openDevTools(); // décommenter pour debug
}

app.whenReady().then(async () => {
  // Create images directory
  const imagesDir = path.join(app.getPath('userData'), 'images');
  await fsp.mkdir(imagesDir, { recursive: true });
  
  // Vérifier si c'est un build standalone (avec Python embarqué)
  const isStandalone = fs.existsSync(path.join(process.resourcesPath, 'python-embed', 'python.exe'));
  
  if (isStandalone) {
    console.log('🎯 Mode standalone détecté - Python embarqué inclus');
    // Démarrer directement les services Python
    startPythonBots();
    startPythonApi();
  } else {
    // Vérifier si Python est installé sur le système
    const pythonInstalled = await checkPythonInstalled();
    if (!pythonInstalled) {
      console.error('❌ Python n\'est pas installé ou pas dans le PATH');
      dialog.showErrorBox(
        'Python requis',
        'Python n\'est pas installé ou n\'est pas accessible.\n\n' +
        'Veuillez installer Python 3.10+ depuis https://www.python.org/downloads/\n' +
        'Et cochez "Add Python to PATH" pendant l\'installation.\n\n' +
        'Puis installez les dépendances avec:\n' +
        'pip install -r requirements.txt'
      );
    } else {
      // Démarrer les services Python en arrière-plan
      startPythonBots();
      startPythonApi();
    }
  }
  
  createWindow();
});

// Arrêter proprement les processus Python à la fermeture
app.on('before-quit', () => {
  stopPythonProcesses();
});

app.on('window-all-closed', () => {
  stopPythonProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- Publisher IPC (config persistence removed - no longer needed) ---

ipcMain.handle('publisher:test-connection', async () => {
  const apiUrl = 'http://localhost:8080/api/forum-post';
  
  try{
    // Simple GET request to test if API is reachable
    const resp = await fetch(apiUrl, { method: 'GET' });
    
    if(resp.ok || resp.status === 404 || resp.status === 405) {
      // 200 OK, 404 Not Found, or 405 Method Not Allowed all indicate the server is reachable
      return { ok:true, status: resp.status };
    }
    
    return { ok:false, error: `HTTP ${resp.status}`, status: resp.status };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

ipcMain.handle('publisher:publish', async (ev, payload) => {
  const apiUrl = 'http://localhost:8080/api/forum-post';

  try{
    // Check if this is an update (PATCH) or new post (POST)
    const isUpdate = payload.isUpdate && payload.threadId && payload.messageId;
    const method = isUpdate ? 'PATCH' : 'POST';
    const url = isUpdate 
      ? `${apiUrl}/${payload.threadId}/${payload.messageId}`
      : apiUrl;

    // Build FormData (Node 18+ provides global FormData / Blob)
    const form = new FormData();
    form.append('title', payload.title || 'Publication');
    form.append('content', payload.content || '');
    form.append('tags', payload.tags || '');
    form.append('template', payload.template || '');

    // Handle multiple images
    if(payload.images && Array.isArray(payload.images) && payload.images.length > 0) {
      for(let i = 0; i < payload.images.length; i++) {
        const img = payload.images[i];
        if(!img.dataUrl) continue;
        
        const parts = img.dataUrl.split(',');
        const meta = parts[0] || '';
        const data = parts[1] || '';
        const m = meta.match(/data:([^;]+);/);
        const contentType = m ? m[1] : 'application/octet-stream';
        const buffer = Buffer.from(data || '', 'base64');
        const blob = new Blob([buffer], { type: contentType });
        form.append(`image_${i}`, blob, img.filename || `image_${i}.png`);
        
        // Mark which image is main
        if(img.isMain) {
          form.append('main_image_index', String(i));
        }
      }
    }
    // Legacy support for single image (backwards compatibility)
    else if(payload.imageDataUrl) {
      const parts = payload.imageDataUrl.split(',');
      const meta = parts[0] || '';
      const data = parts[1] || '';
      const m = meta.match(/data:([^;]+);/);
      const contentType = m ? m[1] : 'application/octet-stream';
      const buffer = Buffer.from(data || '', 'base64');
      const blob = new Blob([buffer], { type: contentType });
      form.append('image_0', blob, payload.imageFilename || 'image.png');
      form.append('main_image_index', '0');
    }

    const resp = await fetch(url, { method, body: form });
    const data = await resp.json().catch(()=>({}));
    if(!resp.ok) return { ok:false, error: data?.error || JSON.stringify(data), status: resp.status };
    
    // Return data with rate limit info
    return { ok:true, data, rateLimit: data?.rate_limit };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

// Export config to file (native dialog)
ipcMain.handle('config:export', async (ev, config) => {
  try{
    const result = await dialog.showSaveDialog({ title: 'Exporter la configuration', defaultPath: 'publisher_config.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if(result.canceled || !result.filePath) return { ok:false, canceled:true };
    fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2));
    return { ok:true, path: result.filePath };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

// Import config from file (native dialog)
ipcMain.handle('config:import', async () => {
  try{
    const result = await dialog.showOpenDialog({ title: 'Importer la configuration', filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile'] });
    if(result.canceled || !result.filePaths || !result.filePaths[0]) return { ok:false, canceled:true };
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    return { ok:true, config: parsed };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

// Export template to file (native dialog)
ipcMain.handle('template:export', async (ev, template) => {
  try{
    const safeName = (template.name || 'template').replace(/[^a-zA-Z0-9-_]/g, '_');
    const result = await dialog.showSaveDialog({ 
      title: 'Exporter le template', 
      defaultPath: `${safeName}.json`, 
      filters: [{ name: 'JSON', extensions: ['json'] }] 
    });
    if(result.canceled || !result.filePath) return { ok:false, canceled:true };
    fs.writeFileSync(result.filePath, JSON.stringify(template, null, 2));
    return { ok:true, path: result.filePath };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

// Import template from file (native dialog)
ipcMain.handle('template:import', async () => {
  try{
    const result = await dialog.showOpenDialog({ 
      title: 'Importer un template', 
      filters: [{ name: 'JSON', extensions: ['json'] }], 
      properties: ['openFile'] 
    });
    if(result.canceled || !result.filePaths || !result.filePaths[0]) return { ok:false, canceled:true };
    const raw = fs.readFileSync(result.filePaths[0], 'utf8');
    const parsed = JSON.parse(raw);
    return { ok:true, template: parsed };
  }catch(e){
    return { ok:false, error: String(e?.message || e) };
  }
});

// --- Images filesystem operations ---
const IMAGES_DIR = () => path.join(app.getPath('userData'), 'images');

// Save image: copy from source to userData/images with unique name
ipcMain.handle('images:save', async (ev, sourceFilePath) => {
  try{
    const fileName = `image_${Date.now()}_${path.basename(sourceFilePath)}`;
    const destPath = path.join(IMAGES_DIR(), fileName);
    await fsp.copyFile(sourceFilePath, destPath);
    return { ok: true, fileName };
  }catch(e){
    return { ok: false, error: String(e?.message || e) };
  }
});

// Read image: return buffer for display or publication
ipcMain.handle('images:read', async (ev, imagePath) => {
  try{
    const fullPath = path.join(IMAGES_DIR(), imagePath);
    const buffer = await fsp.readFile(fullPath);
    return { ok: true, buffer: Array.from(buffer) }; // Convert Buffer to array for IPC
  }catch(e){
    return { ok: false, error: String(e?.message || e) };
  }
});

// Delete image: remove file from filesystem
ipcMain.handle('images:delete', async (ev, imagePath) => {
  try{
    const fullPath = path.join(IMAGES_DIR(), imagePath);
    await fsp.unlink(fullPath);
    return { ok: true };
  }catch(e){
    return { ok: false, error: String(e?.message || e) };
  }
});

// Get image file size in bytes
ipcMain.handle('images:get-size', async (ev, imagePath) => {
  try{
    const fullPath = path.join(IMAGES_DIR(), imagePath);
    const stats = await fsp.stat(fullPath);
    return { ok: true, size: stats.size };
  }catch(e){
    return { ok: false, error: String(e?.message || e) };
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});