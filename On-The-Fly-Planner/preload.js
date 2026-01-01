const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    installScripts: (path) => ipcRenderer.invoke('install-scripts', path),
    saveImage: (data) => ipcRenderer.invoke('save-image', data),
    uninstallScripts: (path) => ipcRenderer.invoke('uninstall-scripts', path),
    
    // Waypoint Punching Bridge
    punchWaypoints: () => ipcRenderer.invoke('trigger-waypoint-punch'),
    onPunchSignal: (callback) => ipcRenderer.on('punch-waypoint-signal', () => callback())
});