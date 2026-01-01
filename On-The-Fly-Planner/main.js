// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// --- 1. START THE EXISTING BACKEND ---
// This runs your server.js logic inside the Electron process
require('./server.js'); 

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "VFA-Planner",
        icon: path.join(__dirname, 'public/assets/icon.png'), // Add an icon if you have one
        webPreferences: {
            nodeIntegration: false, // Security: Keep true frontend separate
            contextIsolation: true, // Security
            preload: path.join(__dirname, 'preload.js') // Bridge for IPC
        }
    });

    // Load the local server we just started
    mainWindow.loadURL('http://localhost:3000'); 
    
    // Remove default menu for a cleaner look
    mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ==========================================
// SCRIPT INSTALLER LOGIC (IPC)
// ==========================================

// 1. Handle "Select Folder" Dialog
ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Select "Saved Games\\DCS" Folder'
    });
    if (canceled) return null;
    return filePaths[0];
});

// 2. Handle "Install Scripts" Action
ipcMain.handle('install-scripts', async (event, dcsSavedGamesPath) => {
    try {
        const fs = require('fs');
        const path = require('path');

        // 1. DETERMINE SOURCE PATH
        // If in Dev (npm start), path is ./dcs-scripts
        // If in Prod (.exe), path is resources/dcs-scripts
        const isDev = !app.isPackaged;
        const sourceDir = isDev 
            ? path.join(__dirname, 'dcs-scripts') 
            : path.join(process.resourcesPath, 'dcs-scripts');

        // 2. DEFINE DESTINATION PATHS
        // We assume the user selected "C:\Users\Name\Saved Games\DCS"
        const scriptsDir = path.join(dcsSavedGamesPath, 'Scripts');
        const hooksDir = path.join(scriptsDir, 'Hooks');

        // 3. ENSURE FOLDERS EXIST
        if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
        if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

        // 4. INSTALL FILE A: TCP EXPORT (Goes into /Scripts)
        const tcpSource = path.join(sourceDir, 'dcs-tcp-export.lua');
        const tcpDest = path.join(scriptsDir, 'dcs-tcp-export.lua');
        
        if (fs.existsSync(tcpSource)) {
            fs.copyFileSync(tcpSource, tcpDest);
        } else {
            throw new Error("Source file missing: dcs-tcp-export.lua");
        }

        // 5. INSTALL FILE B: WEB VIEWER HOOK (Goes into /Scripts/Hooks)
        const hookSource = path.join(sourceDir, 'dcs-otfp-hook-api.lua');
        const hookDest = path.join(hooksDir, 'dcs-otfp-hook-api.lua');

        if (fs.existsSync(hookSource)) {
            fs.copyFileSync(hookSource, hookDest);
        } else {
            throw new Error("Source file missing: dcs-otfp-hook-api.lua");
        }

        // 6. EDIT Export.lua (Only needed for the TCP Export)
        // The Hook file (file B) loads automatically because it's in the Hooks folder.
        // The TCP file (file A) needs a manual entry in Export.lua.
        const exportLuaPath = path.join(scriptsDir, 'Export.lua');
        const includeLine = `local tcpExport=require('lfs');dofile(tcpExport.writedir()..'Scripts/dcs-tcp-export.lua')`;

        // Create or Append
        if (!fs.existsSync(exportLuaPath)) {
            fs.writeFileSync(exportLuaPath, includeLine);
        } else {
            let content = fs.readFileSync(exportLuaPath, 'utf8');
            if (!content.includes('dcs-tcp-export.lua')) {
                fs.appendFileSync(exportLuaPath, '\n' + includeLine);
            }
        }

        return { success: true, message: "Scripts installed successfully!" };

    } catch (error) {
        console.error(error);
        return { success: false, message: error.message };
    }
});

// 3. Handle "Save Image" Action
ipcMain.handle('save-image', async (event, { folder, filename, imageData }) => {
    try {
        if (!fs.existsSync(folder)) {
            // Optional: Create folder if it doesn't exist?
            // fs.mkdirSync(folder, { recursive: true });
            return { success: false, message: "Folder does not exist" };
        }

        // Remove header from base64 string (data:image/png;base64,...)
        const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
        const filePath = path.join(folder, filename);

        fs.writeFileSync(filePath, base64Data, 'base64');
        
        return { success: true, message: `Saved to ${filename}` };

    } catch (error) {
        return { success: false, message: error.message };
    }
});

// 4. Handle "Uninstall Scripts" Action
ipcMain.handle('uninstall-scripts', async (event, dcsSavedGamesPath) => {
    try {
        const fs = require('fs');
        const path = require('path');

        const scriptsDir = path.join(dcsSavedGamesPath, 'Scripts');
        const hooksDir = path.join(scriptsDir, 'Hooks');
        const exportLuaPath = path.join(scriptsDir, 'Export.lua');

        let logs = [];

        // 1. Remove TCP Export Script
        const tcpFile = path.join(scriptsDir, 'dcs-tcp-export.lua');
        if (fs.existsSync(tcpFile)) {
            fs.unlinkSync(tcpFile);
            logs.push("Removed: dcs-tcp-export.lua");
        }

        // 2. Remove OTFP Hook
        const hookFile = path.join(hooksDir, 'dcs-otfp-hook-api.lua');
        if (fs.existsSync(hookFile)) {
            fs.unlinkSync(hookFile);
            logs.push("Removed: dcs-otfp-hook-api.lua");
        }

        // 3. Clean Export.lua
        if (fs.existsSync(exportLuaPath)) {
            let content = fs.readFileSync(exportLuaPath, 'utf8');
            const targetLine = `local tcpExport=require('lfs');dofile(tcpExport.writedir()..'Scripts/dcs-tcp-export.lua')`;
            
            if (content.includes(targetLine)) {
                // Remove the line and trim extra whitespace
                const newContent = content.replace(targetLine, '').replace(/^\s*[\r\n]/gm, '');
                fs.writeFileSync(exportLuaPath, newContent);
                logs.push("Cleaned: Export.lua");
            }
        }

        return { success: true, message: "Uninstall Complete. Files removed." };

    } catch (error) {
        return { success: false, message: error.message };
    }
});

// 5. Handle "Punch Waypoints" Trigger
ipcMain.handle('trigger-waypoint-punch', async () => {
    try {
        console.log("IPC: Waypoint Punch Requested");
        
        // We tell the frontend (the website) to emit the socket signal
        // This keeps the logic contained in server.js
        mainWindow.webContents.send('punch-waypoint-signal');
        
        return { success: true, message: "Punch sequence initiated..." };
    } catch (error) {
        return { success: false, message: error.message };
    }
});