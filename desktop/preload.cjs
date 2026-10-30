const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('invoicerDesktop', Object.freeze({
  getDatabase: () => ipcRenderer.invoke('database:get'),
  selectDatabase: () => ipcRenderer.invoke('database:select'),
  chooseDatabasePath: () => ipcRenderer.invoke('database:choose-save'),
  writeDatabase: (filePath, content) => ipcRenderer.invoke('database:write', filePath, content),
  saveBackup: (content, name) => ipcRenderer.invoke('database:backup', content, name),
  chooseRestoreFile: () => ipcRenderer.invoke('database:restore-select'),
  disconnectDatabase: () => ipcRenderer.invoke('database:disconnect'),
  sharePrintPdfToWhatsApp: (fileName, phone, message) => ipcRenderer.invoke('print:share-pdf-whatsapp', { fileName, phone, message }),
  saveEwaybillJson: (content, name) => ipcRenderer.invoke('ewaybill:save-json', content, name),
  getRememberedLogin: () => ipcRenderer.invoke('login:get-remembered'),
  rememberLogin: credentials => ipcRenderer.invoke('login:remember', credentials),
  forgetLogin: () => ipcRenderer.invoke('login:forget')
}));
