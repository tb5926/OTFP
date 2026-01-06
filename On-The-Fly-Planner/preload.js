const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
    installScripts: (path) => ipcRenderer.invoke('install-scripts', path),
    saveImage: (data) => ipcRenderer.invoke('save-image', data),
    uninstallScripts: (path) => ipcRenderer.invoke('uninstall-scripts', path),
    
    // Waypoint Punching Bridge
    punchWaypoints: () => ipcRenderer.invoke('trigger-waypoint-punch'),
    onPunchSignal: (callback) => ipcRenderer.on('punch-waypoint-signal', () => callback()),

    // NEW UPDATE FUNCTIONS
    checkUpdate: () => ipcRenderer.invoke('check-for-update'),
    openUrl: (url) => ipcRenderer.invoke('open-url', url),
    uninstallApp: () => ipcRenderer.invoke('trigger-self-uninstall'),
    readFile: (path) => ipcRenderer.invoke('read-file', path),
    findLatestTrack: (dcsPath) => ipcRenderer.invoke('find-latest-track', dcsPath)
});