const { app, BrowserWindow, dialog, ipcMain, shell, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('node:fs/promises');
const path = require('node:path');

let databasePath = '';
let updatePromptOpen = false;
const configFile = () => path.join(app.getPath('userData'), 'database-config.json');

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;
autoUpdater.on('error', error => console.error('Application update check failed:', error));
autoUpdater.on('update-downloaded', async info => {
  if (updatePromptOpen) return;
  updatePromptOpen = true;
  try {
    const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options = {
      type: 'info',
      title: 'Update ready',
      message: `Version ${info.version} is ready to install.`,
      detail: 'Restart the app now to finish installing the update, or choose Later to install it when you next close the app.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1
    };
    const { response } = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  } catch (error) {
    console.error('Could not show update prompt:', error);
  } finally {
    updatePromptOpen = false;
  }
});

async function rememberDatabase(selectedPath) {
  databasePath = selectedPath || '';
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(configFile(), JSON.stringify({ databasePath }), 'utf8');
}

async function readRememberedDatabase() {
  try {
    const config = JSON.parse(await fs.readFile(configFile(), 'utf8'));
    databasePath = typeof config.databasePath === 'string' ? config.databasePath : '';
    if (!databasePath) return null;
    const content = await fs.readFile(databasePath, 'utf8');
    return { path: databasePath, name: path.basename(databasePath), content };
  } catch (error) {
    if (error.code === 'ENOENT') return databasePath ? { path: databasePath, name: path.basename(databasePath), missing: true } : null;
    if (error instanceof SyntaxError) return null;
    if (error.code === 'ENOTDIR') return { path: databasePath, name: path.basename(databasePath), missing: true };
    if (databasePath) return { path: databasePath, name: path.basename(databasePath), missing: true };
    return null;
  }
}

function isCancelled(result) { return result.canceled || !result.filePaths?.[0]; }

ipcMain.handle('database:get', readRememberedDatabase);
ipcMain.handle('database:select', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Invoicer database', extensions: ['invoicerdb', 'json'] }] });
  if (isCancelled(result)) return null;
  const selectedPath = result.filePaths[0];
  const content = await fs.readFile(selectedPath, 'utf8');
  await rememberDatabase(selectedPath);
  return { path: selectedPath, name: path.basename(selectedPath), content };
});
ipcMain.handle('database:choose-save', async () => {
  const result = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('documents'), 'Invoicer-Database.invoicerdb'), filters: [{ name: 'Invoicer database', extensions: ['invoicerdb'] }] });
  if (result.canceled || !result.filePath) return null;
  return { path: result.filePath, name: path.basename(result.filePath) };
});
ipcMain.handle('database:write', async (_event, selectedPath, content) => {
  if (typeof selectedPath !== 'string' || !path.isAbsolute(selectedPath) || typeof content !== 'string') throw new Error('Invalid database save request.');
  await fs.mkdir(path.dirname(selectedPath), { recursive: true });
  await fs.writeFile(selectedPath, content, 'utf8');
  await rememberDatabase(selectedPath);
  return true;
});
ipcMain.handle('database:backup', async (_event, content, suggestedName) => {
  const result = await dialog.showSaveDialog({ defaultPath: path.join(app.getPath('documents'), path.basename(suggestedName || 'Invoicer-Database-Backup.invoicerdb')), filters: [{ name: 'Invoicer database backup', extensions: ['invoicerdb'] }] });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, content, 'utf8');
  return true;
});
ipcMain.handle('database:restore-select', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Invoicer database backup', extensions: ['invoicerdb', 'json'] }] });
  if (isCancelled(result)) return null;
  const selectedPath = result.filePaths[0];
  return { path: selectedPath, name: path.basename(selectedPath), content: await fs.readFile(selectedPath, 'utf8') };
});
ipcMain.handle('database:disconnect', () => rememberDatabase(''));

ipcMain.handle('ewaybill:save-json', async (_event, payload, suggestedName) => {
  if (typeof payload !== 'string' || payload.length > 5_000_000) throw new Error('Invalid e-way bill JSON.');
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('documents'), path.basename(suggestedName || 'ewaybill.json')),
    filters: [{ name: 'JSON file', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, payload, 'utf8');
  return true;
});

ipcMain.handle('print:share-pdf-whatsapp', async (event, options = {}) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || event.sender.isDestroyed()) throw new Error('The document window is no longer available.');
  const safeName = String(options.fileName || 'Invoice')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'Invoice';
  const result = await dialog.showSaveDialog(window, {
    defaultPath: path.join(app.getPath('documents'), `${safeName}.pdf`),
    filters: [{ name: 'PDF document', extensions: ['pdf'] }]
  });
  if (result.canceled || !result.filePath) return { canceled: true };

  const pdf = await event.sender.printToPDF({
    printBackground: true,
    preferCSSPageSize: true,
    pageSize: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });
  await fs.writeFile(result.filePath, pdf);

  const digits = String(options.phone || '').replace(/\D/g, '');
  const phone = digits.length === 10 ? `91${digits}` : digits.length === 11 && digits.startsWith('0') ? `91${digits.slice(1)}` : digits;
  const message = String(options.message || `Please find the attached ${safeName} PDF.`).slice(0, 1000);
  const whatsappUrl = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : 'https://web.whatsapp.com/';
  await shell.openExternal(whatsappUrl);
  return { canceled: false, filePath: result.filePath };
});

const rememberedLoginFile = () => path.join(app.getPath('userData'), 'remembered-login.enc');
ipcMain.handle('login:get-remembered', async () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const encrypted = await fs.readFile(rememberedLoginFile());
    return JSON.parse(safeStorage.decryptString(encrypted));
  } catch { return null; }
});
ipcMain.handle('login:remember', async (_event, credentials) => {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (!credentials || typeof credentials.email !== 'string' || typeof credentials.password !== 'string') throw new Error('Invalid remembered login.');
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(rememberedLoginFile(), safeStorage.encryptString(JSON.stringify({ email: credentials.email, password: credentials.password })));
  return true;
});
ipcMain.handle('login:forget', async () => { try { await fs.unlink(rememberedLoginFile()); } catch (error) { if (error.code !== 'ENOENT') throw error; } return true; });

function createWindow() {
  const window = new BrowserWindow({
    width: 1440, height: 960, minWidth: 900, minHeight: 650,
    backgroundColor: '#f4f7f8',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://wa.me/') || url.startsWith('https://web.whatsapp.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.loadFile(path.join(__dirname, '..', 'outputs', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged && process.platform === 'win32') {
    autoUpdater.checkForUpdates().catch(error => console.error('Application update check failed:', error));
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
