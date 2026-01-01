const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const net = require('net');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// VFA-PLANNER PUNCHER (V2.0 - CORRECTED MAPPING)
// ==========================================
const PUNCH_PORT = 10102; 
const AMPCD = 37;    
const UFC_DEV = 25;  

const BTN = {
    // AMPCD (Center Screen)
    'MENU': 3028,    
    'TOGGLE': 3020,  
    'UFC_SEL': 3015, 
    'WP_INC': 3022,  
    
    // UFC (Numpad Unit)
    'ENT': 3029,     
    'CLR': 3028,
    'OPT1_LAT': 3010, // Option 1: Latitude / POSN access
    'OPT3_ELEV': 3012,// Option 3: Elevation -> CORRECTED
    'FEET_SEL': 3010  // Option 1 inside Elevation menu
};

// UFC Digit Mapping (0=3018, 1=3019...)
function getDigitBtn(d) {
    const digit = parseInt(d);
    return 3018 + digit; 
}

function getPreciseParts(val, isLon) {
    const abs = Math.abs(val);
    let deg = Math.floor(abs);
    let minFull = (abs - deg) * 60;
    let minWhole = Math.floor(minFull);
    let minDec = Math.round((minFull - minWhole) * 10000);

    if (minDec >= 10000) { minDec = 0; minWhole += 1; }
    if (minWhole >= 60) { minWhole = 0; deg += 1; }

    return {
        main: deg.toString().padStart(isLon ? 3 : 2, '0') + minWhole.toString().padStart(2, '0'),
        precise: minDec.toString().padStart(4, '0')
    };
}

function sendToCockpit(msg) {
    const client = new net.Socket();
    client.connect(PUNCH_PORT, '127.0.0.1', () => {
        client.write(msg + '\n');
        client.end();
    });
    client.on('error', () => {}); 
}

async function press(dev, btnId, label = "") {
    console.log(`   [${dev === 25 ? "UFC" : "AMPCD"}] Pressing: ${btnId} ${label ? "(" + label + ")" : ""}`);
    sendToCockpit(`${dev}:${btnId}:1`);
    await sleep(150); 
    sendToCockpit(`${dev}:${btnId}:0`);
    await sleep(400); 
}

