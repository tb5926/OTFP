const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require("socket.io");
const net = require('net');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// VFA-PLANNER PUNCHER (V2.0 - CORRECTED MAPPING)
// ==========================================
const PUNCH_PORT = 10102; 
const AMPCD = 37;    
const UFC_DEV = 25;  

const BTN = {
    'MENU': 3028, 'TOGGLE': 3020, 'UFC_SEL': 3015, 'WP_INC': 3022,  
    'ENT': 3029, 'CLR': 3028, 'OPT1_LAT': 3010, 'OPT3_ELEV': 3012, 'FEET_SEL': 3010
};

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
let currentRouteState = null;

// --- 1. WEB CLIENT CONNECTION ---
io.on('connection', (socket) => {
    console.log('Web Interface Connected');

    // A. IMMEDIATE SYNC
    if (currentRouteState) {
        socket.emit('externalRouteUpdate', currentRouteState);
    }

    // B. SYNC RELAY
    socket.on('syncRoute', (data) => {
        currentRouteState = data;
        socket.broadcast.emit('externalRouteUpdate', data);
    });
    
    // --- WAYPOINT PUNCHER LISTENER (Fixed Spam) ---
    socket.on('startWaypointPunch', async (data) => {
        console.log("\n>>> STARTING PUNCH SEQUENCE");
        
        const waypoints = data; 
        if (!waypoints || waypoints.length === 0) return;

        try {
            // 1. Initial Setup
            await press(UFC_DEV, BTN.CLR, "CLR UFC");
            await press(AMPCD, BTN.TOGGLE, "TOGGLE TO DATA"); 
            await sleep(500);

            // Send Status ONCE
            socket.emit('punchStatus', 'Data Transmitting...');

            for (const wp of waypoints) {
                // Loop quietly (Server Logs only)
                console.log(`Punching: ${wp.name}`);

                const lat = getPreciseParts(wp.lat, false);
                const lon = getPreciseParts(wp.long, true);

                // 3. Open POSN Page
                await press(AMPCD, BTN.UFC_SEL, "UFC SELECT"); 

                // 4. LATITUDE
                await press(UFC_DEV, BTN.OPT1_LAT, "LAT SELECT"); 
                await press(UFC_DEV, wp.lat >= 0 ? 3020 : 3026, wp.lat >= 0 ? "N" : "S"); 
                await typeString(lat.main);
                await press(UFC_DEV, BTN.ENT);
                await typeString(lat.precise);
                await press(UFC_DEV, BTN.ENT);

                // 5. LONGITUDE
                await press(UFC_DEV, wp.long >= 0 ? 3024 : 3022, wp.long >= 0 ? "E" : "W"); 
                await typeString(lon.main);
                await press(UFC_DEV, BTN.ENT);
                await typeString(lon.precise);
                await press(UFC_DEV, BTN.ENT);

                // 6. ELEVATION
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

// --- 2. DCS TELEMETRY LISTENER ---
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

// ==========================================
// API BRIDGE (Proxy for DCS Hook)
// ==========================================
app.get('/api/mission-path', (req, res) => {
    const httpLib = require('http');
    const request = httpLib.get('http://127.0.0.1:58080/mission-path', (dcsRes) => {
        let data = '';
        dcsRes.on('data', (chunk) => data += chunk);
        dcsRes.on('end', () => {
            try { res.json(JSON.parse(data)); } 
            catch (e) { res.status(500).json({ error: "Invalid JSON from DCS" }); }
        });
    });
    request.on('error', (err) => {
        res.status(504).json({ error: "DCS Hook not reachable. Is DCS running?" });
    });
    request.setTimeout(2000, () => request.destroy());
});

// Start Servers
dcsServer.listen(3001, () => console.log('DCS Telemetry Listener: 3001'));
server.listen(3000, () => console.log('Web Interface: http://localhost:3000'));

// --- 3. POLLING BRIDGES (Hook -> Server) ---
const httpLib = require('http');

// Poll Mission Data (Weather/Briefing)
setInterval(() => {
    httpLib.get('http://127.0.0.1:58080/mission-data', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => { try { io.emit('weatherBriefing', JSON.parse(data)); } catch (e) {} });
    }).on('error', () => {});
}, 5000);

// Poll Payload (Weapons)
setInterval(() => {
    httpLib.get('http://127.0.0.1:58080/payload-info', (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => { try { io.emit('hookPayload', JSON.parse(data)); } catch (e) {} });
    }).on('error', () => {});
}, 5000);