async function typeString(str) {
    for (let d of str) {
        await press(UFC_DEV, getDigitBtn(d), d);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- GLOBAL ROUTE STATE ---
// Stores the latest route so new connections (Web App) get it immediately
let currentRouteState = null;

// --- 1. WEB CLIENT CONNECTION ---
io.on('connection', (socket) => {
    console.log('Web Interface Connected');

    // A. IMMEDIATE SYNC: If we have a route in memory, send it to the new guy
    if (currentRouteState) {
        socket.emit('externalRouteUpdate', currentRouteState);
    }

    // B. SYNC RELAY
    socket.on('syncRoute', (data) => {
        // 1. Update Server Memory
        currentRouteState = data;
        
        // 2. Broadcast to everyone else (Desktop <-> Web App)
        socket.broadcast.emit('externalRouteUpdate', data);
    });
    
    socket.on('manualClick', (data) => {
        sendToCockpit(`${data.device}:${data.button}:1`);
        setTimeout(() => sendToCockpit(`${data.device}:${data.button}:0`), 150);
    });

    // --- WAYPOINT PUNCHER LISTENER ---
    socket.on('startWaypointPunch', async (data) => {
        console.log("\n>>> STARTING PUNCH SEQUENCE");
        
        // 1. Receive data directly from App (No file reading needed)
        const waypoints = data; 

        if (!waypoints || waypoints.length === 0) {
            console.log("No waypoints provided.");
            return;
        }

        try {
            // 2. Initial Setup: HSI to DATA Toggle
            await press(UFC_DEV, BTN.CLR, "CLR UFC");
            await press(AMPCD, BTN.TOGGLE, "TOGGLE TO DATA"); 
            await sleep(500);

            for (const wp of waypoints) {
                // Tell frontend which WP we are working on
                //socket.emit('punchStatus', `Entered: ${wp.name}`);
                
                const lat = getPreciseParts(wp.lat, false);
                const lon = getPreciseParts(wp.long, true);

                // 3. Open POSN Page
                await press(AMPCD, BTN.UFC_SEL, "UFC SELECT"); 

                // 4. LATITUDE (Option 1 -> Hemisphere -> Digits)
                await press(UFC_DEV, BTN.OPT1_LAT, "LAT SELECT"); 
                await press(UFC_DEV, wp.lat >= 0 ? 3020 : 3026, wp.lat >= 0 ? "N" : "S"); 
                await typeString(lat.main);
                await press(UFC_DEV, BTN.ENT);
                await typeString(lat.precise);
                await press(UFC_DEV, BTN.ENT);

                // 5. LONGITUDE (Hemisphere -> Digits)
                await press(UFC_DEV, wp.long >= 0 ? 3024 : 3022, wp.long >= 0 ? "E" : "W"); 
                await typeString(lon.main);
                await press(UFC_DEV, BTN.ENT);
                await typeString(lon.precise);
                await press(UFC_DEV, BTN.ENT);

                // 6. ELEVATION (Option 3 -> Option 1 -> Digits)
                // Ensure elevation is an integer for typing
                const elevFeet = Math.round(wp.elev); 
                await press(UFC_DEV, BTN.OPT3_ELEV, "ELEV SELECT"); 
                await press(UFC_DEV, BTN.FEET_SEL, "FEET"); 
                await typeString(elevFeet.toString());
                await press(UFC_DEV, BTN.ENT);

                // 7. INCREMENT WAYPOINT
                await press(AMPCD, BTN.WP_INC, "NEXT WP"); 
                await press(AMPCD, BTN.UFC_SEL, "UFC RE-SELECT"); 
                await sleep(800); 
            }
            
            // 8. Cleanup
            await press(AMPCD, BTN.TOGGLE, "TOGGLE TO HSI");
            await press(UFC_DEV, BTN.CLR, "CLR UFC");

            socket.emit('punchStatus', 'Complete');
            console.log(">>> PUNCH COMPLETE\n");

        } catch (err) {
            console.error(err);
            socket.emit('punchStatus', 'Error');
        }
    });
});

// Telemetry and Bridges (Omitted for brevity, keep your existing ones)

// --- 2. DCS TELEMETRY LISTENER (Game -> Server) ---
const dcsServer = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (data) => {
        buffer += data.toString();
        let dcsIndex;
        while ((dcsIndex = buffer.indexOf('\n')) !== -1) {
            const message = buffer.substring(0, dcsIndex);
            buffer = buffer.substring(dcsIndex + 1);
            try {
                const jsonData = JSON.parse(message);
                io.emit('dcsUpdate', jsonData);
            } catch (e) {}
        }
    });
});

dcsServer.listen(3001, () => console.log('DCS Telemetry Listener: 3001'));
server.listen(3000, () => console.log('Web Interface: http://localhost:3000'));

// --- 3. POLLING BRIDGES (Hook -> Server) ---
const httpLib = require('http');
setInterval(() => {
    httpLib.get('http://127.0.0.1:58080/mission-data', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => { try { io.emit('weatherBriefing', JSON.parse(data)); } catch (e) {} });
    }).on('error', () => {});
}, 5000);

setInterval(() => {
    httpLib.get('http://127.0.0.1:58080/payload-info', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => { try { io.emit('hookPayload', JSON.parse(data)); } catch (e) {} });
    }).on('error', () => {});
}, 5000);

function fetchPayloadData() {
    httpLib.get('http://127.0.0.1:58080/payload-info', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
            try { io.emit('hookPayload', JSON.parse(data)); } catch (e) {}
        });
    }).on('error', () => {});
}
setInterval(fetchPayloadData, 5000);