const socket = io();

// --- STATE ---
let map;
let waypoints = []; 
let flightPath;
let legLabels = []; 
let tempClickCoords = null; 
let dragSrcEl = null;
let currentFocusIndex = -1;
let flightHistoryPts = [];
let historyPolyline = null;
let isFollowMode = false;
let useStatute = false; 
let latestDcsPayload = null;
let latestDcsMech = null;
let latestMissionData = null;
let liveRadioMap = {};
let currentOwnship = null;
let cachedMissionRoute = null;
let lastLoadedMissionName = "";
let showThreatRings = false;
let isPunching = false;

// Fuel State
let fuelState = {
    start: 10800,
    joker: 3500,
    bingo: 2500,
    max: 10800 
};

// Default F/A-18C Comm Presets
const DEFAULT_COMMS = {
    c1: [
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, 
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, 
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"},
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"},
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}
    ],
    c2: [
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, 
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, 
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"},
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"},
        {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}, {n:"", f:"000.000"}
    ]
};

// --- THREAT DATABASE (DCS Defaults) ---
// Ceiling in Feet (AGL)
const SAM_DB = {
    // LORAD
    "S-300": { type: "LORAD", ceil: 90000 },
    "SA-10": { type: "LORAD", ceil: 90000 },
    "PATRIOT": { type: "LORAD", ceil: 80000 },
    "HQ-9": { type: "LORAD", ceil: 90000 },
    "SA-5": { type: "LORAD", ceil: 100000 },
    // MERAD
    "SA-11": { type: "MERAD", ceil: 70000 },    
    "BUK": { type: "MERAD", ceil: 70000 },
    "SA-6": { type: "MERAD", ceil: 45000 },
    "KUB": { type: "MERAD", ceil: 45000 },
    "HAWK": { type: "MERAD", ceil: 45000 },
    "SNR_75V": { type: "MERAD", ceil: 40000 },
    "SA-3": { type: "MERAD", ceil: 40000 },
    "SA-17": { type: "MERAD", ceil: 50000 },
    // SHORAD
    "SA-15": { type: "SHORAD", ceil: 20000 },
    "TOR": { type: "SHORAD", ceil: 20000 },
    "SA-8": { type: "SHORAD", ceil: 16000 },
    "OSA": { type: "SHORAD", ceil: 16000 },
    "SA-19": { type: "SHORAD", ceil: 26000 },
    "TUNGUSKA": { type: "SHORAD", ceil: 26000 },
    "SA-22": { type: "SHORAD", ceil: 49000 },
    "PANTSIR": { type: "SHORAD", ceil: 49000 },
    "ROLAND": { type: "SHORAD", ceil: 16000 },
    "AVENGER": { type: "SHORAD", ceil: 10000 },
    "CHAPARRAL": { type: "SHORAD", ceil: 10000 },
    "SA-13": { type: "SHORAD", ceil: 10000 },
    "STRELA": { type: "SHORAD", ceil: 10000 },
    "SA-9": { type: "SHORAD", ceil: 10000 },
    // AAA
    "ZSU-23": { type: "AAA", ceil: 8000 },
    "ZSU_57_2": { type: "AAA", ceil: 8000 },
    "SHILKA": { type: "AAA", ceil: 6000 },
    "GEPARD": { type: "AAA", ceil: 9000 },
    "VULCAN": { type: "AAA", ceil: 5000 },
    "SERGEY": { type: "AAA", ceil: 8000 },
    "BMP-2": { type: "AAA", ceil: 8000 },
    "BMP-3": { type: "AAA", ceil: 8000 },
    "BOFORS40": { type: "AAA", ceil: 8000 },
    "ZU-23": { type: "AAA", ceil: 8000 }
};

// Filter State
let threatFilters = {
    "LORAD": true,
    "MERAD": true,
    "SHORAD": true,
    "AAA": true,
    "ARMOR": true,
    "NAVAL": true
};

// Task Filter State
const POSSIBLE_TASKS = [
    "Refueling", "AWACS", "CAS", "CAP", "SEAD", 
    "Ground Attack", "Pinpoint Strike", "Runway Attack", 
    "Anti-Ship", "Antiship Strike", "Escort", "Transport", "Reconnaissance", 
    "AFAC", "Fighter Sweep", "Intercept", "Nothing"
];

// Default: All Checked
let taskFilters = {};
POSSIBLE_TASKS.forEach(t => taskFilters[t] = true);


// Expanded Weather State
let weatherState = {
    windDir: 0, // Fallback
    windSpd: 0, // Fallback
    layers: {   // Specific Layers from DCS
        ground: { spd: 0, dir: 0 },
        2000:   { spd: 0, dir: 0 },
        8000:   { spd: 0, dir: 0 }
    }
};

let coordFormat = 'DDM'; 

// --- COORDINATE MATH HELPERS ---
const CoordConverter = {
    // 1. DD
    toDD: (lat, lon) => {
        return `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`;
    },

    // 2. DDM
    toDDM: (lat, lon) => {
        const format = (val, isLat) => {
            const dir = val >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
            const abs = Math.abs(val);
            const deg = Math.floor(abs);
            const min = (abs - deg) * 60;
            const minStr = min < 10 ? "0" + min.toFixed(4) : min.toFixed(4);
            return `${dir} ${deg}° ${minStr}'`;
        };
        return `${format(lat, true)}, ${format(lon, false)}`;
    },

    // 3. DMS
    toDMS: (lat, lon) => {
        const format = (val, isLat) => {
            const dir = val >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
            const abs = Math.abs(val);
            const deg = Math.floor(abs);
            const minFloat = (abs - deg) * 60;
            const min = Math.floor(minFloat);
            const sec = ((minFloat - min) * 60).toFixed(1);
            const minStr = min < 10 ? "0" + min : min;
            const secStr = sec < 10 ? "0" + sec : sec;
            return `${dir} ${deg}° ${minStr}' ${secStr}"`;
        };
        return `${format(lat, true)}, ${format(lon, false)}`;
    },

    // 4. MGRS
    toMGRS: (lat, lon, precision) => {
        try {
            const raw = MGRS_Lib.toMGRS(lat, lon);
            if (raw.includes("Too far")) return raw;
            const parts = raw.split(' ');
            if (parts.length < 4) return raw; 

            if (precision === '6') {
                const east = parts[2].substring(0, 3);
                const north = parts[3].substring(0, 3);
                return `${parts[0]} ${parts[1]} ${east} ${north}`;
            } else {
                return raw;
            }
        } catch (e) { return "MGRS ERR"; }
    },

    // 5. UTM (NEW)
    toUTM: (lat, lon) => {
        try {
            // Call the function from utm-converter.js
            const u = DegreesToUTM(lat, lon);
            // Format: 11N 550000 4200000
            return `${u.zone}${u.hemi} ${u.easting} ${u.northing}`;
        } catch (e) { return "UTM ERR"; }
    }
};

// --- TIME HELPERS ---
const TimeMath = {
    // Convert HH:MM:SS to Seconds from midnight
    timeToSec: (str) => {
        if(!str) return 0;
        const p = str.split(':').map(Number);
        return (p[0] * 3600) + (p[1] * 60) + (p[2] || 0);
    },
    // Convert Seconds to HH:MM:SS
    secToTime: (totalSec) => {
        let s = totalSec % 86400; // Wrap 24h
        if(s < 0) s += 86400;
        const h = Math.floor(s / 3600).toString().padStart(2, '0');
        const m = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
        const sec = Math.floor(s % 60).toString().padStart(2, '0');
        return `${h}:${m}:${sec}`;
    },
    // Parse MM:SS input for Hold Time
    parseHold: (str) => {
        if(!str) return 0;
        if(str.includes(':')) {
            const p = str.split(':').map(Number);
            return (p[0] * 60) + p[1];
        }
        return parseInt(str) || 0; // Assume seconds if just a number
    },
    // Format Hold Seconds to MM:SS
    formatHold: (sec) => {
        if(!sec) return "00:00";
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }
};

// Station Arms (Distance from Centerline in ft)
const STATION_ARMS = {
    1: 19.5, 2: 11.2, 3: 7.3, 4: 3.1, 
    5: 0.0, 
    6: 3.1, 7: 7.3, 8: 11.2, 9: 19.5
};

const GeoMath = {
    toRad: (deg) => deg * Math.PI / 180,
    toDeg: (rad) => rad * 180 / Math.PI,
    getBearing: (lat1, lon1, lat2, lon2) => {
        const dLon = GeoMath.toRad(lon2 - lon1);
        const y = Math.sin(dLon) * Math.cos(GeoMath.toRad(lat2));
        const x = Math.cos(GeoMath.toRad(lat1)) * Math.sin(GeoMath.toRad(lat2)) -
                  Math.sin(GeoMath.toRad(lat1)) * Math.cos(GeoMath.toRad(lat2)) * Math.cos(dLon);
        let brng = GeoMath.toDeg(Math.atan2(y, x));
        return (brng + 360) % 360; 
    },
    getMagVar: (lon) => {
        if(lon < -100) return 12.0; 
        return 6.0;
    }
};

// Updated Ground Speed with Layer Logic
function calculateGroundSpeed(tas, heading, defaultSpd, defaultDir, altitude = 0) {
    // Determine which wind layer to use based on altitude
    let windSpd = weatherState.layers.ground.spd;
    let windDir = weatherState.layers.ground.dir;

    if (altitude >= 6000) {
        // Use 8k wind for anything high
        windSpd = weatherState.layers[8000].spd;
        windDir = weatherState.layers[8000].dir;
    } else if (altitude >= 1500) {
        // Use 2k wind for mid-low
        windSpd = weatherState.layers[2000].spd;
        windDir = weatherState.layers[2000].dir;
    }

    // Fallback if data is missing (0)
    if (windSpd === 0 && defaultSpd > 0) {
        windSpd = defaultSpd;
        windDir = defaultDir;
    }

    // Calculation
    const windRad = GeoMath.toRad(windDir);
    const hdgRad = GeoMath.toRad(heading);
    
    // "From" direction -> vector pushing plane
    const windCourseRad = windRad + Math.PI; 
    
    const angleDiff = windCourseRad - hdgRad;
    const groundVector = windSpd * Math.cos(angleDiff);
    
    let gs = tas + groundVector;
    if(gs < 0) gs = 0; 
    
    return Math.round(gs);
}

document.addEventListener('DOMContentLoaded', () => {
    // --- CHECK FOR KNEEBOARD MODE ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mode') === 'kneeboard') {
        document.body.classList.add('kb-mode');
        
        // Force the dashboard panel visible so the map renders
        document.getElementById('dashboard-panel').style.display = 'block';
        
        // Slight delay to fix Leaflet size after going full screen
        setTimeout(() => {
            if(map) map.invalidateSize();
        }, 500);
    }

    initComms();
    initLoadoutMenu();
    initTaskFilterMenu();
    initThreatFilterMenu();
    initMap();
    setupAccordions();
    setupModalListeners();
    setupTableExpansionListener();
    setupSettings(); 
    setupLoadoutListeners(); 
    setupConfirmListeners();
    initSetupListeners();
    // Fuel Control Listeners (Weapons Header)
    const fuelInput = document.getElementById('total-fuel-input');
    const fuelSlider = document.getElementById('fuel-slider');

    // Sync Slider -> Input
    fuelSlider.addEventListener('input', (e) => {
        fuelInput.value = e.target.value;
        runFuelCalc(); 
    });

    // Sync Input -> Slider
    fuelInput.addEventListener('change', (e) => {
        let val = parseFloat(e.target.value);
        let max = parseFloat(fuelSlider.max);
        if(val > max) val = max;
        if(val < 0) val = 0;
        
        fuelInput.value = val;
        fuelSlider.value = val;
        runFuelCalc();
    });


    // Nav Dashboard Listeners
    document.getElementById('taxi-fuel').addEventListener('change', runFuelCalc);
    document.getElementById('joker-fuel').addEventListener('change', runFuelCalc);
    document.getElementById('bingo-fuel').addEventListener('change', runFuelCalc);

    setTimeout(() => {
        loadData();
        checkSetupState(); // <--- ADD THIS HERE
    }, 500); 
});

// --- SOCKET CONNECTION ---
socket.on('connect', () => { updateStatus(true); });
socket.on('disconnect', () => { updateStatus(false); });

function updateStatus(isOnline) {
    const txt = document.getElementById('connection-text');
    const dot = document.getElementById('connection-dot');
    if(txt && dot) {
        if(isOnline) {
            txt.innerText = "System Online"; txt.style.color = "#2ecc71"; dot.style.backgroundColor = "#2ecc71";
        } else {
            txt.innerText = "DCS Disconnected"; txt.style.color = "#a0a0a0"; dot.style.backgroundColor = "#e74c3c";
        }
    }
}

function saveData() {
    // 1. Waypoints
    const wpData = waypoints.map(wp => ({
        lat: wp.marker.getLatLng().lat,
        lng: wp.marker.getLatLng().lng,
        data: wp.data
    }));

    // 2. Loadout
    const loadoutData = {};
    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) loadoutData[`stn-${i}`] = el.value;
    }

    // 3. Comms
    // Initialize with notes field
    const commsData = { c1: [], c2: [], notes: "" }; 

    // Scrape Comm 1 (Save as Objects {n, f})
    const c1Rows = document.getElementById('comm1-container').children;
    for(let item of c1Rows) {
        commsData.c1.push({
            n: item.querySelector('.comm-name').value,
            f: item.querySelector('.comm-freq').value
        });
    }

    // Scrape Comm 2 (Save as Objects {n, f})
    const c2Rows = document.getElementById('comm2-container').children;
    for(let item of c2Rows) {
        commsData.c2.push({
            n: item.querySelector('.comm-name').value,
            f: item.querySelector('.comm-freq').value
        });
    }

    // Save Notes
    const noteEl = document.getElementById('comm-notes');
    if(noteEl) commsData.notes = noteEl.value;

    // --- DELETED LINES HERE ---
    // You had lines here doing querySelectorAll...push(inp.value). 
    // They were duplicates and are now removed.

    // 4. Settings
    const settings = { 
        useStatute: useStatute,
        cvDeparture: document.getElementById('cv-depart-check').checked,
        coordFormat: document.getElementById('coord-format-select') ? document.getElementById('coord-format-select').value : 'DDM'
    };

    // 5. Fuel Settings
    const fuelSettings = {
        start: document.getElementById('total-fuel-input').value,
        taxi: document.getElementById('taxi-fuel').value,
        joker: document.getElementById('joker-fuel').value,
        bingo: document.getElementById('bingo-fuel').value
    };

    const kbPath = kneeboardPath || localStorage.getItem('kneeboardPath') || "";

    const fullState = { 
        wpData, 
        loadoutData, 
        commsData, 
        settings, 
        fuelSettings, 
        taskFilters, 
        threatFilters,
        cachedMissionRoute,
        kneeboardPath: kbPath // <--- SAVE IT HERE
    };
    
    localStorage.setItem('dcsPlannerState', JSON.stringify(fullState));
}

function loadData() {
    const raw = localStorage.getItem('dcsPlannerState');
    if(!raw) return;

    const state = JSON.parse(raw);

    // Restore Settings
    if(state.settings) {
        useStatute = state.settings.useStatute || false;
        const toggle = document.getElementById('unit-toggle');
        if(toggle) toggle.checked = useStatute;

        const cvCheck = document.getElementById('cv-depart-check');
        if(cvCheck) cvCheck.checked = state.settings.cvDeparture || false;
        if (state.settings.coordFormat) {
            coordFormat = state.settings.coordFormat;
            document.getElementById('coord-format-select').value = coordFormat;
        }
    }

    if (state.threatFilters) {
        threatFilters = state.threatFilters;
        initThreatFilterMenu();
    }

    // --- ADD THIS BLOCK: RESTORE TASK FILTERS ---
    if (state.taskFilters) {
        taskFilters = state.taskFilters;
        // Re-initialize the menu to visually check/uncheck the boxes based on loaded data
        initTaskFilterMenu();
    }

    // Restore Saved Route Data
    if (state.cachedMissionRoute) {
        cachedMissionRoute = state.cachedMissionRoute;
        console.log("Restored cached route:", cachedMissionRoute.length, "points.");
    }

    // Restore Fuel Settings
    if(state.fuelSettings) {
        const fuelInput = document.getElementById('total-fuel-input');
        fuelInput.value = state.fuelSettings.start;
        document.getElementById('fuel-slider').value = state.fuelSettings.start;
        
        // Removed reference to 'start-fuel' (old ID)
        document.getElementById('taxi-fuel').value = state.fuelSettings.taxi || 800; 
        document.getElementById('joker-fuel').value = state.fuelSettings.joker;
        document.getElementById('bingo-fuel').value = state.fuelSettings.bingo;
        
        fuelState.start = parseFloat(state.fuelSettings.start);
        fuelState.joker = parseFloat(state.fuelSettings.joker);
        fuelState.bingo = parseFloat(state.fuelSettings.bingo);
        fuelState.max = fuelState.start;
    }

    // Restore Loadout
    if(state.loadoutData) {
        for(const [id, val] of Object.entries(state.loadoutData)) {
            const el = document.getElementById(id);
            if(el) {
                el.value = val;
            }
        }
    }

    // Restore Comms
    const inputs1 = document.querySelectorAll('#comm1-container input');
    const inputs2 = document.querySelectorAll('#comm2-container input');

     if(state.commsData) {
        const updateCols = (containerId, dataList) => {
            const container = document.getElementById(containerId);
            if(!container || !dataList) return;
            const rows = container.children;
            
            // Loop through saved data, up to 20
            for(let i=0; i<20; i++) {
                if(dataList[i] && rows[i]) {
                    // Check if old save format (just string) or new (object)
                    if(typeof dataList[i] === 'object') {
                        rows[i].querySelector('.comm-name').value = dataList[i].n || "";
                        rows[i].querySelector('.comm-freq').value = dataList[i].f || "";
                    } else {
                        // Legacy support: if old save file had just freq string
                        rows[i].querySelector('.comm-freq').value = dataList[i];
                    }
                }
            }
        };

        updateCols('comm1-container', state.commsData.c1);
        updateCols('comm2-container', state.commsData.c2);
	const noteEl = document.getElementById('comm-notes');
        if(noteEl && state.commsData.notes) {
            noteEl.value = state.commsData.notes;
        }
    }

    // Restore Waypoints
    if(state.wpData && state.wpData.length > 0) {
        resetNavigation(null, false); 
        state.wpData.forEach(wp => {
            tempClickCoords = { lat: wp.lat, lng: wp.lng };
            addWaypoint(wp.data, false); 
        });
    }


    // --- RESTORE KNEEBOARD PATH ---
    if (state.kneeboardPath) {
        kneeboardPath = state.kneeboardPath;
        const kbDisplay = document.getElementById('kneeboard-path-display');
        if(kbDisplay) kbDisplay.value = kneeboardPath;
        
        // Also ensure individual local storage key matches for redundancy
        localStorage.setItem('kneeboardPath', kneeboardPath);
    }
    // Fallback: Check old individual key if main state is empty
    else {
        const oldKey = localStorage.getItem('kneeboardPath');
        if(oldKey) {
            kneeboardPath = oldKey;
            const kbDisplay = document.getElementById('kneeboard-path-display');
            if(kbDisplay) kbDisplay.value = oldKey;
        }
    }

    // Trigger initial calc
    runFuelCalc();
    
    // *** NEW: PUSH STATE TO SERVER ***
    // This primes the server so when you open the Web App, it receives this route instantly.
    setTimeout(() => {
        broadcastRouteState();
    }, 1000); // Small delay to ensure everything is rendered first
}

function runFuelCalc(forceRender = false) {
    // 1. Get Inputs
    fuelState.start = parseFloat(document.getElementById('total-fuel-input').value) || 10800;
    
    let taxiInput = document.getElementById('taxi-fuel');
    let taxiFuel = parseFloat(taxiInput.value);
    if (isNaN(taxiFuel)) taxiFuel = 800;
    if (taxiFuel < 100) taxiFuel = 100;
    if (taxiFuel > 1200) taxiFuel = 1200;
    
    fuelState.joker = parseFloat(document.getElementById('joker-fuel').value) || 3500;
    fuelState.bingo = parseFloat(document.getElementById('bingo-fuel').value) || 2500;

    const depTimeStr = document.getElementById('depart-time').value;
    let currentTimeSec = TimeMath.timeToSec(depTimeStr);

    const state = calculateAircraftState();
    const dragIndex = state.dragIndex;
    const baseAirframeWeight = 23000; 
    
    let fuelAtTakeoff = fuelState.start - taxiFuel;
    if (fuelAtTakeoff < 0) fuelAtTakeoff = 0; // Clamp

    const internalCap = 10600;
    let rampInternal = Math.min(fuelState.start, internalCap);
    let currentTotalWeight = (baseAirframeWeight + state.storeWeight + rampInternal) - taxiFuel;

    fuelState.max = fuelState.start; 
    let currentFuel = fuelAtTakeoff;
    let totalFlightBurn = 0;

    // 4. Iterate Waypoints
    waypoints.forEach((wp, index) => {
        let legBurn = 0;
        let legTimeSec = 0;
        let groundSpeed = 0;
        let trueAirSpeed = 0;
        
        if (index > 0) {
            const prevWp = waypoints[index - 1];
            const p1 = prevWp.marker.getLatLng();
            const p2 = wp.marker.getLatLng();
            
            const distMeters = p1.distanceTo(p2);
            const distNM = distMeters * 0.000539957;

            let legStartWeight = currentTotalWeight; 
            let legAlt = parseFloat(wp.data.alt) || 0;

            let profile = wp.data.profile;
            if (!profile) {
                profile = 'RANGE';
                if(wp.data.type === 'MOM' || wp.data.type === 'CP' || wp.data.type === 'MARSHALL') {
                    profile = 'ENDURANCE';
                }
                wp.data.profile = profile; 
            }

            let baseBurnRate = FuelCalculator.calculateLegBurn(1, legAlt, legStartWeight, dragIndex, profile);
            let bestMach = FuelCalculator.calculateCruiseMach(legAlt, legStartWeight, dragIndex, profile);
            
            let speedOfSound = 661 - (legAlt / 1000 * 2.44);
            if (speedOfSound < 573) speedOfSound = 573;

            let indicatedSpeed = parseFloat(wp.data.spd) || 350;
            trueAirSpeed = indicatedSpeed * (1 + (legAlt / 1000) * 0.02);
            trueAirSpeed = Math.round(trueAirSpeed);

            let bearing = GeoMath.getBearing(p1.lat, p1.lng, p2.lat, p2.lng);
            groundSpeed = calculateGroundSpeed(trueAirSpeed, bearing, weatherState.windSpd, weatherState.windDir);
            
            if (groundSpeed > 0) {
                legTimeSec = (distNM / groundSpeed) * 3600;
            }

            let userMach = trueAirSpeed / speedOfSound;
            let finalBurnRate = baseBurnRate;

            if (profile === 'RANGE' && userMach > bestMach) {
                let ratio = userMach / bestMach;
                let penalty = ratio * ratio; 
                finalBurnRate = baseBurnRate * penalty;
            }

            legBurn = finalBurnRate * distNM;
            wp.recMach = bestMach; 
            
            // --- NEW: MSA CALCULATION (En Route) ---
            const msaData = calculateMSA(wp.marker.getLatLng().lat, wp.marker.getLatLng().lng, legAlt);
            wp.msaData = msaData;
            updateWaypointPopup(wp, msaData);

        } else {
            let legAlt = parseFloat(wp.data.alt) || 0;
            let indicatedSpeed = parseFloat(wp.data.spd) || 0;
            trueAirSpeed = indicatedSpeed * (1 + (legAlt / 1000) * 0.02);
            wp.recMach = "--";
            groundSpeed = 0; 
            
            // --- NEW: MSA CALCULATION (Start Point) ---
            const msaData = calculateMSA(wp.marker.getLatLng().lat, wp.marker.getLatLng().lng, legAlt);
            wp.msaData = msaData;
            updateWaypointPopup(wp, msaData);
        }

        currentTimeSec += legTimeSec;
        if(!wp.data.holdTime) wp.data.holdTime = 0;
        currentTimeSec += wp.data.holdTime;

        wp.computed = {
            fuel: Math.round(currentFuel),
            gs: groundSpeed,
            tas: Math.round(trueAirSpeed),
            ete: Math.round(legTimeSec),
            eta: TimeMath.secToTime(currentTimeSec)
        };

        // Live DOM Updates
        const gsEl = document.getElementById(`val-gs-${index}`);
        if(gsEl) gsEl.innerText = groundSpeed + " kts";

        const eteEl = document.getElementById(`val-ete-${index}`);
        if(eteEl) eteEl.innerText = TimeMath.formatHold(Math.round(legTimeSec));

        const etaEl = document.getElementById(`val-eta-${index}`);
        if(etaEl) etaEl.innerText = TimeMath.secToTime(currentTimeSec);

        const tasEl = document.getElementById(`val-tas-${index}`);
        if(tasEl) tasEl.innerText = `/${Math.round(trueAirSpeed)}T`;

        totalFlightBurn += legBurn;
        currentFuel -= legBurn;
        currentTotalWeight -= legBurn; 

        if (currentFuel < 0) currentFuel = 0;

        wp.calculatedFuel = Math.round(currentFuel);

        const fuelCell = document.getElementById(`val-fuel-${index}`);
        if (fuelCell) {
            fuelCell.innerText = wp.calculatedFuel;
            let fClass = 'fuel-good';
            if (currentFuel <= fuelState.bingo) fClass = 'fuel-bingo';
            else if (currentFuel < fuelState.joker) fClass = 'fuel-joker';
            if (fuelCell.className !== fClass) fuelCell.className = fClass;
        }

        if(wp.data.type === 'TANKER') {
            let onload = parseFloat(wp.data.onload) || 0;
            const spaceAvailable = fuelState.max - currentFuel;
            if(onload > spaceAvailable) {
                onload = spaceAvailable;
                wp.data.onload = Math.round(onload);
            }
            currentFuel += onload;
            currentTotalWeight += onload; 
        }
    });

    const burnEl = document.getElementById('total-burn');
    const landingEl = document.getElementById('landing-fuel');
    
    let totalMissionBurn = totalFlightBurn + taxiFuel;

    if(burnEl) burnEl.innerText = Math.round(totalMissionBurn) + " lbs";
    
    if(landingEl) {
        landingEl.innerText = Math.round(currentFuel) + " lbs";
        landingEl.style.color = '#2ecc71'; 
        if (currentFuel <= fuelState.bingo) landingEl.style.color = '#e74c3c'; 
        else if (currentFuel < fuelState.joker) landingEl.style.color = '#f1c40f'; 
    }

    renderKneeboard();
    renderTable(forceRender); 
}


// --- RESET FUNCTIONS ---

window.resetWeapons = function(e) {
    if(e) { e.stopPropagation(); if(e.target) e.target.blur(); }
    
    showConfirm("Reset all weapons to Empty?", () => {
        for(let i=1; i<=9; i++) {
            const el = document.getElementById(`stn-${i}`);
            if(el) el.value = "Empty"; 
        }
        calculateAircraftState();
        runFuelCalc();
        saveData();
    });
};

window.resetComms = function(e) {
    if(e) { 
        e.stopPropagation(); 
        if(e.target) e.target.blur(); 
    }
    
    showConfirm("Reset communication presets to F/A-18C defaults?\n(This will also clear manual notes)", () => {
        
        // 1. Restore Grid
        const restoreBank = (containerId, defaultList) => {
            const container = document.getElementById(containerId);
            if(!container) return;
            
            const rows = container.children;
            for(let i=0; i<20; i++) {
                if(rows[i]) {
                    const def = defaultList[i] || {n: "", f: ""};
                    rows[i].querySelector('.comm-name').value = def.n;
                    rows[i].querySelector('.comm-freq').value = def.f;
                }
            }
        };

        restoreBank('comm1-container', DEFAULT_COMMS.c1);
        restoreBank('comm2-container', DEFAULT_COMMS.c2);

        // 2. Clear Manual Notes
        const notesBox = document.getElementById('comm-notes');
        if (notesBox) {
            notesBox.value = "";
        }

        saveData();
    });
};

window.resetNavigation = function(e, shouldSave = true) {
    if(e) { e.stopPropagation(); if(e.target) e.target.blur(); }

    const performReset = () => {
        waypoints.forEach(wp => map.removeLayer(wp.marker));
        legLabels.forEach(lbl => map.removeLayer(lbl));
        waypoints = [];
        legLabels = [];
        flightPath.setLatLngs([]);

	flightHistoryPts = [];
        if(historyPolyline) historyPolyline.setLatLngs([]);
        
        document.getElementById('total-dist').innerText = "0 nm";
        document.getElementById('total-burn').innerText = "0 lbs";
        renderTable();
        
        if(shouldSave) saveData();
        broadcastRouteState();
    };

    // If called directly (e.g. from sync), don't ask, just do.
    if (!shouldSave) {
        performReset();
    } else {
        showConfirm("Delete all waypoints?", performReset);
    }
};

function undoLastWaypoint() {
    // Safety Check
    if (waypoints.length === 0) return;

    // 1. Remove Last Waypoint from Array
    const wp = waypoints.pop();

    // 2. Remove Marker from Map
    if (wp && wp.marker) {
        map.removeLayer(wp.marker);
    }

    // 3. Update Everything
    updatePolyline(); // Redraw line
    runFuelCalc();    // Recalc fuel/time
    renderTable();    // Update list
    saveData();       // Save changes
    
    // 4. Sync with Web Dashboard
    broadcastRouteState(); 
}

// --- THREAT FILTER UI ---
function initThreatFilterMenu() {
    const container = document.getElementById('threat-filter-dropdown');
    if(!container) return;
    
    container.innerHTML = '';
    const types = ["LORAD", "MERAD", "SHORAD", "AAA", "ARMOR", "NAVAL"];
    
    types.forEach(type => {
        const div = document.createElement('div');
        div.className = 'task-option';
        const isChecked = threatFilters[type] ? 'checked' : '';
        
        div.innerHTML = `
            <input type="checkbox" id="tf-${type}" ${isChecked} onchange="updateThreatFilter('${type}')">
            <label for="tf-${type}" style="cursor:pointer; font-size:0.8rem; margin:0; width:100%;">${type}</label>
        `;
        container.appendChild(div);
    });
}

function toggleThreatMenu(e) {
    if(e) e.stopPropagation();
    const menu = document.getElementById('threat-filter-dropdown');
    if(menu) menu.classList.toggle('active');
}

function updateThreatFilter(type) {
    const cb = document.getElementById(`tf-${type}`);
    if(cb) {
        threatFilters[type] = cb.checked;
        analyzeThreats(); // Re-run analysis immediately
        saveData();
    }
}

// Update the global click listener to close this menu too
document.addEventListener('click', () => {
    const tMenu = document.getElementById('task-filter-dropdown');
    if(tMenu) tMenu.classList.remove('active');
    
    const thMenu = document.getElementById('threat-filter-dropdown');
    if(thMenu) thMenu.classList.remove('active');
});

// --- TASK FILTER UI LOGIC ---

function initTaskFilterMenu() {
    const container = document.getElementById('task-filter-dropdown');
    if(!container) return;
    
    container.innerHTML = '';
    
    // "Select All" / "Clear All" helpers could go here, keeping it simple for now
    
    POSSIBLE_TASKS.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-option';
        
        // Determine Checked State
        const isChecked = taskFilters[task] ? 'checked' : '';
        
        div.innerHTML = `
            <input type="checkbox" id="filter-${task}" ${isChecked} onchange="updateTaskFilter('${task}')">
            <label for="filter-${task}" style="cursor:pointer; font-size:0.8rem; margin:0; width:100%;">${task}</label>
        `;
        container.appendChild(div);
    });
}

function toggleTaskFilterMenu(e) {
    if(e) e.stopPropagation();
    const menu = document.getElementById('task-filter-dropdown');
    if(menu) menu.classList.toggle('active');
}

function updateTaskFilter(task) {
    const cb = document.getElementById(`filter-${task}`);
    if(cb) {
        taskFilters[task] = cb.checked;
        
        // Re-render table immediately using cached data
        if(latestMissionData) {
            updateMissionAssets(latestMissionData);
		resizeActiveAccordions();
        }
	saveData();
    }
}

// Close menu when clicking elsewhere
document.addEventListener('click', () => {
    const menu = document.getElementById('task-filter-dropdown');
    if(menu) menu.classList.remove('active');
});

// --- LOGIC UPDATES ---

function setupLoadoutListeners() {
    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) {
            // Update: Run Calc AND Save Data when changed
            el.addEventListener('change', () => {
                runFuelCalc();
                saveData(); 
            });
        }
    }
}

// --- POPULATE WEAPONS DROPDOWNS ---
function initLoadoutMenu() {
    // Helper to fill a select element
    const fill = (id, items) => {
        const el = document.getElementById(id);
        if(!el) return;
        el.innerHTML = ''; // Clear existing
        items.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item;
            opt.innerText = item;
            el.appendChild(opt);
        });
    };

    // Station 1 & 9 (Tips)
    fill('stn-1', STATION_LOADOUTS.tips);
    fill('stn-9', STATION_LOADOUTS.tips);

    // Station 2 & 8 (Outer)
    fill('stn-2', STATION_LOADOUTS.outerWing);
    fill('stn-8', STATION_LOADOUTS.outerWing);

    // Station 3 & 7 (Inner)
    fill('stn-3', STATION_LOADOUTS.innerWing);
    fill('stn-7', STATION_LOADOUTS.innerWing);

    // Station 4 & 6 (Cheek)
    fill('stn-4', STATION_LOADOUTS.cheek);
    fill('stn-6', STATION_LOADOUTS.cheek);

    // Station 5 (Center)
    fill('stn-5', STATION_LOADOUTS.center);
}

function initComms() {
    const createInputs = (id, defaultList) => {
        const c = document.getElementById(id);
        if(!c) return;
        c.innerHTML = ''; 
        
        for (let i = 0; i < 20; i++) {
            const def = defaultList[i] || {n:"", f:""};
            const d = document.createElement('div');
            d.className = 'comm-entry';
            
            d.innerHTML = `
                <label>${i + 1}</label>
                <input type="text" class="comm-name" placeholder="Name" value="${def.n}">
                <input type="text" class="comm-freq" placeholder="Freq" value="${def.f}">
            `;
            c.appendChild(d);
            
            // --- LISTENERS ---
            const nameInput = d.querySelector('.comm-name');
            const freqInput = d.querySelector('.comm-freq');

            // Save on change
            nameInput.addEventListener('change', saveData);
            freqInput.addEventListener('change', saveData);

            // AUTO-LOOKUP on manual typing of frequency
            freqInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (liveRadioMap[val]) {
                    nameInput.value = liveRadioMap[val];
                }
            });
        }
    };
    createInputs('comm1-container', DEFAULT_COMMS.c1);
    createInputs('comm2-container', DEFAULT_COMMS.c2);
}

function initMap() {
    // --- 1. Define Base Layers ---
    const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: 'Dont Drink and Fly'
    });

    const darkMap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: 'Lights Off On Deck'
    });

    const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Rocket Man'
    });

    // --- 2. Initialize Map ---
    map = L.map('map', {
        center: [36.1699, -115.1398],
        zoom: 9,
        layers: [darkMap],
        zoomControl: false 
    });

    // --- 3. Add Layer Control ---
    const baseMaps = { "Dark": darkMap, "Satellite": satelliteMap, "Street": streetMap };
    L.control.layers(baseMaps).addTo(map);

    // --- 4. CUSTOM MAP TOOLBAR ---
    L.control.zoom({ position: 'topleft' }).addTo(map);

    const MapToolbar = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            
            // Helper to stop map clicks
            const stop = L.DomEvent.disableClickPropagation;

            // 1. FOLLOW ME (Target)
            const btnFollow = L.DomUtil.create('button', '', container);
            btnFollow.innerHTML = '⌖'; 
            btnFollow.title = "Toggle Follow Me";
            btnFollow.style.fontSize = "18px";
            stop(btnFollow);
            btnFollow.onclick = function(e) {
                e.preventDefault();
                isFollowMode = !isFollowMode; 
                if (isFollowMode) {
                    btnFollow.classList.add('active-follow');
                    if (ownshipMarker) map.panTo(ownshipMarker.getLatLng());
                } else {
                    btnFollow.classList.remove('active-follow');
                }
            };

            // 2. EDIT TOOLS (Trash / Undo)
            const btnReset = L.DomUtil.create('button', '', container);
            btnReset.innerHTML = '🗑️'; btnReset.title = "Clear All";
            stop(btnReset); btnReset.onclick = (e) => { e.preventDefault(); resetNavigation(e); };

            const btnUndo = L.DomUtil.create('button', '', container);
            btnUndo.innerHTML = '↩️'; btnUndo.title = "Undo Last";
            stop(btnUndo); btnUndo.onclick = (e) => { e.preventDefault(); undoLastWaypoint(); };

            // 3. NAV TOOLS (< >)
            const navRow = L.DomUtil.create('div', 'nav-row', container);
            
            const btnPrev = L.DomUtil.create('button', 'nav-btn-half', navRow);
            btnPrev.innerHTML = '◄'; btnPrev.title = "Previous WP";
            stop(btnPrev); btnPrev.onclick = (e) => { e.preventDefault(); cycleMapFocus(-1); };

            const btnNext = L.DomUtil.create('button', 'nav-btn-half', navRow);
            btnNext.innerHTML = '►'; btnNext.title = "Next WP";
            stop(btnNext); btnNext.onclick = (e) => { e.preventDefault(); cycleMapFocus(1); };

            // 4. ZOOM SLIDER
            const sliderBox = L.DomUtil.create('div', 'zoom-slider-container', container);
            stop(sliderBox); 

            const slider = L.DomUtil.create('input', 'vertical-zoom', sliderBox);
            slider.type = 'range';
            slider.min = map.getMinZoom();
            slider.max = map.getMaxZoom();
            slider.value = map.getZoom();
            slider.step = 0.1; 
            
            L.DomEvent.on(slider, 'input', function(e) { map.setZoom(e.target.value, { animate: false }); });
            map.on('zoom', () => { slider.value = map.getZoom(); });

            // --- 5. THREAT TOGGLE (NEW) ---
            const btnThreat = L.DomUtil.create('button', 'btn-threat-map', container);
            btnThreat.id = 'btn-map-threats'; // ID for syncing
            btnThreat.title = "Toggle Threat Rings";
            // Insert the CSS Roundel
            btnThreat.innerHTML = '<div class="roundel-icon"></div>';
            stop(btnThreat);
            btnThreat.onclick = function(e) {
                e.preventDefault();
                // Toggle the Header Checkbox
                const cb = document.getElementById('threat-rings-check');
                cb.checked = !cb.checked;
                // Run Logic
                toggleThreatRings();
            };

            // 6. PUNCH BUTTON
            const btnPunch = L.DomUtil.create('button', 'btn-punch-map', container);
            btnPunch.innerHTML = 'P'; 
            btnPunch.title = "Punch Waypoints to Jet";
            stop(btnPunch); 
            btnPunch.onclick = function(e) {
                e.preventDefault();
                autoEntryWaypoints(); // Calls the main punch function
            };

            return container;
        }
    });

    map.addControl(new MapToolbar());

    historyPolyline = L.polyline([], { color: '#2ecc71', weight: 2, opacity: 0.6, dashArray: '4, 4' }).addTo(map);
    flightPath = L.polyline([], {color: '#4a90e2', weight: 3}).addTo(map);
    
    map.on('click', (e) => {
        tempClickCoords = e.latlng;
        if (document.activeElement) document.activeElement.blur();
        openModal();
    });
}

function addWaypoint(data, triggerSave = true, overrideLatLon = null) {
    let cssClass = 'nav-dot';
    if(data.type === 'TGT') cssClass += ' tgt';
    if(data.type === 'IP') cssClass += ' ip';
    if(data.type === 'TANKER') cssClass += ' tanker';
    if(data.type === 'MARSHALL') cssClass += ' marshall';

    const customIcon = L.divIcon({ className: cssClass, iconSize: [12, 12], iconAnchor: [6, 6] });
    
    // --- COORDINATE LOGIC FIX ---
    let latlng;
    if (overrideLatLon) {
        // Use specific coordinates (e.g. Ownship Position)
        latlng = L.latLng(overrideLatLon.lat, overrideLatLon.lng);
    } else {
        // Use Mouse Click coordinates
        latlng = tempClickCoords;
        if(typeof tempClickCoords.lat === 'undefined') {
            latlng = L.latLng(tempClickCoords.lat, tempClickCoords.lng);
        }
    }

    const marker = L.marker(latlng, { draggable: true, icon: customIcon, title: data.name }).addTo(map);
    
    if(!data.profile) data.profile = 'RANGE';

    const wpObj = { id: Date.now() + Math.random(), marker: marker, data: data };

    // --- EVENTS ---
    marker.on('drag', () => { updatePolyline(); }); 
    marker.on('dragend', () => { 
        runFuelCalc(); 
        updatePolyline(); 
        saveData(); 
        broadcastRouteState(); 
    }); 
    
    marker.bindPopup(() => `<b>${wpObj.data.name}</b><br>Type: ${wpObj.data.type}<br>Alt: ${wpObj.data.alt} ft`);
    
    waypoints.push(wpObj);
    
    runFuelCalc();
    updatePolyline();
    refreshNavAccordionHeight();
    
    if(triggerSave) {
        saveData();
        broadcastRouteState(); 
    }
}

function updatePolyline() {
    const coords = waypoints.map(wp => wp.marker.getLatLng());
    flightPath.setLatLngs(coords);
    legLabels.forEach(lbl => map.removeLayer(lbl));
    legLabels = [];

    let totalDist = 0;
    const multiplier = useStatute ? 1.15078 : 1.0;
    const unitLabel = useStatute ? 'sm' : 'nm';

    for(let i=0; i < coords.length -1; i++) {
        const p1 = coords[i];
        const p2 = coords[i+1];

        const distMeters = p1.distanceTo(p2);
        const distBase = (distMeters * 0.000539957); 
        const distDisplay = distBase * multiplier; 
        totalDist += distDisplay;

        const bearing = GeoMath.getBearing(p1.lat, p1.lng, p2.lat, p2.lng);
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;
        const magVar = GeoMath.getMagVar(midLng);
        const card = magVar >= 0 ? 'E' : 'W';

        // --- ROTATION & ARROW LOGIC ---
        let rotation = bearing - 90;
        
        // Normalize angle
        if (rotation > 180) rotation -= 360;
        if (rotation < -180) rotation += 360;

        // Direction Indicator Logic
        let topText = "";
        
        // Check if we need to flip the text for readability
        if (rotation > 90 || rotation < -90) {
            rotation += 180;
            // Flying West-ish: Arrow goes on the LEFT pointing LEFT
            topText = `< ${Math.round(bearing)}° / ${distDisplay.toFixed(1)}`;
        } else {
            // Flying East-ish: Arrow goes on the RIGHT pointing RIGHT
            topText = `${Math.round(bearing)}° / ${distDisplay.toFixed(1)} >`;
        }

        const labelHtml = `
            <div class="rotatable-label" style="transform: rotate(${rotation}deg);">
                <div class="lbl-top">${topText}</div>
                <div class="lbl-bot">${Math.abs(magVar).toFixed(1)}°${card}</div>
            </div>
        `;

        const textIcon = L.divIcon({
            className: 'leg-label',
            html: labelHtml,
            iconSize: [200, 60],
            iconAnchor: [100, 30]
        });

        const labelMarker = L.marker([midLat, midLng], {icon: textIcon, interactive:false}).addTo(map);
        legLabels.push(labelMarker);
    }

    const distEl = document.getElementById('total-dist');
    if(distEl) distEl.innerText = `${totalDist.toFixed(1)} ${unitLabel}`;
}

function deleteWaypoint(index) {
    if(waypoints[index] && waypoints[index].marker) {
        map.removeLayer(waypoints[index].marker);
    }
    waypoints.splice(index, 1);
    runFuelCalc(); // Recalc fuel
    updatePolyline();
    saveData();
    broadcastRouteState();
}

// Helper to toggle expansion
function toggleRowDetails(index) {
    if (waypoints[index].uiExpanded) {
        waypoints[index].uiExpanded = false;
    } else {
        waypoints[index].uiExpanded = true;
    }
    
    renderTable(); 
    
    setTimeout(() => {
        refreshNavAccordionHeight();
    }, 50);
}

function updateHoldTime(index, valStr) {
    let seconds = TimeMath.parseHold(valStr);
    waypoints[index].data.holdTime = seconds;
    runFuelCalc();
    saveData();
}

function updateTOT(index, valStr) {
    // Just save the string for reference (e.g. "08:30:00")
    // Future physics updates could parse this to calculate required G/S
    waypoints[index].data.tot = valStr;
    saveData();
    renderTable(); 
    renderKneeboard();
}

function renderTable(force = false) {
    const tbody = document.getElementById('wp-table-body');
    if(!tbody) return;

    // Focus Protection
    const activeEl = document.activeElement;
    const isEditingTable = activeEl && tbody.contains(activeEl) && 
                          (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT');

    if (isEditingTable && !force) return;

    tbody.innerHTML = '';

    const noDrag = `draggable="false" ondragstart="event.preventDefault()" onmousedown="event.stopPropagation()"`;

    waypoints.forEach((wp, index) => {
        const tr = document.createElement('tr');
        tr.setAttribute('draggable', true);
        tr.dataset.index = index;

        // --- MSA SAFETY CHECK ---
        // Determine if Altitude box should be Red or Green
        let altClass = ""; 
        if (wp.msaData) {
            if (wp.msaData.msa > 0) { 
                // Only color if there is an actual threat involved
                altClass = wp.msaData.isSafe ? "input-safe" : "input-unsafe";
            }
        }

        // TGT Cell
        let tgtElevCell = (wp.data.type === 'TGT') ? 
            `<input type="number" class="wp-input wp-tgt-input" style="color:var(--danger-color); border-bottom:1px solid #333;" 
                    value="${wp.data.tgtElev || 0}" 
                    ${noDrag} 
                    onchange="updateWpData(${index}, 'tgtElev', this.value)">` : 
            `<span style="color:#444; display:block; text-align:center;">--</span>`;

        // Fuel Colors
        const fuelVal = wp.calculatedFuel || 0;
        let fuelClass = 'fuel-good';
        if(fuelVal < fuelState.joker) fuelClass = 'fuel-joker';
        if(fuelVal <= fuelState.bingo) fuelClass = 'fuel-bingo';
        const fuelDisplay = `<span id="val-fuel-${index}" class="${fuelClass}">${fuelVal}</span>`;

        // Tanker Onload
        let onloadCell = (wp.data.type === 'TANKER') ?
            `<input type="number" class="onload-input" 
                    value="${wp.data.onload || 0}" 
                    min="0" max="${fuelState.max - fuelVal}" step="100" 
                    ${noDrag} 
                    oninput="updateWpData(${index}, 'onload', this.value)" 
                    onchange="saveData()">` : 
            `<span style="color:#444">--</span>`;

        // Mach Display
        let machDisplay = "--";
        if(index > 0) {
            const profileChar = (wp.data.profile === 'ENDURANCE') ? 'E' : 'R';
            const color = (wp.data.profile === 'ENDURANCE') ? '#4a90e2' : '#aaa'; 
            machDisplay = `<span class="mach-cell" style="color:${color}" onclick="toggleProfile(${index})">${wp.recMach} ${profileChar}</span>`;
        }

        // TAS Display
        const tasDisplay = wp.computed && wp.computed.tas ? 
            `<span id="val-tas-${index}" class="tas-display">/${wp.computed.tas}T</span>` : "";

        // --- ROW HTML ---
        tr.innerHTML = `
            <td class="row-handle" onclick="toggleRowDetails(${index})">☰ ${index}</td>
            
            <td>
                <input class="wp-input wp-name-input" 
                       value="${wp.data.name}" 
                       ${noDrag} 
                       onchange="updateWpData(${index}, 'name', this.value)">
            </td>
            
            <td>
                <select class="wp-select wp-type-select" 
                        ${noDrag} 
                        onchange="updateWpData(${index}, 'type', this.value)">
                    <option value="WP" ${wp.data.type==='WP'?'selected':''}>WP</option>
                    <option value="TGT" ${wp.data.type==='TGT'?'selected':''}>TGT</option>
                    <option value="IP" ${wp.data.type==='IP'?'selected':''}>IP</option>
                    <option value="CP" ${wp.data.type==='CP'?'selected':''}>CP</option>
                    <option value="MOM" ${wp.data.type==='MOM'?'selected':''}>MOM</option>
                    <option value="MARSHALL" ${wp.data.type==='MARSHALL'?'selected':''}>MARSHALL</option>
                    <option value="TANKER" ${wp.data.type==='TANKER'?'selected':''}>TANKER</option>
                </select>
            </td>
            
            <td>
                <!-- UPDATED: Added ${altClass} to the input class list -->
                <input type="number" class="wp-input wp-alt-input ${altClass}" 
                       value="${wp.data.alt}" 
                       ${noDrag} 
                       onchange="updateWpData(${index}, 'alt', this.value)">
            </td>
            
            <td>${tgtElevCell}</td>
            
            <!-- SPEED GROUP -->
            <td>
                <div class="speed-cell-group">
                    <input type="number" class="wp-input wp-speed-input" 
                           value="${wp.data.spd}" 
                           ${noDrag} 
                           oninput="updateWpData(${index}, 'spd', this.value)"
                           onchange="saveData()"> 
                    ${tasDisplay}
                </div>
            </td>
            
            <td style="text-align:center;">${machDisplay}</td>
            <td style="text-align:center;">${fuelDisplay}</td>
            <td style="text-align:center;">${onloadCell}</td>
            <td style="text-align:center;"><button class="btn-del" ${noDrag} onclick="deleteWaypoint(${index})">X</button></td>
        `;

        addDragEvents(tr);
        tbody.appendChild(tr);

        // DETAILS ROW
        if (wp.uiExpanded && wp.computed) {
            const detailRow = document.createElement('tr');
            detailRow.className = "wp-detail-row";
            
            const eteStr = TimeMath.formatHold(wp.computed.ete); 
            const etaStr = wp.computed.eta;
            const gsStr = wp.computed.gs + " kts";
            const holdVal = TimeMath.formatHold(wp.data.holdTime || 0);

            // Coordinates
            const latlng = wp.marker.getLatLng();
            let coordStr = "";
            if (typeof CoordConverter !== 'undefined') {
                if (coordFormat === 'DD') coordStr = CoordConverter.toDD(latlng.lat, latlng.lng);
                else if (coordFormat === 'DMS') coordStr = CoordConverter.toDMS(latlng.lat, latlng.lng);
                else if (coordFormat === 'MGRS_10') coordStr = CoordConverter.toMGRS(latlng.lat, latlng.lng, '10');
                else if (coordFormat === 'MGRS_6') coordStr = CoordConverter.toMGRS(latlng.lat, latlng.lng, '6');
                else if (coordFormat === 'UTM') coordStr = CoordConverter.toUTM(latlng.lat, latlng.lng);
                else coordStr = CoordConverter.toDDM(latlng.lat, latlng.lng);
            }
            const primaryCoord = coordStr.replace(/([NSEW])\s+/g, '$1');

            let totBlock = '';
            if (wp.data.type === 'TGT') {
                const currentTOT = wp.data.tot || "";
                totBlock = `
                    <div class="detail-group">
                        <label style="color:#e74c3c">TOT (Wall Time)</label>
                        <input type="text" class="tot-input" 
                               value="${currentTOT}" 
                               placeholder="HH:MM:SS" 
                               ${noDrag} 
                               onchange="updateTOT(${index}, this.value)">
                    </div>
                `;
            }

            detailRow.innerHTML = `
                <td colspan="10">
                    <div class="detail-content-wrapper">
                        <div class="detail-group">
                            <label>Location (${coordFormat})</label>
                            <span class="detail-val" style="color:var(--accent-color); font-size:0.9rem;">${primaryCoord}</span>
                        </div>
                        <div class="detail-group"><label>Leg Time</label><span id="val-ete-${index}" class="detail-val">${eteStr}</span></div>
                        <div class="detail-group"><label>Ground Spd</label><span id="val-gs-${index}" class="detail-val">${gsStr}</span></div>
                        
                        <div class="detail-group">
                            <label>TOS (Hold)</label>
                            <input type="text" class="hold-input" 
                                   value="${holdVal}" 
                                   placeholder="MM:SS" 
                                   ${noDrag}
                                   onchange="updateHoldTime(${index}, this.value)">
                        </div>
                        
                        ${totBlock}

                        <div class="detail-group"><label style="color:var(--accent-color)">ETA (Local)</label><span id="val-eta-${index}" class="detail-val" style="color:var(--accent-color)">${etaStr}</span></div>
                    </div>
                </td>`;
            tbody.appendChild(detailRow);
        }
    });
}

function toggleProfile(index) {
    // Toggle state
    const current = waypoints[index].data.profile || 'RANGE';
    waypoints[index].data.profile = (current === 'RANGE') ? 'ENDURANCE' : 'RANGE';
    
    // Recalculate and Save
    runFuelCalc();
    saveData();
}

function updateWpData(index, field, value) {
    // 1. Update the data model
    waypoints[index].data[field] = value;
    
    // 2. Handle special visual updates
    if(field === 'name') {
        waypoints[index].marker.setTooltipContent(value);
    }
    
    if(field === 'type') {
        let cssClass = 'nav-dot';
        if(value === 'TGT') cssClass += ' tgt';
        if(value === 'IP') cssClass += ' ip';
        if(value === 'TANKER') cssClass += ' tanker';
        if(value === 'MARSHALL') cssClass += ' marshall'; 
        
        const newIcon = L.divIcon({ className: cssClass, iconSize: [12, 12], iconAnchor: [6, 6] });
        waypoints[index].marker.setIcon(newIcon);
        
        if(value === 'TANKER' && !waypoints[index].data.onload) {
            waypoints[index].data.onload = 0;
        }
    }
    
    // 3. RECALCULATE & SAVE
    // FIX: If we changed 'type', Force the table to redraw immediately
    // so the TGT Elevation or Onload inputs appear instantly.
    const shouldForce = (field === 'type');
    
    runFuelCalc(shouldForce); 
    saveData(); 
    broadcastRouteState();
}

// --- DRAG DROP ---
function addDragEvents(row) {
    row.addEventListener('dragstart', function(e) {
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
    });

    row.addEventListener('dragover', function(e) {
        if (e.preventDefault) { e.preventDefault(); }
        e.dataTransfer.dropEffect = 'move';
        return false;
    });

    row.addEventListener('dragenter', function() { this.classList.add('over'); });
    row.addEventListener('dragleave', function() { this.classList.remove('over'); });

    row.addEventListener('drop', function(e) {
        if (e.stopPropagation) { e.stopPropagation(); }
        if (dragSrcEl !== this) {
            const oldIndex = parseInt(dragSrcEl.dataset.index);
            const newIndex = parseInt(this.dataset.index);
            const item = waypoints.splice(oldIndex, 1)[0];
            waypoints.splice(newIndex, 0, item);
            runFuelCalc(); // Recalc on Reorder
            updatePolyline();
            saveData(); 
        }
        return false;
    });

    row.addEventListener('dragend', function() {
        this.classList.remove('dragging');
        const rows = document.querySelectorAll('#wp-table-body tr');
        rows.forEach(row => row.classList.remove('over'));
    });
}

// --- NAVIGATION & SETTINGS ---
function switchPanel(panelName) {
    // 1. Hide all Panels
    document.getElementById('dashboard-panel').style.display = 'none';
    document.getElementById('settings-panel').style.display = 'none';
    
    // 2. Deactivate all Buttons
    document.getElementById('nav-dashboard').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');
    
    // 3. Show Selected
    if(panelName === 'dashboard') {
        document.getElementById('dashboard-panel').style.display = 'block';
        document.getElementById('nav-dashboard').classList.add('active');
        
        // Refresh map just in case resize happened while hidden
        setTimeout(() => { if(map) map.invalidateSize(); }, 100);
        
    } else if (panelName === 'settings') {
        document.getElementById('settings-panel').style.display = 'block';
        document.getElementById('nav-settings').classList.add('active');
    }
}

function setupSettings() {
    const toggle = document.getElementById('unit-toggle');
    if(toggle) {
        toggle.addEventListener('change', (e) => {
            useStatute = e.target.checked;
            
            // Trigger ALL updates
            updatePolyline(); // Map Distances
            // runFuelCalc();    // Physics & Table
            saveData(); 
        });
    }
}

// ==========================================
// SPATIAL MATCHING LOGIC (UPDATED)
// ==========================================

// Helper: Euclidean Distance
function dist2D(x1, z1, x2, z2) {
    const dx = x1 - x2;
    const dz = z1 - z2;
    return Math.sqrt(dx * dx + dz * dz);
}

async function syncFromMissionData() {
    console.log("--- STARTING SPATIAL SYNC ---");

    if (!latestMissionData) {
        alert("Mission Data not yet received. Please wait for the Live Brief to populate.");
        return;
    }

    // 1. Fetch Live Player Position (Raw X/Z/Y)
    let playerPos = null;
    try {
        const response = await fetch('http://127.0.0.1:58080/position-player');
        if (!response.ok) throw new Error("Hook not responding");
        playerPos = await response.json();
    } catch (e) {
        console.error("Spatial Sync Error:", e);
        alert("Could not fetch player position from DCS Hook (Port 58080). Ensure DcsWebViewer is running.");
        return;
    }

    const px = playerPos.Position?.x;
    const pz = playerPos.Position?.z;

    if (px === undefined || pz === undefined) {
        alert("Player position data is invalid (Spectator?). Enter cockpit.");
        return;
    }

    // 2. Flatten Mission Units
    const units = [];
    if (latestMissionData.coalition && latestMissionData.coalition.blue && latestMissionData.coalition.blue.country) {
        latestMissionData.coalition.blue.country.forEach(c => {
            if (c.plane && c.plane.group) {
                c.plane.group.forEach(g => {
                    if (g.units) g.units.forEach(u => units.push({ g, u }));
                });
            }
            if (c.helicopter && c.helicopter.group) {
                c.helicopter.group.forEach(g => {
                    if (g.units) g.units.forEach(u => units.push({ g, u }));
                });
            }
        });
    }

    if (units.length === 0) {
        alert("No Blue coalition aircraft found in mission data.");
        return;
    }

    // 3. Find Nearest Neighbor (X/Z vs X/Y)
    let nearest = null;
    let minDist = Infinity;

    units.forEach(({ g, u }) => {
        if (u.x !== undefined && u.y !== undefined) {
            const d = dist2D(px, pz, u.x, u.y);
            if (d < minDist) {
                minDist = d;
                nearest = { g, u, d };
            }
        }
    });

    if (!nearest) {
        alert("Could not correlate position to any mission unit.");
        return;
    }

    const { u } = nearest;
    console.log(`MATCHED UNIT: ${u.name} (Dist: ${minDist.toFixed(2)}m)`);

    // ==========================================
    // CAPTURE DATA
    // ==========================================

    // --- A. SYNC FUEL ---
    if (u.payload && u.payload.fuel !== undefined) {
        // 1. Get Base Fuel (Internal from Mission Editor)
        const fuelKg = u.payload.fuel;
        let totalFuelLbs = Math.round(fuelKg * 2.20462);
        
        console.log(`Base Internal Fuel (Mission): ${totalFuelLbs} lbs`);

        // 2. Add External Tanks (From the just-synced loadout)
        // We scan the dropdowns because they were just updated by syncLoadout()
        for(let i=1; i<=9; i++) {
            const el = document.getElementById(`stn-${i}`);
            if(el) {
                const selected = el.value;
                // Look up in our Weapons Database
                const stats = DRAG_DB[selected]; 
                
                // If it has capacity, it's a tank. Add it.
                // Note: We assume tanks loaded in ME are 100% full.
                if (stats && stats.capacity > 0) {
                    totalFuelLbs += stats.capacity;
                    console.log(`+ Tank on Stn ${i}: ${stats.capacity} lbs`);
                }
            }
        }

        // 3. Update UI
        const fuelInput = document.getElementById('total-fuel-input');
        const fuelSlider = document.getElementById('fuel-slider');
        
        // Dynamically update max if we exceed standard limits
        if (totalFuelLbs > parseFloat(fuelSlider.max)) {
            fuelSlider.max = totalFuelLbs; 
        }

        fuelInput.value = totalFuelLbs;
        fuelSlider.value = totalFuelLbs;
        
        console.log(`Final Synced Total Fuel: ${totalFuelLbs} lbs`);
    }

    // --- B. SYNC COMMS ---
    if (u.Radio) {
        const processRadio = (radioData, containerId) => {
            if (!radioData || !radioData.channels) return;
            const container = document.getElementById(containerId);
            const rows = container.children;
            
            radioData.channels.forEach((ch, index) => {
                if (index < 20 && rows[index]) {
                    const freqInput = rows[index].querySelector('.comm-freq');
                    let freqVal = (typeof ch === 'object') ? (ch.frequency || ch.freq) : ch;
                    if (parseFloat(freqVal) > 0) {
                        freqInput.value = parseFloat(freqVal).toFixed(3);
                    }
                }
            });
        };
        if (u.Radio[0]) processRadio(u.Radio[0], 'comm1-container');
        if (u.Radio[1]) processRadio(u.Radio[1], 'comm2-container');
        syncCommNames();
    }

    // --- C. CAPTURE ROUTE (VIRTUAL SAVE) ---
    // We save this regardless of checkbox, so it is available in memory
    if (u.route && u.route.points) {
        cachedMissionRoute = u.route.points;
        console.log("Route Data Cached:", cachedMissionRoute.length, "points found.");
        
        // If checkbox is checked, alert user about projection limitations
        const shouldSyncRoute = document.getElementById('sync-route-check').checked;
        if (shouldSyncRoute) {
            alert(`Route found with ${cachedMissionRoute.length} points.\n\nHowever, map projection tools are not yet loaded. The route has been saved to memory ('cachedMissionRoute') for future use.`);
            document.getElementById('sync-route-check').checked = false;
        }
    } else {
        cachedMissionRoute = null;
    }

    runFuelCalc();
    saveData();
}

// ==========================================
// LOADOUT SYNC LOGIC (wsTYPE ID PRIORITY)
// ==========================================

window.syncLoadout = function(e) {
    if(e) e.stopPropagation(); 

    if (!latestDcsPayload) {
        alert("No payload data received from DCS yet. Unpause the game.");
        return;
    }

    console.log("--- SYNC BUTTON PRESSED ---");
    
    // 1. PRE-RESET STATIONS
    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) el.value = "Empty";
    }

    // 2. ITERATE PAYLOAD
    Object.keys(latestDcsPayload).forEach(key => {
        const item = latestDcsPayload[key];
        
        let stationNum = item.id;
        if (stationNum === undefined) stationNum = parseInt(key) + 1;

        const stationId = `stn-${stationNum}`;
        const selectEl = document.getElementById(stationId);

        if (selectEl && item.count > 0) {
            let matchValue = "";

            // =========================================================
            // 0. CHECK NUMERICAL IDs (Highest Accuracy for Variants)
            // =========================================================
            if (item.weapon && item.weapon.level4) {
                const wType = item.weapon.level4;

                // AGM-154A (ID: 280)
                if (wType === 280) {
                    matchValue = (item.count > 1) ? "2x AGM-154A (W)" : "AGM-154A (W)";
                }
                // AGM-154C (ID: 132)
                else if (wType === 132) {
                    matchValue = (item.count > 1) ? "2x AGM-154C (W)" : "AGM-154C (W)";
                }
                // AIM-9M (ID: 22)
                else if (wType === 22) {
                    matchValue = "AIM-9M";
                }
                // AIM-9X (ID: 23)
                else if (wType === 23) {
                    matchValue = "AIM-9X";
                }
            }

            // =========================================================
            // A. CHECK CLSID (Precise Match - if ID didn't catch it)
            // =========================================================
            if (!matchValue) {
                const rawClsid = item.clsid || item.CLSID || "";
                const clsid = rawClsid.toUpperCase();

		// --- JDAM (GBU-32) ---
                if (clsid.includes("BRU55_2*GBU-32")) {
                    matchValue = "2x GBU-32(W)"; // Exact string from weapons-data.js
                }
                else if (clsid.includes("GBU-32") && !clsid.includes("BRU55")) {
                    matchValue = "GBU-32 (W)";
                }
                
                // --- JSOW RACKS (Backup Check) ---
                if (clsid.includes("BRU55_2*AGM-154C")) matchValue = "2x AGM-154C (W)";
                else if (clsid.includes("BRU55_2*AGM-154A")) matchValue = "2x AGM-154A (W)";
                else if (clsid.includes("9BCC2A2B")) matchValue = "AGM-154C (W)";
                else if (clsid.includes("AGM-154A")) matchValue = "AGM-154A (W)";

                // --- PODS & TANKS ---
                else if (clsid.includes("AAQ-28") || clsid.includes("LITENING") || clsid.includes("A111396E")) { 
                    if (stationNum === 5) matchValue = "AN/AAQ-28 (CL)";
                    else matchValue = "AN/AAQ-28";
                }
                else if (clsid.includes("AN_ASQ_228") || clsid.includes("ATFLIR")) {
                    matchValue = "AN/ASQ-228";
                }
                else if (clsid.includes("AWW-13")) {
                     matchValue = "AWW-13 DL";
                }
                else if (clsid.includes("FPU_8A") || clsid.includes("FPU-8A")) {
                    matchValue = "FPU-8/A";
                }
                else if (clsid.includes("AIS_POD") || clsid.includes("T50") || clsid.includes("ACMI")) {
                    matchValue = "ACMI Pod";
                }

                // --- ROCKETS ---
                else if (clsid.includes("BRU33_2*LAU10") || clsid.includes("2*LAU10")) {
                    matchValue = "2x LAU-10 ZUNI (W)";
                }
                else if (clsid.includes("LAU10")) {
                    matchValue = (item.count > 4) ? "2x LAU-10 ZUNI (W)" : "LAU-10 ZUNI (W)";
                }
                else if (clsid.includes("BRU33_LAU68")) {
                    matchValue = (item.count > 7) ? "2x LAU-68 HYDRA (W)" : "LAU-68 HYDRA (W)";
                }
                else if (clsid.includes("LAU61")) {
                    matchValue = (item.count > 19) ? "2x LAU-61 HYDRA (W)" : "LAU-61 HYDRA (W)";
                }

                // --- TRAINING / BDU ---
                else if (clsid.includes("BRU41_6X_BDU-33") || (clsid.includes("BDU-33") && item.count > 1)) {
                    matchValue = "6x BDU-33";
                }
                else if (clsid.includes("BDU-45B") && item.count > 1) {
                     matchValue = (stationNum === 5) ? "2x BDU-45B (CL)" : "2x BDU-45B (W)";
                }
                else if (clsid.includes("BDU-45") && item.count > 1) {
                     matchValue = (stationNum === 5) ? "2x BDU-45 (CL)" : "2x BDU-45 (W)";
                }

                // --- MK-80 SERIES RACKS ---
                else if (clsid.includes("BRU33_2X_MK-83AIR") || clsid.includes("BRU33_2X_MK83AIR")) {
                    matchValue = "2x MK 83 AIR (W)";
                }
                else if (clsid.includes("BRU33_2X_MK-83") || clsid.includes("BRU33_2X_MK83")) {
                    matchValue = "2x MK 83 (W)";
                }
                else if (clsid.includes("MK_82Y") || clsid.includes("BRU33_2X_MK-82AIR")) {
                    matchValue = (item.count > 1) ? "2x MK 82 AIR (W)" : "MK 82 AIR (W)";
                    if (stationNum === 5) matchValue = (item.count > 1) ? "2x MK 82 AIR (CL)" : "MK 82 AIR (CL)";
                }
                else if (clsid.includes("MK82SNAKEYE") || clsid.includes("SNAKEEYE") || clsid.includes("MK-82_SE")) {
                    matchValue = (item.count > 1) ? "2x MK 82 SE (W)" : "MK 82 SE (W)";
                    if (stationNum === 5) matchValue = (item.count > 1) ? "2x MK 82 SE (CL)" : "MK 82 SE (CL)";
                }
                else if (clsid.includes("BRU33_2X_MK-82") || clsid.includes("BRU33_2X_MK82")) {
                    matchValue = "2x MK 82 (W)";
                    if (stationNum === 5) matchValue = "2x MK 82 (CL)";
                }
                else if (clsid.includes("MK_83Y") || clsid.includes("MK_83AIR")) {
                    matchValue = (stationNum === 5) ? "MK 83 AIR (CL)" : "MK 83 AIR (W)";
                }

                // --- MISSILES ---
                else if (clsid.includes("B06DD79A") || clsid.includes("AIM-120C")) {
                     if (stationNum === 4 || stationNum === 6) matchValue = "AIM-120C (F)";
                     else matchValue = (item.count > 1) ? "2x AIM-120C (W)" : "AIM-120C (W)";
                }
                else if (clsid.includes("AIM-7P") || clsid.includes("{AIM-7P}")) {
                     matchValue = (stationNum === 4 || stationNum === 6) ? "AIM-7P (F)" : "AIM-7P (W)";
                }
                else if (clsid.includes("AIM-7MH") || clsid.includes("{AIM-7H}")) { 
                     matchValue = (stationNum === 4 || stationNum === 6) ? "AIM-7MH (F)" : "AIM-7MH (W)";
                }
                else if (clsid.includes("AIM-7M")) {
                     matchValue = (stationNum === 4 || stationNum === 6) ? "AIM-7M (F)" : "AIM-7M (W)";
                }
                else if (clsid.includes("AIM-7F")) {
                     matchValue = (stationNum === 4 || stationNum === 6) ? "AIM-7F (F)" : "AIM-7F (W)";
                }
            }

            // --- B. CHECK NAME (Fallback) ---
            if (!matchValue) {
                const rawName = item.name || item.displayName || "";
                
                // Debug Log
                console.log(`Fallback Search - Stn ${stationNum} Raw: "${rawName}" CLSID: "${item.clsid}" ID: ${item.weapon ? item.weapon.level4 : 'N/A'}`);

                let dcsClean = rawName.toUpperCase()
                    .replace("(V)1/B", "")
                    .replace("SNAKEEYE", "SE")
                    .replace(/[\s\-\/_]/g, "")
                    .replace("MAVERICK", "").replace("SIDEWINDER", "").replace("AMRAAM", "")
                    .replace("LITENING", "").replace("POD", "").replace("DL", "")
                    .replace("HARM", "").replace("ROCKEYE", "")
                    .replace(/BRU\d*/g, "").replace("AIS", "ACMI").replace("T50", "ACMI")
                    .replace(/^AN/, "").replace(/\(.*\)/g, "").trim();

                if (!matchValue) {
                    dcsClean = dcsClean.replace("JSOW", "");

                    if (dcsClean.includes("HYDRA")) {
                        dcsClean = "LAU68"; 
                        if (item.count > 19) dcsClean = "LAU61";
                    }

                    for (let i = 0; i < selectEl.options.length; i++) {
                        const optVal = selectEl.options[i].value;
                        const optClean = optVal.toUpperCase().replace(/[\s\-\/_]/g, "").replace(/\(.*\)/g, "");
                        
                        if (optClean === dcsClean) {
                            matchValue = optVal;
                            break;
                        }
                        if (optClean.includes(dcsClean) || dcsClean.includes(optClean)) {
                            const isDouble = optVal.includes("2x");
                            const dcsDouble = (item.count > 1 && !optVal.includes("AIM-")); 
                            
                            if ((isDouble && dcsDouble) || (!isDouble && !dcsDouble)) {
                                if (!matchValue) matchValue = optVal;
                            }
                        }
                    }
                }
            }

            // Apply Match
            if (matchValue) {
                let exists = false;
                for (let i = 0; i < selectEl.options.length; i++) {
                    if (selectEl.options[i].value === matchValue) {
                        selectEl.value = matchValue;
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    // Force add option
                    const opt = document.createElement('option');
                    opt.value = matchValue;
                    opt.innerText = matchValue + " *";
                    selectEl.appendChild(opt);
                    selectEl.value = matchValue;
                }
            }
        }
    });

    // --- 3. SYNC MECH ---
    const mech = latestDcsMech || {};
    if (mech.chaff !== undefined) document.getElementById('cm-chaff').value = mech.chaff;
    if (mech.flare !== undefined) document.getElementById('cm-flare').value = mech.flare;
    updateCM(); 

    if (mech.gun !== undefined) document.getElementById('gun-rounds').innerText = mech.gun;

    calculateAircraftState();
    
    // Sync Mission Data (Fuel/Comms/Route)
    syncFromMissionData().then(() => {
        runFuelCalc(); 
        saveData();
    });
};

function updateCM(changedType) {
    const chaffEl = document.getElementById('cm-chaff');
    const flareEl = document.getElementById('cm-flare');
    const totalEl = document.getElementById('cm-total-display');

    let chaff = parseInt(chaffEl.value) || 0;
    let flare = parseInt(flareEl.value) || 0;
    const max = 120;

    // Logic: If Chaff + Flare > 120, reduce the OTHER one
    if (chaff + flare > max) {
        if (changedType === 'chaff') {
            flare = max - chaff;
            if (flare < 0) flare = 0;
        } else {
            chaff = max - flare;
            if (chaff < 0) chaff = 0;
        }
    }

    // Update UI
    chaffEl.value = chaff;
    flareEl.value = flare;
    totalEl.innerText = chaff + flare;
    
    // Optional: Save to state if we want to persist this
    // saveData(); 
}

// --- MODAL, ACCORDION, HELPERS ---
function checkWpType() {
    const type = document.getElementById('wp-type').value;
    const tgtGroup = document.getElementById('tgt-elev-group');
    const tankGroup = document.getElementById('tank-onload-group');

    // Hide both by default
    tgtGroup.style.display = 'none';
    tankGroup.style.display = 'none';

    if (type === 'TGT') {
        tgtGroup.style.display = 'block';
    } 
    else if (type === 'TANKER') {
        tankGroup.style.display = 'block';
    }
}

// --- CUSTOM TYPE SPINNER LOGIC ---
const WP_TYPES = ["WP", "TGT", "IP", "CP", "MOM", "MARSHALL", "TANKER"];

function cycleWpType(direction) {
    const input = document.getElementById('wp-type');
    let currentIndex = WP_TYPES.indexOf(input.value);
    
    // Safety check
    if (currentIndex === -1) currentIndex = 0;

    // Increment/Decrement
    currentIndex += direction;

    // Wrap around logic
    if (currentIndex < 0) currentIndex = WP_TYPES.length - 1;
    if (currentIndex >= WP_TYPES.length) currentIndex = 0;

    // Set Value
    input.value = WP_TYPES[currentIndex];

    // Trigger existing logic (TGT Elevation hide/show)
    checkWpType();
}

// ==========================================
// INPUT SPINNER LOGIC (ACCELERATION)
// ==========================================
let spinTimer = null;
let spinStart = 0;
let spinSpeed = 100; // Start interval (ms)

function startSpin(id, direction) {
    const el = document.getElementById(id);
    if(!el) return;

    // 1. Immediate Change
    changeValue(el, direction, 1); // Initial step 1
    
    // 2. Start Loop
    const startTime = Date.now();
    let stepSize = 1;

    // Clear any existing
    if(spinTimer) clearInterval(spinTimer);

    spinTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;

        // --- ACCELERATION LOGIC ---
        // 0-2 sec: +/- 10
        // 2-4 sec: +/- 50
        // 4-6 sec: +/- 100
        // > 6 sec: +/- 1000
        
        if (elapsed > 4500) stepSize = 1000;
        else if (elapsed > 3000) stepSize = 100;
        else if (elapsed > 1500) stepSize = 50;
        else stepSize = 10; // Speed up after initial click

        changeValue(el, direction, stepSize);
        
    }, 100); // Update every 100ms
}

function stopSpin() {
    if(spinTimer) {
        clearInterval(spinTimer);
        spinTimer = null;
    }
}

function changeValue(el, direction, amount) {
    let val = parseInt(el.value) || 0;
    val += (amount * direction);
    if(val < 0) val = 0;
    el.value = val;
}

// ==========================================
// GROUND ELEVATION FETCH (REAL WORLD API)
// ==========================================
async function fetchGroundElev(targetInputId) {
    // Only works if we have a lat/lon to query (from the click)
    if (!tempClickCoords) {
        // Silent return if auto-called, alert if manual button click
        if (event && event.type === 'click') alert("No map location selected.");
        return;
    }

    // Visual Feedback (only if triggered by button)
    let btn = null;
    let oldText = "";
    if (event && event.target && event.target.tagName === 'BUTTON') {
        btn = event.target;
        oldText = btn.innerText;
        btn.innerText = "...";
    }
    
    try {
        // Use Open-Meteo API (Free, Global, Fast)
        const lat = tempClickCoords.lat;
        const lng = tempClickCoords.lng;
        const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
        
        const response = await fetch(url);
        
        if (response.ok) {
            const data = await response.json();
            
            // API returns { elevation: [123.4] } in Meters
            if (data.elevation && data.elevation.length > 0) {
                const elevMeters = data.elevation[0];
                const elevFeet = Math.round(elevMeters * 3.28084);
                
                const input = document.getElementById(targetInputId);
                if (input) input.value = elevFeet;
                
                if (btn) btn.innerText = "OK";
            }
        } else {
            console.warn("Elevation API Error");
            if (btn) btn.innerText = "ERR";
        }
    } catch (e) {
        console.error("Fetch failed:", e);
        if (btn) btn.innerText = "N/A";
    }

    // Reset button after delay
    if (btn) {
        setTimeout(() => { btn.innerText = oldText; }, 1500);
    }
}

function refreshNavAccordionHeight() {
    const navHeader = document.getElementById('nav-header');
    if (navHeader && navHeader.classList.contains('active')) {
        const panel = navHeader.nextElementSibling;
        panel.style.maxHeight = panel.scrollHeight + "px";
    }
}

function resizeActiveAccordions() {
    document.querySelectorAll('.accordion-header.active').forEach(header => {
        const panel = header.nextElementSibling;
        // Recalculate height to fit new data (like table rows)
        panel.style.maxHeight = panel.scrollHeight + "px";
    });
}

function setupTableExpansionListener() {
    const details = document.querySelector('.wp-details-container');
    if(details) {
        details.addEventListener('toggle', (e) => {
            setTimeout(() => { refreshNavAccordionHeight(); }, 50);
        });
    }
}

const modal = document.getElementById('wp-modal');
function openModal() {
    const nameInput = document.getElementById('wp-name');

    // --- 1. SMART NUMBERING FIX ---
    let nextNum = waypoints.length + 1;

    // If we have an auto-generated "Start" point at index 0, 
    // the array length is 1 higher than the WP count.
    // Example: [Start, WP1] (Length 2). Next should be WP2.
    if (waypoints.length > 0 && waypoints[0].data.name === "Start") {
        nextNum = waypoints.length;
    }

    nameInput.value = `WP ${nextNum}`;

    // --- 2. RESET INPUTS ---
    document.getElementById('wp-type').value = 'WP';
    document.getElementById('wp-onload').value = 0;
    // Reset altitudes to defaults so previous entries don't stick
    document.getElementById('wp-alt').value = 20000;
    document.getElementById('wp-tgt-alt').value = 0;

    checkWpType(); 
    
    modal.style.display = 'flex';
    
    // --- 3. AUTO FEATURES ---
    fetchGroundElev('wp-tgt-alt'); // Get ground elevation in background

    // --- 4. FOCUS FIX (Essential for typing) ---
    requestAnimationFrame(() => {
        if (document.activeElement) {
            document.activeElement.blur();
        }
        window.focus();       // Bring Electron window to front logic
        nameInput.focus();    // Select the input
        nameInput.select();   // Highlight text
    });
}

function closeModal() { modal.style.display = 'none'; }

// --- CUSTOM CONFIRMATION LOGIC ---
let pendingConfirmAction = null;

function showConfirm(message, callback) {
    const modal = document.getElementById('confirm-modal');
    const msgEl = document.getElementById('confirm-msg');
    
    // Set message
    msgEl.innerText = message;
    
    // Store the function to run if they click YES
    pendingConfirmAction = callback;
    
    // Show
    modal.style.display = 'flex';
}

function closeConfirm() {
    document.getElementById('confirm-modal').style.display = 'none';
    pendingConfirmAction = null;
}

// Initialize Confirm Listeners
function setupConfirmListeners() {
    document.getElementById('btn-confirm-no').addEventListener('click', closeConfirm);
    
    document.getElementById('btn-confirm-yes').addEventListener('click', () => {
        if (pendingConfirmAction) pendingConfirmAction();
        closeConfirm();
    });
}

function setupModalListeners() {
    document.getElementById('btn-cancel-wp').addEventListener('click', closeModal);
    
    document.getElementById('btn-save-wp').addEventListener('click', () => {
        
        // 1. Gather data for the Clicked Point
        const clickedWpData = {
            name: document.getElementById('wp-name').value,
            type: document.getElementById('wp-type').value,
            alt: document.getElementById('wp-alt').value,
            tgtElev: document.getElementById('wp-tgt-alt').value,
	    onload: document.getElementById('wp-onload').value, 
            spd: document.getElementById('wp-spd').value
        };

        // 2. CHECK: Do we need to auto-insert WP0 (Ownship)?
        // Condition: No waypoints exist yet AND we have live DCS data
        if (waypoints.length === 0 && currentOwnship) {
            
            const wp0Data = {
                name: "Start",
                type: "WP",
                alt: Math.round(currentOwnship.alt), // Use current altitude
                spd: 0, // Start speed usually 0 or ignored for first leg calculation
                tgtElev: 0
            };
            
            // Add WP0 at Ownship location
            addWaypoint(wp0Data, false, { lat: currentOwnship.lat, lng: currentOwnship.lon });
        }

        // 3. Add the Clicked Point (WP 1)
        // Uses standard tempClickCoords
        addWaypoint(clickedWpData, true);
        
        closeModal();
    });
}

// --- SETUP WIZARD LOGIC ---
function checkSetupState() {
    // 1. BYPASS IF KNEEBOARD MODE
    // If we are running in OpenKneeboard (URL ?mode=kneeboard), 
    // we assume setup was done on the desktop app previously.
    // Even if not, we don't want to block the map view with a modal they can't use.
    if (document.body.classList.contains('kb-mode')) {
        return; 
    }

    // 2. Check if paths exist in storage
    const dcsPath = localStorage.getItem('dcsInstallPath');
    const kbPath = localStorage.getItem('kneeboardPath');

    // If either is missing, show the prompt
    if (!dcsPath || !kbPath) {
        document.getElementById('setup-modal').style.display = 'flex';
    }
}

function initSetupListeners() {
    // "Go to Settings" Button
    document.getElementById('btn-setup-go').addEventListener('click', () => {
        document.getElementById('setup-modal').style.display = 'none';
        switchPanel('settings'); // Switch tab
    });

    // "Later" Button
    document.getElementById('btn-setup-skip').addEventListener('click', () => {
        document.getElementById('setup-modal').style.display = 'none';
    });
}

function calculateCG(stnWeights) {
    // Base MAC
    let cg = 21.4;

    // --- Gun Correction ---
    // M61 Vulcan is always loaded in DCS (-2.0 shift)
    cg -= 2.0;

    // --- Station 1 & 9 (Tips) ---
    // Rule: if weight > 0 lbs +.02
    if (stnWeights[1] > 0) cg += 0.02;
    if (stnWeights[9] > 0) cg += 0.02;

    // --- Station 2, 3, 7, 8 (Wings) ---
    // Rule: <1000 +0, 1000-2000 -.05, >2000 -.1
    [2, 3, 7, 8].forEach(id => {
        const w = stnWeights[id];
        if (w > 2000) cg -= 0.1;
        else if (w > 1000) cg -= 0.05;
    });

    // --- Station 5 (Center) ---
    // Rule: <1000 -.03, 1000-2000 -1.2, >2000 -2.4
    const w5 = stnWeights[5];
    if (w5 > 2000) cg -= 2.4;
    else if (w5 > 1000) cg -= 1.2;
    else if (w5 > 0) cg -= 0.03;

    // --- Station 4 & 6 (Cheeks) ---
    // Logic: Look at Name strings
    [4, 6].forEach(id => {
        const el = document.getElementById(`stn-${id}`);
        if(el) {
            const name = el.value.toUpperCase();
            if (name.includes("AIM-120")) cg += 0.3; // B or C
            if (name.includes("AAQ-28") || name.includes("LITENING")) cg += 0.1;
            if (name.includes("AIM-7")) cg += 0.5; // F, M, MH
        }
    });

    return parseFloat(cg.toFixed(2));
}

function calculateAircraftState() {
    // --- PASS 1: SCAN LOADOUT & DETERMINE MAX CAPACITIES ---
    let totalDrag = 0; 
    let totalStoreWeight = 0; 
    
    const internalFuelCap = 10600; 
    let totalExternalCap = 0;
    let tankStations = []; 

    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) {
            const selected = el.value;
            const stats = DRAG_DB[selected] || { drag: 0, weight: 0, capacity: 0 };
            
            totalDrag += stats.drag;

            if(stats.capacity && stats.capacity > 0) {
                totalExternalCap += stats.capacity;
                tankStations.push(i);
            } else {
                totalStoreWeight += stats.weight;
            }
        }
    }

    const maxPossibleFuel = internalFuelCap + totalExternalCap;

    // --- HANDLE UI INPUTS ---
    const fuelInput = document.getElementById('total-fuel-input');
    const fuelSlider = document.getElementById('fuel-slider');
    let currentVal = parseFloat(fuelInput.value);
    const prevMax = parseFloat(fuelSlider.max) || internalFuelCap;
    
    fuelSlider.max = maxPossibleFuel;

    if (maxPossibleFuel > prevMax) {
        if (Math.abs(currentVal - prevMax) < 100) currentVal = maxPossibleFuel;
    } else if (maxPossibleFuel < prevMax) {
        if (currentVal > maxPossibleFuel) currentVal = maxPossibleFuel;
    }

    fuelInput.value = currentVal;
    fuelSlider.value = currentVal;
    const userFuel = currentVal; 

    // --- FUEL DISTRIBUTION ---
    let currentExternalFuel = 0;
    if (userFuel > internalFuelCap) {
        currentExternalFuel = userFuel - internalFuelCap;
    }

    let fuelPerTank = 0;
    if (tankStations.length > 0) {
        fuelPerTank = currentExternalFuel / tankStations.length;
    }

    // --- PASS 2: MOMENTS & STATION WEIGHTS ---
    let momentLeft = 0;
    let momentRight = 0;
    
    // Track individual station weights for CG Calc
    let stnWeights = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0};

    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) {
            const selected = el.value;
            const stats = DRAG_DB[selected] || { drag: 0, weight: 0, capacity: 0 };
            const arm = STATION_ARMS[i];
            
            let stationWeight = 0;

            if(stats.capacity > 0) {
                const dryWeight = stats.weight - stats.capacity;
                stationWeight = dryWeight + fuelPerTank;
                totalStoreWeight += stationWeight;
            } else {
                stationWeight = stats.weight;
            }
            
            // Save for CG Calc
            stnWeights[i] = stationWeight;

            const moment = stationWeight * arm;
            if (i <= 4) momentLeft += moment;
            else if (i >= 6) momentRight += moment;
        }
    }

    // --- TRIM LOGIC ---
    const netMoment = momentLeft - momentRight;
    const absMoment = Math.abs(netMoment);
    let rollText = "Sym";
    let rollColor = "#2ecc71";

    if (absMoment > 22000) {
        rollText = "LIMIT!";
        rollColor = "#e74c3c";
    } else {
        let rollTrimVal = 0;
        if (absMoment >= 18000) rollTrimVal = 6;
        else if (absMoment >= 16250) rollTrimVal = 5;
        else if (absMoment >= 14500) rollTrimVal = 4;
        else if (absMoment >= 12750) rollTrimVal = 3;
        else if (absMoment >= 11000) rollTrimVal = 2;
        else if (absMoment >= 7500)  rollTrimVal = 1;

        if (rollTrimVal > 0) {
            const direction = (netMoment > 0) ? "Right" : "Left";
            rollText = `${direction} ${rollTrimVal}°`;
            rollColor = "#f1c40f";
        }
    }

    // --- PITCH / GROSS WEIGHT ---
    const baseJetWeight = 26100;
    const currentInternalFuel = Math.min(userFuel, internalFuelCap);
    const grossWeight = baseJetWeight + totalStoreWeight + currentInternalFuel;

    const isCV = document.getElementById('cv-depart-check').checked;
    let pitchTrimVal = 12;
    if (isCV) {
        if (grossWeight > 49000) pitchTrimVal = 19;
        else if (grossWeight > 45000) pitchTrimVal = 17;
        else pitchTrimVal = 16;
    }

    // --- NEW: CG & T/O SPEEDS ---
    const cg = calculateCG(stnWeights);
    const v1 = TakeoffCalculator.interpolateVSpeed(TakeoffCalculator.v1Table, grossWeight, cg);
    const v2 = TakeoffCalculator.interpolateVSpeed(TakeoffCalculator.v2Table, grossWeight, cg);

    // --- NEW: T/O DISTANCE ---
    // Use DCS live wind speed if available, otherwise 0
    const headwind = weatherState.windSpd || 0; 
    const toDist = TakeoffCalculator.calculateDistance(grossWeight, headwind);

    // --- DOM UPDATES ---
    document.getElementById('gross-weight-display').innerText = Math.round(grossWeight).toLocaleString() + " lbs";
    
    const trimEl = document.getElementById('trim-display');
    if(trimEl) { trimEl.innerText = rollText; trimEl.style.color = rollColor; }

    const pitchEl = document.getElementById('pitch-trim-display');
    if(pitchEl) { pitchEl.innerText = `${pitchTrimVal}°`; pitchEl.style.color = isCV ? "#9b59b6" : "#2ecc71"; }

    // Update T/O Data
    document.getElementById('cg-display').innerText = `CG: ${cg}%`;
    document.getElementById('vspeed-display').innerText = `V1:${v1} / V2:${v2}`;
    
    // UPDATED: Use innerHTML to stack the text
    document.getElementById('to-dist-display').innerHTML = 
        `Dist: ${toDist.toLocaleString()} ft<br><span style="font-size:0.65rem; color:#888;">(clr 50' obs)</span>`;

    return { dragIndex: totalDrag, storeWeight: totalStoreWeight };
}

function setupAccordions() {
    document.querySelectorAll('.accordion-header').forEach(acc => {
        acc.addEventListener('click', function(e) {
            
            // --- FIX: PREVENT COLLAPSE ON CONTROLS ---
            // If the user clicked a Button, Input (Checkbox), or Label, do not toggle.
            if (e.target.classList.contains('btn-reset-section') || 
                e.target.tagName === 'INPUT' || 
                e.target.tagName === 'LABEL') {
                return;
            }

            this.classList.toggle('active');
            const panel = this.nextElementSibling;
            
            if (panel.style.maxHeight) {
                panel.classList.remove('overflow-visible');
                panel.style.overflow = "hidden"; 
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
                if(this.id === 'nav-header') { 
                    setTimeout(() => { map.invalidateSize(); }, 300); 
                }
                setTimeout(() => {
                    if (this.classList.contains('active')) {
                        panel.classList.add('overflow-visible');
                    }
                }, 310);
            } 
        });
    });
}

// ==========================================
// KNEEBOARD GENERATION
// ==========================================

function renderKneeboard() {
    // Helper to safely set text
    const setSafe = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    };

    // --- SECTION 1: DEPARTURE ---
    setSafe('kb-dep-gw', document.getElementById('gross-weight-display').innerText);
    
    const toDist = document.getElementById('to-dist-display').innerText.replace(/\(.*\)/, '').trim(); 
    setSafe('kb-dep-dist', toDist);

    const vspeeds = document.getElementById('vspeed-display').innerText;
    setSafe('kb-dep-vspeed', vspeeds);

    const bingo = document.getElementById('bingo-fuel').value || "--";
    const joker = document.getElementById('joker-fuel').value || "--";
    setSafe('kb-dep-fuel', `${bingo} / ${joker}`);

    const pitch = document.getElementById('pitch-trim-display').innerText;
    const roll = document.getElementById('trim-display').innerText.replace("Trim ", ""); 
    setSafe('kb-dep-trim', `P: ${pitch} / R: ${roll}`);

    const metarHTML = document.getElementById('val-metar').innerHTML;
    const metarText = metarHTML.replace(/<[^>]*>/g, ' '); 
    setSafe('kb-dep-metar', metarText.substring(0, 100) + "...");

    // --- SECTION 2: LOADOUT ---
    for(let i=1; i<=9; i++) {
        const el = document.getElementById(`stn-${i}`);
        if(el) {
            let name = el.value.replace(" (W)", "").replace(" (CL)", "").replace(" (F)", "");
            if(name === "Empty") name = "-";
            setSafe(`kb-stn-${i}`, name);
        }
    }
    
    setSafe('kb-chaff', document.getElementById('cm-chaff').value);
    setSafe('kb-flare', document.getElementById('cm-flare').value);
    setSafe('kb-gun', document.getElementById('gun-rounds').innerText);
    setSafe('kb-gun-type', document.getElementById('gun-type').innerText);
    
    // FUEL (The one that caused the error)
    setSafe('kb-total-fuel', document.getElementById('total-fuel-input').value);

    // --- SECTION 3: NAV LOG ---
    const tbody = document.getElementById('kb-nav-body');
    if (tbody) {
        tbody.innerHTML = '';

        waypoints.forEach((wp, index) => {
            const tr = document.createElement('tr');
            const latlng = wp.marker.getLatLng();

            // Coordinate Logic
            let primaryCoord = "";
            if (typeof CoordConverter !== 'undefined') {
                if (coordFormat === 'DD') primaryCoord = CoordConverter.toDD(latlng.lat, latlng.lng);
                else if (coordFormat === 'DMS') primaryCoord = CoordConverter.toDMS(latlng.lat, latlng.lng);
                else if (coordFormat === 'MGRS_10') primaryCoord = CoordConverter.toMGRS(latlng.lat, latlng.lng, '10');
                else if (coordFormat === 'MGRS_6') primaryCoord = CoordConverter.toMGRS(latlng.lat, latlng.lng, '6');
                else if (coordFormat === 'UTM') primaryCoord = CoordConverter.toUTM(latlng.lat, latlng.lng);
                else primaryCoord = CoordConverter.toDDM(latlng.lat, latlng.lng);
            }
            primaryCoord = primaryCoord.replace(/([NSEW])\s+/g, '$1');
            const mgrs = (typeof CoordConverter !== 'undefined') ? CoordConverter.toMGRS(latlng.lat, latlng.lng, '10') : "";

            // Speed
            const spdStr = `${wp.data.spd} / ${wp.recMach || '-'}M`;
            
            // Special Data
            let specialData = "";
            if (wp.data.type === 'TGT') {
                specialData += `<span style="color:#e74c3c">TGT Elev: ${wp.data.tgtElev}</span><br>`;
                if(wp.data.tot) specialData += `TOT: ${wp.data.tot}<br>`;
            }
            if (wp.data.holdTime && wp.data.holdTime > 0) {
                specialData += `TOS: ${TimeMath.formatHold(wp.data.holdTime)}`;
            }

            // --- FUEL COLOR LOGIC (UPDATED) ---
            const fuelVal = wp.calculatedFuel || 0;
            let fuelClass = 'fuel-good'; // Default Green
            
            // Check Limits
            if (fuelVal < fuelState.joker) fuelClass = 'fuel-joker';
            if (fuelVal <= fuelState.bingo) fuelClass = 'fuel-bingo';

            // Wrap the number in the colored span
            let fuelStr = `<span class="${fuelClass}">${fuelVal}</span>`;

            // Append Tanker Onload (Purple) if applicable
            if (wp.data.type === 'TANKER') {
                fuelStr += ` <span style="color:#9b59b6">(+${wp.data.onload})</span>`;
            }

            const etaDisplay = wp.computed ? wp.computed.eta : '--';

            tr.innerHTML = `
                <td><b>${index}</b><br>${wp.data.name}</td>
                <td>${primaryCoord}<br><span class="kb-mgrs">${mgrs}</span></td>
                <td>${wp.data.alt}</td>
                <td>${spdStr}</td>
                <td>${specialData}</td>
                <td>${fuelStr}</td> <!-- Uses the colored string now -->
                <td>${etaDisplay}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- SECTION 4: THREATS ---
    analyzeThreats();
}

/**
 * Calculates Minimum Safe Altitude (MSA) for a specific Lat/Lon.
 * USES 3D ELLIPTICAL ENVELOPE (Hemisphere logic).
 */
function calculateMSA(lat, lon, currentAltFt) {
    const wpLoc = L.latLng(lat, lon);
    let highestThreatCeiling = 0; 
    let primaryThreatName = "";
    
    // Scan all live units
    for (const [id, unitMarker] of Object.entries(liveMarkers)) {
        const u = unitMarker.unitData;
        if (!u) continue;

        const threatInfo = identifyThreat(u);
        if (!threatInfo) continue;

        if (!threatFilters[threatInfo.type]) continue;

        const unitLoc = L.latLng(u.la, u.lo);
        const distNM = wpLoc.distanceTo(unitLoc) * 0.000539957;

        // 1. Check 2D Range Limit (Using KILL Range, not Detection Range)
        if (distNM < threatInfo.killNM) {
            
            // 2. Calculate 3D Effective Ceiling (Elliptical Dome)
            const ratio = distNM / threatInfo.killNM;
            
            if (ratio > 1) continue; 
            
            const envelopeFactor = Math.sqrt(1 - (ratio * ratio));
            
            // Effective ceiling at this specific distance
            const effectiveCeiling = (threatInfo.ceil * envelopeFactor) + (u.a || 0);

            if (effectiveCeiling > highestThreatCeiling) {
                highestThreatCeiling = effectiveCeiling;
                primaryThreatName = threatInfo.name;
            }
        }
    }

    // 3. Determine Safety
    const isSafe = currentAltFt >= highestThreatCeiling;
    
    return {
        msa: highestThreatCeiling,
        isSafe: isSafe,
        threat: primaryThreatName
    };
}

// --- THREAT LOGIC HELPERS ---

function identifyThreat(u) {
    const isEnemy = (u.co === 1 || u.color === '#e74c3c');
    const isSurface = (u.c === 3 || u.c === 4);
    if (!isEnemy || !isSurface) return null;

    const rawName = u.n || "Unknown";
    const nameUpper = rawName.toUpperCase();
    
    let type = null;
    let ceil = 0;
    let rangeNM = 0; // Detection / Map Ring
    let killNM = 0;  // Effective Missile Range (MSA Calc)

    // A. Check SAM DB
    for (const [key, data] of Object.entries(SAM_DB)) {
        if (nameUpper.includes(key)) {
            type = data.type;
            ceil = data.ceil;
            
            // Define Detection vs Kill Ranges
            if (type === "LORAD") {
                rangeNM = 60; // Map Ring (Warning)
                killNM = 45;  // Actual Kill Zone
            }
            else if (type === "MERAD") {
                rangeNM = 25;
                killNM = 22;  // Close to detection
            }
            else if (type === "SHORAD") {
                rangeNM = 8;
                killNM = 7;
            }
            else if (type === "AAA") {
                rangeNM = 3;
                killNM = 2.5;
            }
            
            return { type, ceil, rangeNM, killNM, name: rawName };
        }
    }

    // B. Fallback SAM
    if (nameUpper.includes("SAM") || nameUpper.includes("RADAR")) {
        return { type: "SHORAD", ceil: 20000, rangeNM: 8, killNM: 7, name: rawName };
    }

    // C. Armor Check
    const isArmor = nameUpper.includes("TANK") || nameUpper.includes("T-") || 
                    nameUpper.includes("BMP") || nameUpper.includes("BMD") || 
                    nameUpper.includes("BTR") || nameUpper.includes("BRDM") ||
                    nameUpper.includes("ABRAMS") || nameUpper.includes("LEOPARD") || 
                    nameUpper.includes("CHALLENGER") || nameUpper.includes("MARDER") || 
                    nameUpper.includes("LAV") || nameUpper.includes("STRYKER") ||
                    nameUpper.includes("M113") || nameUpper.includes("SAU") || 
                    nameUpper.includes("GEPARD") || nameUpper.includes("MTLB") || 
                    nameUpper.includes("BRADLEY") || nameUpper.includes("M2") || 
                    nameUpper.includes("WARRIOR") || nameUpper.includes("LECLERC") || 
                    nameUpper.includes("MERKAVA") || nameUpper.includes("TOS") || 
                    nameUpper.includes("SCUD") || nameUpper.includes("AAV");

    if (isArmor) {
        return { type: "ARMOR", ceil: 5000, rangeNM: 3, killNM: 2, name: rawName };
    }

    // D. Naval Check
    if (u.c === 4) {
        if (nameUpper.includes("MOSKVA") || nameUpper.includes("PIOTR") || nameUpper.includes("PYOTR") || nameUpper.includes("KIROV") || nameUpper.includes("SLAVA")) {
            // S-300F
            return { type: "LORAD", ceil: 99000, rangeNM: 60, killNM: 45, name: rawName };
        }
        else if (nameUpper.includes("CVN") || nameUpper.includes("CARRIER") || nameUpper.includes("CRUISER") || nameUpper.includes("TICONDEROGA")) {
            return { type: "NAVAL", ceil: 60000, rangeNM: 40, killNM: 30, name: rawName };
        } 
        else if (nameUpper.includes("SPEEDBOAT") || nameUpper.includes("BOAT")) {
            return { type: "NAVAL", ceil: 5000, rangeNM: 3, killNM: 2, name: rawName };
        }
        else {
            return { type: "NAVAL", ceil: 25000, rangeNM: 15, killNM: 10, name: rawName };
        }
    }

    return null;
}


function toggleThreatRings() {
    const cb = document.getElementById('threat-rings-check');
    showThreatRings = cb.checked;

    // Sync Map Button Visuals
    const mapBtn = document.getElementById('btn-map-threats');
    if (mapBtn) {
        if (showThreatRings) mapBtn.classList.add('active-threat');
        else mapBtn.classList.remove('active-threat');
    }

    // Refresh all existing markers
    for (const [id, marker] of Object.entries(liveMarkers)) {
        updateMarkerRing(marker);
    }
}


function updateMarkerRing(marker) {
    const u = marker.unitData;
    
    // Helper to clear rings
    const clearRings = () => {
        if (marker.ringDetect) { map.removeLayer(marker.ringDetect); marker.ringDetect = null; }
        if (marker.ringKill) { map.removeLayer(marker.ringKill); marker.ringKill = null; }
    };

    // 1. If disabled, clear and exit
    if (!showThreatRings) {
        clearRings();
        return;
    }

    const threatInfo = identifyThreat(u);
    
    if (threatInfo) {
        // Calculate Radii (NM to Meters)
        const detectMeters = threatInfo.rangeNM * 1852;
        const killMeters = (threatInfo.killNM || threatInfo.rangeNM) * 1852;
        
        // Define Colors
        const typeColors = { 
            "LORAD": "#ff5555", "MERAD": "#e74c3c", "SHORAD": "#e67e22", 
            "AAA": "#f1c40f", "ARMOR": "#d35400", "NAVAL": "#00bcd4"
        };
        const killColor = typeColors[threatInfo.type] || "#e74c3c";
        const detectColor = "#f1c40f"; // Yellow for "Painting/Detection"

        // --- DRAW DETECTION RING (Outer / Dashed) ---
        if (marker.ringDetect) {
            marker.ringDetect.setLatLng(marker.getLatLng());
            marker.ringDetect.setRadius(detectMeters);
        } else {
            marker.ringDetect = L.circle(marker.getLatLng(), {
                color: detectColor,
                fill: false,
                weight: 1,
                dashArray: '5, 8', // Dashed line
                radius: detectMeters,
                interactive: false
            }).addTo(map);
        }

        // --- DRAW KILL RING (Inner / Solid) ---
        // Only draw if there is a significant difference (e.g. > 1nm diff), otherwise it looks messy
        // For AAA/Armor, Detection ~= Kill, so maybe just one ring is enough?
        // Let's always draw it for consistency, but maybe make it thicker.
        
        if (marker.ringKill) {
            marker.ringKill.setLatLng(marker.getLatLng());
            marker.ringKill.setRadius(killMeters);
        } else {
            marker.ringKill = L.circle(marker.getLatLng(), {
                color: killColor,
                fill: false,
                weight: 2, // Thicker line
                radius: killMeters,
                interactive: false
            }).addTo(map);
        }

    } else {
        // Not a threat anymore
        clearRings();
    }
}

function updateWaypointPopup(wp, msaData) {
    if(!wp.marker) return;

    const alt = parseFloat(wp.data.alt) || 0;
    
    // --- 1. DYNAMIC TYPE DATA ---
    let extraInfo = "";
    if (wp.data.type === 'TGT') {
        extraInfo = `<span style="color:#aaa">TGT Elev:</span> <span style="color:#e74c3c">${wp.data.tgtElev || 0} ft</span><br>`;
    } 
    else if (wp.data.type === 'TANKER') {
        extraInfo = `<span style="color:#aaa">Onload:</span> <span style="color:#9b59b6">${wp.data.onload || 0} lbs</span><br>`;
    }

    // --- 2. MSA LOGIC ---
    let msaHtml = "";
    if (msaData.msa > 0) {
        if (msaData.isSafe) {
            const buffer = alt - msaData.msa;
            msaHtml = `<span class="popup-msa-safe">SAFE (+${Math.round(buffer)} ft)<br><span style="font-weight:normal; font-size:0.8em; color:#ccc;">Above ${msaData.threat}</span></span>`;
        } else {
            const deficit = msaData.msa - alt;
            msaHtml = `<span class="popup-msa-danger">UNSAFE (-${Math.round(deficit)} ft)<br><span style="font-weight:normal; font-size:0.8em; color:#ccc;">Inside ${msaData.threat}</span></span>`;
        }
    } else {
         msaHtml = `<span style="color:#666; font-size:0.8em; display:block; margin-top:5px; border-top:1px solid #333;">No Threats Detected</span>`;
    }

    const content = `
        <div style="font-size:13px; min-width:120px; line-height:1.4;">
            <b style="font-size:14px; color:var(--accent-color);">${wp.data.name}</b><br>
            <hr style="margin:4px 0; border:0; border-top:1px solid #444;">
            <span style="color:#aaa">Type:</span> ${wp.data.type}<br>
            <span style="color:#aaa">Alt:</span> ${alt} ft<br>
            ${extraInfo}
            ${msaHtml}
        </div>
    `;

    wp.marker.setPopupContent(content);
}

function analyzeThreats() {
    const box = document.getElementById('kb-threats');
    if (!box) return;

    if (waypoints.length < 2) {
        box.innerHTML = "<span style='color:#666'>Add waypoints to begin analysis.</span>";
        return;
    }

    let uniqueThreats = new Map();

    waypoints.forEach((wp, idx) => {
        if(idx === 0) return;
        const wpLoc = wp.marker.getLatLng();
        const wpAlt = parseFloat(wp.data.alt) || 0; 

        for (const [id, unitMarker] of Object.entries(liveMarkers)) {
            const u = unitMarker.unitData;
            if (!u) continue;

            // Hostile + Ground(3) or Ship(4)
            const isEnemy = (u.co === 1 || u.color === '#e74c3c');
            const isSurface = (u.c === 3 || u.c === 4);
            
            if (!isEnemy || !isSurface) continue;

            const rawName = u.n || "Unknown";
            const nameUpper = rawName.toUpperCase();
            
            let threatType = null;
            let threatCeiling = 0;
            let maxRangeNM = 0;

            // 1. Check SAM DB
            let foundInDB = false;
            for (const [key, data] of Object.entries(SAM_DB)) {
                if (nameUpper.includes(key)) {
                    threatType = data.type;
                    threatCeiling = data.ceil;
                    foundInDB = true;
                    if (threatType === "LORAD") maxRangeNM = 60;
                    else if (threatType === "MERAD") maxRangeNM = 25;
                    else if (threatType === "SHORAD") maxRangeNM = 8;
                    else if (threatType === "AAA") maxRangeNM = 3;
                    break;
                }
            }

            // 2. Fallback SAM
            if (!foundInDB && (nameUpper.includes("SAM") || nameUpper.includes("RADAR"))) {
                threatType = "SHORAD"; threatCeiling = 20000; maxRangeNM = 8;
            }

            // 3. ARMOR CHECK (Ground Only u.c=3)
            if (!threatType && u.c === 3) {
                const isArmor = nameUpper.includes("TANK") || nameUpper.includes("T-") || 
                                nameUpper.includes("BMP") || nameUpper.includes("BMD") || 
                                nameUpper.includes("BTR") || nameUpper.includes("BRDM") ||
                                nameUpper.includes("ABRAMS") || nameUpper.includes("LEOPARD") || 
                                nameUpper.includes("CHALLENGER") || nameUpper.includes("MARDER") || 
                                nameUpper.includes("LAV") || nameUpper.includes("STRYKER") ||
                                nameUpper.includes("M113") || nameUpper.includes("SAU") || 
                                nameUpper.includes("GEPARD") || nameUpper.includes("MTLB") || 
                                nameUpper.includes("BRADLEY") || nameUpper.includes("M2") || 
                                nameUpper.includes("WARRIOR") || nameUpper.includes("LECLERC") || 
                                nameUpper.includes("MERKAVA") || nameUpper.includes("TOS") || 
                                nameUpper.includes("SCUD") || nameUpper.includes("AAV");

                if (isArmor) {
                    threatType = "ARMOR"; threatCeiling = 5000; maxRangeNM = 3;       
                }
            }

            // 4. NAVAL CHECK (New)
            if (!threatType && u.c === 4) {
                threatType = "NAVAL";
                
                // Distinguish between Capital ships and Speedboats
                if (nameUpper.includes("CVN") || nameUpper.includes("CARRIER") || nameUpper.includes("CRUISER") || nameUpper.includes("MOSKVA") || nameUpper.includes("PYOTR")) {
                    threatCeiling = 45000; // Heavy SAMs
                    maxRangeNM = 30;
                } 
                else if (nameUpper.includes("SPEEDBOAT") || nameUpper.includes("BOAT")) {
                    threatCeiling = 5000;  // Manpads/Guns
                    maxRangeNM = 3;
                }
                else {
                    // Frigates / Corvettes / Cargo
                    threatCeiling = 20000; 
                    maxRangeNM = 10;
                }
            }

            if (!threatType) continue;
            if (!threatFilters[threatType]) continue;

            const unitElev = u.a || 0;
            const aircraftAGL = wpAlt - unitElev;
            if (aircraftAGL > threatCeiling) continue;

            const unitLoc = L.latLng(u.la, u.lo);
            const distNM = wpLoc.distanceTo(unitLoc) * 0.000539957;

            if (distNM < maxRangeNM) {
                const bearing = GeoMath.getBearing(wpLoc.lat, wpLoc.lng, unitLoc.lat, unitLoc.lng);

                if (uniqueThreats.has(id)) {
                    const existing = uniqueThreats.get(id);
                    if (distNM < existing.dist) {
                        existing.dist = distNM;
                        existing.wpIdx = idx;
                        existing.brg = bearing;
                    }
                } else {
                    uniqueThreats.set(id, {
                        name: rawName,
                        type: threatType,
                        dist: distNM,
                        wpIdx: idx,
                        elev: unitElev,
                        brg: bearing,
                        lat: u.la, lon: u.lo
                    });
                }
            }
        }
    });

    // 4. Render Results
    if (uniqueThreats.size === 0) {
        box.innerHTML = "<span style='color:#2ecc71'>No Threats Detected (Filters Applied).</span>";
    } else {
        // Add NAVAL to buckets
        const groups = { "LORAD": [], "MERAD": [], "SHORAD": [], "AAA": [], "ARMOR": [], "NAVAL": [] };
        uniqueThreats.forEach(t => { if(groups[t.type]) groups[t.type].push(t); });

        let html = `<div style="color:#e74c3c; border-bottom: 1px solid #551111; margin-bottom:5px; font-weight:bold;">${uniqueThreats.size} THREATS DETECTED:</div>`;

        // Update Priority Order & Colors
        const typeOrder = ["LORAD", "MERAD", "SHORAD", "NAVAL", "AAA", "ARMOR"];
        const colors = { 
            "LORAD": "#ff5555", 
            "MERAD": "#e74c3c", 
            "SHORAD": "#e67e22", 
            "AAA": "#f1c40f", 
            "ARMOR": "#d35400",
            "NAVAL": "#00bcd4" // Cyan/Teal for Naval
        };

        typeOrder.forEach(type => {
            const list = groups[type];
            if (list.length > 0) {
                html += `
                <div class="threat-grid-header" style="color:${colors[type]}">
                    <span>${type} UNIT</span>
                    <span>REF (R/B)</span>
                    <span>COORD / MGRS</span> 
                    <span style="text-align:right">ELEV</span>
                </div>`;
                
                list.sort((a, b) => a.dist - b.dist);

                list.forEach(t => {
                    let coordStr = "";
                    if (typeof CoordConverter !== 'undefined') {
                        if (coordFormat === 'DD') coordStr = CoordConverter.toDD(t.lat, t.lon);
                        else if (coordFormat === 'DMS') coordStr = CoordConverter.toDMS(t.lat, t.lon);
                        else if (coordFormat === 'UTM') coordStr = CoordConverter.toUTM(t.lat, t.lon);
                        else coordStr = CoordConverter.toDDM(t.lat, t.lon); 
                    }
                    coordStr = coordStr.replace(/([NSEW])\s+/g, '$1').replace(',', '');
                    const mgrs = (typeof CoordConverter !== 'undefined') ? CoordConverter.toMGRS(t.lat, t.lon, '10') : "--";

                    html += `
                    <div class="threat-grid-row">
                        <div class="t-col-name" title="${t.name}">${t.name}</div>
                        <div class="t-col-ref">WP${t.wpIdx} <span class="t-db">${Math.round(t.dist)}nm/${Math.round(t.brg)}°</span></div>
                        <div class="t-col-coord">
                            <span>${coordStr}</span>
                            <span class="t-col-mgrs">${mgrs}</span>
                        </div>
                        <div class="t-col-elev">${t.elev}ft</div>
                    </div>`;
                });
            }
        });

        box.innerHTML = html;
    }
}


// ==========================================
// LIVE DCS DATA HANDLING (DETAILED ICONS)
// ==========================================

let liveMarkers = {}; 
let ownshipMarker = null;
let unitHistory = {}; 

/**
 * Generates Icon based on DCS Type Levels
 * Updated for Specific SAM/AAA Labels and Aircraft/Ship Text Numbers
 */
function getUnitIcon(unit, color, isOwnship = false) {
    let svgShape = '';
    let labelText = '';
    let labelSize = '10px'; 
    
    const u = unit || {};
    const rawName = u.n || u.name || "UNKNOWN";
    const name = rawName.toUpperCase();
    const cat = u.c !== undefined ? u.c : (u.cat !== undefined ? u.cat : 3);
    const unitId = u.i || u.id || "ownship";
    const heading = u.h || u.heading || u.hdg || 0;

    // --- 0. ORDNANCE (Missiles/Rockets/Shells) ---
    // Updated: Checks cat === 0 (Weapon) OR Name matches
    if (!isOwnship && (cat === 0 || name.includes("MISSILE") || name.includes("ROCKET") || name.includes("CHAFF") || name.includes("BOMB") || name.includes("AIM-") || name.includes("AGM-"))) {
        return L.divIcon({
            className: 'unit-marker',
            // FIX: Set div width/height to 6px to match iconSize
            html: `<div id="icon-shape-${unitId}" style="width:6px; height:6px;">
                     <svg width="6" height="6" viewBox="0 0 6 6">
                        <!-- Removed drop-shadow for performance/clarity on tiny dots -->
                        <circle cx="3" cy="3" r="1.5" fill="${color}" stroke="none" />
                     </svg>
                   </div>`,
            iconSize: [6, 6],   
            iconAnchor: [3, 3]
        });
    }

    // --- 1. AIRCRAFT ---
    if (isOwnship) {
        svgShape = `<path d="M12,2 L22,22 L12,18 L2,22 Z" fill="${color}" stroke="white" stroke-width="1.5" />`;
    } else if (cat === 1) { 
        svgShape = `<path d="M12,2 L22,22 L12,18 L2,22 Z" fill="${color}" fill-opacity="0.6" stroke="${color}" stroke-width="2" />`;
    }

    // --- 2. HELICOPTERS ---
    else if (cat === 2) {
        svgShape = `
            <circle cx="12" cy="12" r="8" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />
            <path d="M12,4 L12,20 M4,12 L20,12" stroke="${color}" stroke-width="2" />
        `;
    }

    // --- 3. GROUND / SHIP / SAM ---
    else {
        // --- FARP ---
        if (name.includes("FARP")) {
            svgShape = `<rect x="2" y="6" width="20" height="12" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;
            labelText = "FARP";
            labelSize = "6px";
        } else {
            const isSAM =
                name.includes("SAM") || name.includes("RADAR") || name.includes("RD_") || name.includes("S-300PS 54K6 CP") || name.includes("S-300PS 5P85C LN") || name.includes("S-300PS 5P85D LN") || name.includes("S-300PS 5H63C 30H6_TR")  || name.includes("S-300PS 40B6M TR") || name.includes("S-300PS 64H6E SR") || name.includes("S-300PS 40B6MD SR") || name.includes("P-19 S-125 SR") || name.includes("S-200_LAUNCHER") || name.includes("5P73 S-125 LN") || name.includes("SA-") ||
                name.includes("S-300") || name.includes("S-125") || name.includes("SNR S-125 TR") || name.includes("S-200") ||
                name.includes("PATRIOT") || name.includes("BUK") || name.includes("SKP-11") || name.includes("TOR") ||
                name.includes("HAWK") || name.includes("AAA") || name.includes("SHILKA") ||
                name.includes("TUNGUSKA") || name.includes("GEPARD") || name.includes("VULCAN") ||
                name.includes("IGLA") || name.includes("STRELA") || name.includes("STRELA-1") || name.includes("STRELA-") || name.includes("HEMTT_C-RAM_PHALANX") || 
		name.includes("DOG EAR") || name.includes("ROLAND") || name.includes("ROLAND ADS") || 
		name.includes("VULCAN") || name.includes("P-19") || 
                name.includes("40B6") || name.includes("OSA") || name.includes("KUB") ||
                name.includes("ZU-23") || name.includes("STINGER") ||
                name.includes("S_75") || name.includes("SNR_75") || name.includes("BOFORS40") ||
                name.includes("RPC_5N62") || name.includes("RLS_1916") || name.includes("T155_FIRTINA") || name.includes("ZSU_") || name.includes("ZSU_57_2") || name.includes("RAPIER_");

            if (isSAM) {

                // 1. Diamond Base
                svgShape = `<polygon points="12,2 22,12 12,22 2,12" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;
                
                // 2. Heading Dot (Added at the top tip)
                svgShape += `<circle cx="12" cy="2" r="2" fill="white" stroke="none" />`;

                // SAM labels (existing logic)
                if (name.includes("RPC_5N62V")) labelText = "TK";
                else if (name.includes("RLS_1916")) labelText = "TS";
                else if (name.includes("STINGER") && name.includes("SOLDIER")) svgShape += `<circle cx="12" cy="12" r="2" fill="white" />`;
                else if (name.includes("S_75M") || name.includes("VOLHOV")) labelText = "LN";
                else if (name.includes("SNR_75")) labelText = "2";

                // HAWK
                else if (name.includes("HAWK") && name.includes("CWAR")) labelText = "CW";
                else if (name.includes("HAWK") && (name.includes("LN") || name.includes("LAUNCHER"))) labelText = "LN";
                else if (name.includes("HAWK") && (name.includes("PCP") || name.includes("CP"))) labelText = "H";
                else if (name.includes("HAWK") && (name.includes("SR") || name.includes("SEARCH"))) labelText = "SR";
                else if (name.includes("HAWK") && (name.includes("TR") || name.includes("TRACK"))) labelText = "TR";

                // PATRIOT
                else if (name.includes("PATRIOT") && name.includes("LN")) labelText = "LN";
                else if (name.includes("PATRIOT") && name.includes("STR")) labelText = "TR";
                else if (name.includes("PATRIOT") && name.includes("AMG")) labelText = "AMG";
                else if (name.includes("PATRIOT") && name.includes("EPP")) labelText = "PP";
                else if (name.includes("PATRIOT") && name.includes("CP")) labelText = "CP";
                else if (name.includes("PATRIOT") && name.includes("ECS")) labelText = "CS";

                // ZU-23 Emplacement
                else if (name.includes("ZU-23") && name.includes("EMPLACEMENT")) labelText = "AAA";
                else if (name.includes("URAL-375 ZU-23")) labelText = "AAA";

                // HEMTT / GEPARD
                else if (name.includes("HEMTT_C-RAM_PHALANX")) labelText = "AAA";
                else if (name.includes("GEPARD")) labelText = "AAA";

                // Other SAM / AAA / ARMOR labels
                // *** MOVE SPECIFIC STRELAS UP ***
                else if (name.includes("STRELA-10")) labelText = "13";
                else if (name.includes("STRELA-1") || name.includes("9P31")) labelText = "9";
                
                else if (name.includes("TOR 9A331")) labelText = "15";
                else if (name.includes("9A33") || (name.includes("OSA") && name.includes("LN"))) labelText = "8";
                
                // *** GENERIC STR CHECK IS NOW SAFE BELOW ***
                else if (name.includes("1S91") || name.includes("STR")) labelText = "6";
                else if (name.includes("2P25")) labelText = "6";
                else if (name.includes("ROLAND ADS")) labelText = "ADS";
                else if (name.includes("ROLAND")) labelText = "ADS";
                else if (name.includes("SHILKA") || name.includes("ZSU-23")) labelText = "AAA";
                else if (name.includes("IGLA") || name.includes("SA-18")) labelText = "18";
                else if (name.includes("DOG EAR")) labelText = "DE";
                else if (name.includes("STRELA-10")) labelText = "13";
                else if (name.includes("STRELA-1")) labelText = "9";
		else if (name.includes("STRELA-1 9P31")) labelText = "9";
                else if (name.includes("2S6 TUNGUSKA")) labelText = "19";
		else if (name.includes("5P73 S-125 LN")) labelText = "LN";
                else if (name.includes("VULCAN")) labelText = "VC";
		else if (name.includes("SNR S-125 TR")) labelText = "TR";
		else if (name.includes("S-300PS 54K6 CP")) labelText = "10";
                else if (name.includes("S-300PS 5P85C LN")) labelText = "LN";
                else if (name.includes("S-300PS 5P85D LN")) labelText = "LN";
		else if (name.includes("S-300PS 40B6M TR")) labelText = "TR";
                else if (name.includes("S-300PS 64H6E SR")) labelText = "SR";
		else if (name.includes("S-300PS 40B6MD SR")) labelText = "SR";
		else if (name.includes("S-200_LAUNCHER")) labelText = "LN";
		else if (name.includes("P-19 S-125 SR")) labelText = "SR";
		else if (name.includes("SA-11 BUK CC 9S470M1")) labelText = "11";
		else if (name.includes("SA-11 BUK SR 9S18M1")) labelText = "SR";
		else if (name.includes("SA-11 BUK LN 9A310M1")) labelText = "LN";
		else if (name.includes("SKP-11")) labelText = "CP";
		else if (name.includes("S-300PS 5H63C 30H6_TR")) labelText = "TR";
		else if (name.includes("RAPIER_FSA_BLINDFIRE_RADAR")) labelText = "RDR";
		else if (name.includes("BOFORS40")) labelText = "AAA";
		else if (name.includes("RD_75")) labelText = "RF";
		else if (name.includes("ZSU_57_2")) labelText = "AAA";
		else if (name.includes("T155_FIRTINA")) labelText = "AAA";
                labelSize = "7px";
            }

            // 4. --- ARMOR GROUP ---
            // 1. ADD NEW KEYWORDS HERE (The Gatekeeper)
            else if (name.includes("T-72") || name.includes("BMD") || name.includes("T-90") || name.includes("T-80UD") || name.includes("T-55") || name.includes("M-1 ABRAMS") || name.includes("BMP") || name.includes("BTR") || name.includes("ZWEZDNY") || name.includes("HANDYWIND") || name.includes("OIL RIG") || name.includes("SAU") || name.includes("PT_76")) {
                
                // Common Shape: Square for all Armor
                svgShape = `<rect x="4" y="4" width="16" height="16" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;

		// 2. Heading Dot (Added at the top tip)
                svgShape += `<circle cx="12" cy="2" r="2" fill="white" stroke="none" />`;

                // 2. DEFINE LABELS HERE
                if (name.includes("T-72")) labelText = "T72";
                else if (name.includes("T-90")) labelText = "T90";
		else if (name.includes("T-80UD")) labelText = "T80";
		else if (name.includes("T-55")) labelText = "T55";
		else if (name.includes("M-1 ABRAMS")) labelText = "M-1"
                else if (name.includes("BMD")) labelText = "BMD";
                else if (name.includes("BMP")) labelText = "BMP"; // Covers BMP-1, BMP-2, BMP-3
                else if (name.includes("SAU")) labelText = "SAU"; // Covers Gvozdika and Msta
		else if (name.includes("BTR")) labelText = "BTR";
		else if (name.includes("PT_76")) labelText = "T76";
		else if (name.includes("ZWEZDNY")) labelText = "RIG";
		else if (name.includes("HANDYWIND")) labelText = "RIG";
		else if (name.includes("OIL RIG")) labelText = "RIG";
                labelSize = "7px";
            }

            // 5. ---INFANTRY---
            else if (name.includes("INFANTRY") || name.includes("SOLDIER") || name.includes("M4") || name.includes("PARATROOPER")) {
                svgShape = `<circle cx="12" cy="12" r="6" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;
                svgShape += `<circle cx="12" cy="12" r="2" fill="white" />`;
            }

		
            // --- NAVIGATION / BEACONS ---
            else if (name.includes("TACAN") || name.includes("BEACON") || name.includes("VOR") || name.includes("NDB")) {
                
                // Shape: Hexagon with a center dot
                // Points: Top(12,2), TopRight(21,7), BotRight(21,17), Bot(12,22), BotLeft(3,17), TopLeft(3,7)
                svgShape = `<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="2" />`;
                svgShape += `<circle cx="12" cy="12" r="2" fill="white" />`;

                // Labels
                if (name.includes("TACAN")) labelText = "TCN";
                else if (name.includes("VOR")) labelText = "VOR";
                else if (name.includes("NDB")) labelText = "NDB";
                else labelText = "NAV";
                
                labelSize = "7px"; // Slightly smaller to fit in the hex
            }


               // --- EWR (Early Warning Radar) ---
            else if (name.includes("FPS-117") || name.includes("1L13") || name.includes("55G6") || name.includes("EWR")) {
                svgShape = "";
                 // 2. The 3 "WiFi" Waves
                // Bottom Wave
                svgShape += `<path d="M8,7 Q12,4 16,7" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />`;
                // Middle Wave
                svgShape += `<path d="M5,4 Q12,0 19,4" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />`;
                // Top Wave
                svgShape += `<path d="M2,1 Q12,-4 22,1" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" />`;

                // 3. Labels
                if (name.includes("FPS-117")) labelText = "117";
                else if (name.includes("1L13")) labelText = "EWR";
                else if (name.includes("55G6")) labelText = "EWR";
                else labelText = "RDR";
                
                // Move text down to fit in the squashed diamond
                // (We achieve this by NOT changing anything, as the center of the 24x24 box 
                // is Y=12, which aligns perfectly with the top of our lowered diamond).
                labelSize = "8px"; 
            }
	    


            // --- 4. NAVAL UNITS ---
            else if (cat === 4 || name.includes("USS") || name.includes("SHIP")) {
                
                // CARRIER / LHA (Detailed Shape)
                if (name.includes("CVN") || name.includes("KUZNETSOV") || name.includes("LHA") || name.includes("TARAWA") || name.includes("FORRESTAL") || name.includes("CV_1143_5") || name.includes("INVINCIBLE") || name.includes("KUZNECOW") || name.includes("STENNIS") || name.includes("ESSEX") || name.includes("ARA_VDM") || name.includes("KUZNECOV")) {
                    
                    // Note the 'transform="rotate(-90 12 12)"' -> Rotates the drawing -90deg around the center (12,12)
                    // This makes the right-facing drawing point UP (North) by default.
                    svgShape = `
                        <path 
                            d="M5 9 L8.5 8 L11 6 L22 6 L22 7 L30 8.5 L30 14.5 L22 16 L20.5 19 L11 19 L8.5 16.5 L5 15 Z"
                            fill="${color}" 
                            fill-opacity="0.5" 
                            stroke="${color}" 
                            stroke-width="2"
                            transform="translate(-5.5 -0.5) rotate(-90 17.5 12.5)" 
                        />`;
                    
                    // Labels
                    if (name.includes("CVN")) labelText = "CVN";
                    else if (name.includes("LHA")) labelText = "LHA";
		    else if (name.includes("CV_")) labelText = "CV";
		    else if (name.includes("STENNIS")) labelText = "CVN";
		    else if (name.includes("TARAWA")) labelText = "LHA";
		    else if (name.includes("ESSEX")) labelText = "LHA";
                    else labelText = "CV";
		    labelSize = "8px";
                }
                // SUBMARINE
                else if (name.includes("SUB") || name.includes("SSN") || name.includes("KILO")) {
                    svgShape = `<path d="M12,2 Q18,2 18,12 Q18,22 12,22 Q6,22 6,12 Q6,2 12,2" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;
                    labelText = "SUB";
                    labelSize = "8px";
                }
                // GENERIC SHIP (Destroyers, Frigates, etc)
                else {
                    svgShape = `<path d="M12,0 L18,4 L18,16 Q12,22 6,16 L6,4 Z" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`;
                    
                    if (name.includes("TICONDEROG")) labelText = "CG";
		    else if (name.includes("REZKY")) labelText = "DDG";
		    else if (name.includes("ALBATROS")) labelText = "DDG";
		    else if (name.includes("052C")) labelText = "DDG";
		    else if (name.includes("052B")) labelText = "DDG";
		    else if (name.includes("054A")) labelText = "DDG";
		    else if (name.includes("DRY-CARGO-SHIP-2")) labelText = "SUP";
		    else if (name.includes("SEAWISE_GIANT")) labelText = "SUP";
		    else if (name.includes("SHIP_TILDE_SUPPLY")) labelText = "SUP";
		    else if (name.includes("ELNYA")) labelText = "DDG";
                    else if (name.includes("USS_ARLEIGH_BURKE_")) labelText = "DDG";
                    else if (name.includes("PERRY")) labelText = "FFG";
		    else if (name.includes("TYPE_071")) labelText = "FFG";
                    else if (name.includes("MOSCOW") || name.includes("PIOTR") || name.includes("SLAVA")) labelText = "CG";
                    else if (name.includes("MOLNIYA")) labelText = "COR";
                    else if (name.includes("SPEEDBOAT") || name.includes("COMBATTANTE")) labelText = "PT";
		    labelSize = "8px";
                }
            }
            // Generic ground
            else {
                svgShape = `<circle cx="12" cy="12" r="6" fill="${color}" fill-opacity="0.5" stroke="${color}" stroke-width="2" />`; 

            }
        }
    }

    // --- Aircraft specific numbers ---
    if (cat === 1) {
        if (name.includes("F18")) labelText = "18";
        else if (name.includes("KC-135")) labelText = "135";
        else if (name.includes("KC135MPRS")) labelText = "MPRS";
        else if (name.includes("E-3A")) labelText = "E3";
        else if (name.includes("E-2C")) labelText = "E3";
        else if (name.includes("FA-18C_")) labelText = "18";
        else if (name.includes("SU-27")) labelText = "27";
	else if (name.includes("MIG-31")) labelText = "31";
	else if (name.includes("SU-33")) labelText = "33";
	else if (name.includes("SU-30")) labelText = "30";
	else if (name.includes("A-50")) labelText = "50";
	else if (name.includes("SU-25T")) labelText = "25";
        else if (name.includes("SU-25")) labelText = "25";
	else if (name.includes("MIG-21BIS")) labelText = "21";
	else if (name.includes("F-16C_50")) labelText = "16";
	else if (name.includes("PILOT")) labelText = "PILOT";
        else if (name.includes("A-10C_2")) labelText = "10";
	else if (name.includes("F-15C")) labelText = "15";
	else if (name.includes("MIG-29S")) labelText = "29";
	else if (name.includes("MIG-29A")) labelText = "29";
	else if (name.includes("J-11A")) labelText = "11";
	else if (name.includes("F-4")) labelText = "F4";
	else if (name.includes("A-6")) labelText = "A6";
	else if (name.includes("F-5E-3")) labelText = "F5";
	else if (name.includes("MQ-9 REAPER")) labelText = "MQ9";
	else if (name.includes("YAK-40")) labelText = "40";
	else if (name.includes("YAK-52")) labelText = "52";
	else if (name.includes("SU-34")) labelText = "34";
	else if (name.includes("TU-142")) labelText = "142";
	else if (name.includes("TU-22M3")) labelText = "22";
	else if (name.includes("AV8BNA")) labelText = "AV8";
	else if (name.includes("C-101CC")) labelText = "101";
	else if (name.includes("C-130J-30")) labelText = "130";
	else if (name.includes("F-14A-135-GR")) labelText = "14";
	else if (name.includes("F-15ESE")) labelText = "15";
	else if (name.includes("JF-17")) labelText = "J17";
	else if (name.includes("SU-24M")) labelText = "24";
	else if (name.includes("SU-17M4")) labelText = "17";
	else if (name.includes("MIRAGE_F1EE")) labelText = "F1";
	else if (name.includes("MIG-25PD")) labelText = "25";
	else if (name.includes("MIG-23MLD")) labelText = "23";
	else if (name.includes("S-3B TANKER")) labelText = "S3";
	else if (name.includes("F-14B")) labelText = "14";
	else if (name.includes("P-51D")) labelText = "51";
	else if (name.includes("IL-78M")) labelText = "AWAC";
	else if (name.includes("KC130")) labelText = "130";
        labelSize = "8px";
    }

	// --- Aircraft specific numbers ---
    if (cat === 2) {
        if (name.includes("AH-64D_BLK_II")) labelText = "64";
        else if (name.includes("MI-26")) labelText = "26";
	else if (name.includes("AH-1W")) labelText = "H1";
	else if (name.includes("MI-24P")) labelText = "24";
	else if (name.includes("MI-28N")) labelText = "28";
        labelSize = "8px";
    }

    const shapeId = isOwnship ? 'ownship-icon-shape' : `icon-shape-${unitId}`;

    // --- Rotate aircraft, ownship, and ships/subs according to heading ---
    const rotateStyle = (isOwnship || cat === 1 || cat === 4 || name.includes("SHIP") || name.includes("SUB"))
        ? `transform: rotate(${heading}deg); transform-origin: 50% 50%; transition: transform 2s linear;`
        : '';

    const labelHtml = labelText ? 
        `<div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; pointer-events:none;">
            <span class="icon-label-text" style="font-family:Arial; font-weight:900; font-size:${labelSize}; color:white; text-shadow:1px 1px 2px black;">${labelText}</span>
         </div>` : '';

    return L.divIcon({
        className: 'unit-marker',
        html: `
            <div style="position:relative; width:24px; height:24px;">
                <div id="${shapeId}" style="width:100%; height:100%; position:absolute; top:0; left:0; ${rotateStyle}">
                    <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(1px 1px 2px black); overflow:visible;">
                        ${svgShape}
                    </svg>
                </div>
                ${labelHtml}
            </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });
}

// --- WAYPOINT PUNCH STATUS ---
socket.on('punchStatus', (msg) => {
    // Debug log still shows specific details in the F12 console if you need them
    console.log("Punch Status:", msg);
    
    const el = document.getElementById('punch-status');
    if(el) {
        
        // 1. Success State
        if(msg.includes("Complete")) {
            el.innerText = "Done";
            el.style.color = "#2ecc71"; // Green
            setTimeout(() => el.innerText = "", 5000);
        } 
        
        // 2. Error State
        else if (msg.includes("Error")) {
            el.innerText = "Error";
            el.style.color = "#e74c3c"; // Red
        } 
        
        // 3. Active State (Masks "Entered: WP1" etc)
        else {
            el.innerText = "Data Transmitting...";
            el.style.color = "#f1c40f"; // Yellow
        }
    }
});


// --- PAYLOAD HOOK LISTENER (HTTP Bridge) ---
socket.on('hookPayload', (data) => {
    // Debug: See exactly what we get
    // console.log("Hook Payload:", data);

    if (!latestDcsMech) latestDcsMech = {};

    // 1. Handle Cannon
    if (data.Cannon) {
        // FIX: The debug log shows 'shells', but standard API is 'shells_count'.
        // We check 'shells' first based on your log, then fallback.
        let count = data.Cannon.shells;
        if (count === undefined) count = data.Cannon.shells_count;

        if (count !== undefined) {
            latestDcsMech.gun = count;
            
            // Live Update UI
            const gunEl = document.getElementById('gun-rounds');
            if (gunEl) gunEl.innerText = latestDcsMech.gun;
        }
        
        // Handle Gun Type
        if (data.Cannon.shell_type) {
            let typeName = "20mm";
            // Sometimes it's an object { level1:..., level4:"M61.." }, sometimes just an ID
            if (data.Cannon.shell_type.level4) {
                typeName = data.Cannon.shell_type.level4;
            }
            
            latestDcsMech.gunType = typeName;
            
            const typeEl = document.getElementById('gun-type');
            if(typeEl) typeEl.innerText = typeName;
        }
    }
    
    // 2. Optional: Store station data for backup
    // if (data.Stations) { ... }
});

socket.on('dcsUpdate', (data) => {
    if(!map) return;

    // 1. PAYLOAD (Cache for Sync)
    if(data.payload) {
        latestDcsPayload = data.payload;
    }



    // 2. MECH (Live Update for Chaff/Flare/Fuel)
    if(data.mech) {
        if (!latestDcsMech) latestDcsMech = {};
        
        // Update Chaff UI if changed
        if (data.mech.chaff !== undefined) {
            latestDcsMech.chaff = data.mech.chaff;
            const el = document.getElementById('cm-chaff');
            if (el && parseInt(el.value) !== data.mech.chaff) {
                el.value = data.mech.chaff;
            }
        }

        // Update Flare UI if changed
        if (data.mech.flare !== undefined) {
            latestDcsMech.flare = data.mech.flare;
            const el = document.getElementById('cm-flare');
            if (el && parseInt(el.value) !== data.mech.flare) {
                el.value = data.mech.flare;
            }
        }
        
        // Update Totals
        updateCM(); 

        // Update Fuel Variables (Do not move slider automatically to avoid fighting user)
        if (data.mech.fuelInt !== undefined) latestDcsMech.fuelInt = data.mech.fuelInt;
        if (data.mech.fuelExt !== undefined) latestDcsMech.fuelExt = data.mech.fuelExt;
    } 

    // 3. WEATHER (Throttled Update)
    if(data.weather) {
        // Update Global State
        weatherState = data.weather; 

        // A. Always update the "Live Wind" display box
        let wxBox = document.getElementById('live-wx-display');
        if(!wxBox) {
            const panel = document.querySelector('.leg-info-panel');
            if(panel) {
                wxBox = document.createElement('div');
                wxBox.id = 'live-wx-display';
                wxBox.className = 'calc-box';
                wxBox.style.borderLeft = "1px solid #444";
                wxBox.style.paddingLeft = "10px";
                panel.appendChild(wxBox);
            }
        }
        if(wxBox) {
            const dirStr = data.weather.dir.toString().padStart(3, '0');
            wxBox.innerHTML = `<label style="color:#2ecc71">Live Wind</label><span style="font-size:1rem; color:white;">${dirStr}° / ${data.weather.spd} kt</span>`;
        }

        // B. Throttling Logic: Only Run Fuel Calc if wind changes > 1 unit
        // This prevents the table from refreshing constantly and killing input focus
        if (Math.abs(data.weather.spd - lastWindSpd) > 1 || Math.abs(data.weather.dir - lastWindDir) > 1) {
            lastWindSpd = data.weather.spd;
            lastWindDir = data.weather.dir;
            
            weatherState.windSpd = data.weather.spd;
            weatherState.windDir = data.weather.dir;
            
            // Update Ground Layer assumption
            weatherState.layers.ground = { spd: data.weather.spd, dir: data.weather.dir };

            runFuelCalc(); 
        }
    }   

    const now = Date.now();

    // 4. OWNSHIP
    if(data.ownship) {
	// STORE DATA FOR WP0 GENERATION
        currentOwnship = data.ownship;
        const pos = [data.ownship.lat, data.ownship.lon];
        myLat = data.ownship.lat;
        myLon = data.ownship.lon;
        let deg = data.ownship.hdg * (180 / Math.PI); 

// *** NEW: UPDATE FLIGHT HISTORY ***
        // Optimization: Only add point if we moved distance to prevent array bloating on the ramp
        // Simple check: Is array empty OR is distance > ~20 meters from last point?
        if (flightHistoryPts.length === 0) {
             flightHistoryPts.push(pos);
             historyPolyline.setLatLngs(flightHistoryPts);
        } else {
             const lastPt = flightHistoryPts[flightHistoryPts.length - 1];
             // Approx distance check (difference in coords)
             // 0.0002 deg is roughly 20 meters
             if (Math.abs(pos[0] - lastPt[0]) > 0.0002 || Math.abs(pos[1] - lastPt[1]) > 0.0002) {
                 flightHistoryPts.push(pos);
                 historyPolyline.setLatLngs(flightHistoryPts);
             }
        }

        // UPDATE CALLSIGN DISPLAY (Group | Unit)
        const csDisplay = document.getElementById('callsign-display');
        if (csDisplay && data.ownship.name) {
            let fullCallsign = data.ownship.name;
            
            // If Group Name exists, prepend it
            if (data.ownship.group) {
                fullCallsign = `${data.ownship.group} | ${data.ownship.name}`;
            }

            // Only update DOM if changed
            if (csDisplay.innerText !== fullCallsign) {
                csDisplay.innerText = fullCallsign;
            }
        }

        if(!ownshipMarker) {
            // ... (Keep existing Marker Creation) ...
            ownshipMarker = L.marker(pos, {
                icon: getUnitIcon(null, '#2ecc71', true), // Green
                zIndexOffset: 1000 
            }).addTo(map);
            map.setView(pos, 10);
        } else {
            ownshipMarker.setLatLng(pos);
            const iconDiv = document.getElementById('ownship-icon-shape');
            if(iconDiv) iconDiv.style.transform = `rotate(${deg}deg)`;
	    if (isFollowMode) {
                // panTo is smoother than setView for small movements
                map.panTo(pos);
		}
        }
    }

    // 5. OTHER UNITS
    if(data.units) {
        const seenIds = new Set();

        data.units.forEach(rawUnit => {
            // NORMALIZE
            const u = {
                id: rawUnit.i || rawUnit.id,
                n: rawUnit.n || rawUnit.name || "Unknown",
                c: rawUnit.c !== undefined ? rawUnit.c : (rawUnit.cat !== undefined ? rawUnit.cat : 3),
                co: rawUnit.co !== undefined ? rawUnit.co : rawUnit.coalition,
                la: rawUnit.la || rawUnit.lat,
                lo: rawUnit.lo || rawUnit.lon,
                a: rawUnit.a || rawUnit.alt || 0,
                h: rawUnit.h || rawUnit.hdg || 0
            };

            // Ghost Filter
            if (data.ownship && Math.abs(u.la - data.ownship.lat) < 0.0001 && Math.abs(u.lo - data.ownship.lon) < 0.0001) {
                return; 
            }

            seenIds.add(u.id);
            const pos = [u.la, u.lo];
            
            // Colors
            let color = '#888'; 
            if (u.co === 1) color = '#e74c3c'; // Red
            if (u.co === 2) color = '#4a90e2'; // Blue

            // Speed Calc
            let speedKnots = 0;
            if (unitHistory[u.id]) {
                const prev = unitHistory[u.id];
                const dt = (now - prev.time) / 1000; 
                if (dt > 0) {
                    const p1 = L.latLng(prev.lat, prev.lon);
                    const p2 = L.latLng(u.la, u.lo);
                    const distMeters = p1.distanceTo(p2);
                    speedKnots = (distMeters / dt) * 1.94384; 
                }
            }
            unitHistory[u.id] = { lat: u.la, lon: u.lo, time: now };
            let hdgDeg = u.h * (180 / Math.PI);

            if(liveMarkers[u.id]) {
                // Update
                let m = liveMarkers[u.id];
                m.setLatLng(pos);		
                
                // ROTATE SHAPE ONLY (Fixes Text Rotation)
                const iconDiv = document.getElementById(`icon-shape-${u.id}`);
                if(iconDiv) iconDiv.style.transform = `rotate(${hdgDeg}deg)`;
                
                // Update Popup Data
                m.unitData = { ...u, speed: speedKnots, color: color };
                if (m.getPopup() && m.getPopup().isOpen()) {
                    m.setPopupContent(buildPopupContent(m.unitData));
                }
		updateMarkerRing(m);

            } else {
                // Create
                const m = L.marker(pos, { icon: getUnitIcon(u, color, false) }).addTo(map);
                m.unitData = { ...u, speed: speedKnots, color: color };
                m.bindPopup(buildPopupContent(m.unitData));
		updateMarkerRing(m);
                liveMarkers[u.id] = m;
            }
        });

        for (const id in liveMarkers) {
            if (!seenIds.has(parseInt(id)) && !seenIds.has(String(id))) {
                
                // --- REMOVE NEW RINGS ---
                if (liveMarkers[id].ringDetect) {
                    map.removeLayer(liveMarkers[id].ringDetect);
                }
                if (liveMarkers[id].ringKill) {
                    map.removeLayer(liveMarkers[id].ringKill);
                }

                // --- REMOVE LEGACY RING (Safety check) ---
                if (liveMarkers[id].threatCircle) {
                    map.removeLayer(liveMarkers[id].threatCircle);
                }

                // --- REMOVE MARKER & DATA ---
                map.removeLayer(liveMarkers[id]);
                delete liveMarkers[id];
                delete unitHistory[id];
            }
        }
        
        analyzeThreats();
        updateHardTargets();
	resizeActiveAccordions();
    }
});

function cycleMapFocus(direction) {
    if (waypoints.length === 0) return;

    // Increment/Decrement
    currentFocusIndex += direction;

    // Bounds Check (Loop around)
    if (currentFocusIndex >= waypoints.length) currentFocusIndex = 0;
    if (currentFocusIndex < 0) currentFocusIndex = waypoints.length - 1;

    const wp = waypoints[currentFocusIndex];
    const pos = wp.marker.getLatLng();

    // Fly to point
    // zoom: 11 is a good "Target View" level
    map.flyTo(pos, 11, {
        animate: true,
        duration: 1.5 // Seconds
    });

    // Open Popup to identify it
    wp.marker.openPopup();
}

// ==========================================
// 2. CLIENT SYNCHRONIZATION LISTENERS (OUTSIDE)
// ==========================================

socket.on('externalRouteUpdate', (payload) => {
    // Prevent feedback loop if we just sent this
    // (Optional: add sender ID logic, but clearing arrays usually prevents infinite loops here)
    
    console.log("Received Sync Data from peer");

    // 1. CLEAR CURRENT STATE (Visuals Only)
    waypoints.forEach(wp => map.removeLayer(wp.marker));
    legLabels.forEach(lbl => map.removeLayer(lbl));
    
    // Clear Arrays
    waypoints = [];
    legLabels = [];
    
    // 2. REBUILD WAYPOINTS
    if (payload.waypoints) {
        payload.waypoints.forEach(rawWp => {
            reconstructWaypoint(rawWp);
        });
    }

    // 3. REBUILD HISTORY
    if (payload.history) {
        flightHistoryPts = payload.history;
        if(historyPolyline) historyPolyline.setLatLngs(flightHistoryPts);
    }

    // 4. REFRESH UI
    runFuelCalc();
    updatePolyline();
    renderTable();
    setTimeout(() => {
        refreshNavAccordionHeight();
    }, 50);

    saveData(); 
});

// ==========================================
// BRIEFING INTEL EXTRACTOR
// ==========================================
function extractIntelToNotes(briefingText) {
    const notesBox = document.getElementById('comm-notes');
    if (!notesBox || !briefingText) return;

    // 1. Gather all active frequencies from your presets
    const activeFreqs = new Set();
    
    const scrape = (id) => {
        const container = document.getElementById(id);
        if(!container) return;
        const inputs = container.querySelectorAll('.comm-freq');
        inputs.forEach(inp => {
            const val = parseFloat(inp.value); // Convert "132.000" -> 132
            if (!isNaN(val) && val > 0) {
                activeFreqs.add(val);
            }
        });
    };
    
    scrape('comm1-container');
    scrape('comm2-container');

    if (activeFreqs.size === 0) return;

    // 2. Scan Briefing for Matches
    // We split by newlines to check line-by-line
    const lines = briefingText.split(/\r?\n/);
    const matches = new Set(); // Use Set to avoid duplicate lines

    lines.forEach(line => {
        // Simple check: Does this line contain any of our frequencies?
        // We check against the float value to match "132.000" with "132AM" or "132.0"
        
        // Skip empty or short lines
        if (line.length < 10) return;

        for (let freq of activeFreqs) {
            // Regex explanations:
            // \b = word boundary (prevents matching 132 in 1132)
            // freq = the number (e.g. 127.5)
            // (?:...)? = optional decimal zeros
            
            // We just check if the line contains the number. 
            // e.g. "127.5" inside "CVN: 127.5AM"
            if (line.includes(freq.toString())) {
                
                // Extra verification: Is it actually a frequency? 
                // (Avoiding false positives like Runway Heading 132)
                // We check if the line implies comms/nav info
                const upper = line.toUpperCase();
                const isRelevant = upper.includes("AM") || upper.includes("FM") || upper.includes("MHZ") || upper.includes("TCN") || upper.includes("ICLS") || upper.includes("CHAN");
                
                if (isRelevant) {
                    matches.add(line.trim());
                }
            }
        }
    });

    // 3. Update Notes Box
    if (matches.size > 0) {
        let currentText = notesBox.value;
        const header = "\n\n--- BRIEFING INTEL ---";
        
        // Remove old intel block if it exists to avoid duplication on reload
        if (currentText.includes(header)) {
            currentText = currentText.split(header)[0];
        }

        const newContent = Array.from(matches).join('\n');
        notesBox.value = currentText.trim() + header + "\n" + newContent;
        
        // Save the change
        saveData();
    }
}

// ==========================================
// 3. SYNC HELPERS
// ==========================================

function broadcastRouteState() {
    // 1. Strip Circular References (Leaflet Markers)
    const cleanWaypoints = waypoints.map(wp => ({
        lat: wp.marker.getLatLng().lat,
        lng: wp.marker.getLatLng().lng,
        data: wp.data,
        recMach: wp.recMach,
        calculatedFuel: wp.calculatedFuel
    }));

    // 2. Send Payload
    const payload = {
        waypoints: cleanWaypoints,
        history: flightHistoryPts
    };

    socket.emit('syncRoute', payload);
}

function reconstructWaypoint(rawWp) {
    let cssClass = 'nav-dot';
    if(rawWp.data.type === 'TGT') cssClass += ' tgt';
    if(rawWp.data.type === 'IP') cssClass += ' ip';
    if(rawWp.data.type === 'TANKER') cssClass += ' tanker';
    if(rawWp.data.type === 'MARSHALL') cssClass += ' marshall';

    const customIcon = L.divIcon({ className: cssClass, iconSize: [12, 12], iconAnchor: [6, 6] });
    const latlng = L.latLng(rawWp.lat, rawWp.lng);

    const marker = L.marker(latlng, { draggable: true, icon: customIcon, title: rawWp.data.name }).addTo(map);

    const wpObj = { id: Date.now() + Math.random(), marker: marker, data: rawWp.data };
    
    if(rawWp.recMach) wpObj.recMach = rawWp.recMach;
    if(rawWp.calculatedFuel) wpObj.calculatedFuel = rawWp.calculatedFuel;

    // --- EVENTS ---
    marker.on('drag', () => { updatePolyline(); }); 
    
    // *** THE CRITICAL FIX ***
    marker.on('dragend', () => { 
        runFuelCalc(); 
        updatePolyline(); 
        saveData(); 
        broadcastRouteState(); // <--- Updates the other screen immediately
    }); 
    
    marker.bindPopup(() => `<b>${wpObj.data.name}</b><br>Type: ${wpObj.data.type}<br>Alt: ${wpObj.data.alt} ft`);
    
    waypoints.push(wpObj);
}

function buildPopupContent(u) {
    // 1. Identify Type Name
    let typeName = "Unknown";
    if(u.c === 1) typeName = "Air";
    if(u.c === 2) typeName = "Helo";
    if(u.c === 3) typeName = "Ground";
    if(u.c === 4) typeName = "Naval";
    if(u.c === 0) typeName = "Weapon";

    // 2. Coordinate Conversion
    let coordStr = "";
    if (typeof CoordConverter !== 'undefined') {
        if (coordFormat === 'DD') coordStr = CoordConverter.toDD(u.la, u.lo);
        else if (coordFormat === 'DMS') coordStr = CoordConverter.toDMS(u.la, u.lo);
        else if (coordFormat === 'MGRS_10') coordStr = CoordConverter.toMGRS(u.la, u.lo, '10');
        else if (coordFormat === 'MGRS_6') coordStr = CoordConverter.toMGRS(u.la, u.lo, '6');
        else if (coordFormat === 'UTM') coordStr = CoordConverter.toUTM(u.la, u.lo);
        else coordStr = CoordConverter.toDDM(u.la, u.lo);
    }

    // 3. Build HTML (Coalition Removed)
    return `
        <div style="min-width:180px; font-size:0.9rem;">
            <strong style="color:${u.color}; font-size:1.1rem;">${u.n}</strong><br>
            <hr style="margin:4px 0; border:0; border-top:1px solid #444;">
            
            <span style="color:#aaa">Type:</span> <span style="color:white">${typeName}</span><br>
            <span style="color:#aaa">Altitude:</span> <span style="color:white">${u.a} ft</span><br>
            <span style="color:#aaa">Speed:</span> <span style="color:white">${Math.round(u.speed || 0)} kts</span><br>
            <span style="color:#aaa">Heading:</span> <span style="color:white">${Math.round(u.h * (180/Math.PI))}°</span><br>
            
            <div style="font-size:0.8rem; color:var(--accent-color); margin-top:8px; font-family:monospace; border:1px solid #444; background:#000; padding:4px; text-align:center;">
                ${coordStr}
            </div>
        </div>
    `;
}

/**
 * Calculates the shortest distance (in Meters) from a Point to a Line Segment (p1 to p2).
 * Uses Lat/Lon projection to find the closest point on the line, then measures distance.
 */
function getDistToSegmentMeters(pt, p1, p2) {
    // Treat Lat/Lon as X/Y for projection ratio (t)
    const x = pt.lat, y = pt.lng;
    const x1 = p1.lat, y1 = p1.lng;
    const x2 = p2.lat, y2 = p2.lng;

    const A = x - x1;
    const B = y - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    
    // Find parameter 't' (0 = at p1, 1 = at p2)
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;

    let xx, yy;

    if (param < 0) {
        // Closest point is start of segment (p1)
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        // Closest point is end of segment (p2)
        xx = x2;
        yy = y2;
    } else {
        // Closest point is somewhere on the line
        xx = x1 + param * C;
        yy = y1 + param * D;
    }

    // Measure geodesic distance from Unit to that projected point
    return pt.distanceTo(L.latLng(xx, yy));
}

// ==========================================
// AUTO-ENTRY (UFC PUNCHER)
// ==========================================

function autoEntryWaypoints() {
    // 1. LOCK CHECK
    if (isPunching) return; // Ignore clicks if already running

    // 2. Validation
    if (waypoints.length < 2) {
        if (!document.body.classList.contains('kb-mode')) {
            alert("You need at least 1 destination waypoint (WP1+) to auto-enter.");
        }
        return;
    }

    // Define Execution
    const executePunch = () => {
        // LOCK THE SYSTEM
        isPunching = true;

        // Visual Feedback (Map Button)
        const mapBtn = document.querySelector('.btn-punch-map');
        if(mapBtn) {
            mapBtn.innerHTML = "⏳"; 
            mapBtn.style.backgroundColor = "#f1c40f"; 
            mapBtn.style.cursor = "not-allowed"; // Visual disable
            mapBtn.style.opacity = "0.7";
        }

        // Visual Feedback (Header Button)
        // We find it by looking for the button that calls this function, or just query buttons generally
        const headerBtns = document.querySelectorAll('.header-actions button');
        headerBtns.forEach(b => {
            if(b.innerText === "PUNCH") {
                b.disabled = true;
                b.style.borderColor = "#f1c40f";
                b.style.color = "#f1c40f";
                b.innerText = "BUSY";
            }
        });

        // Status Text
        const statusEl = document.getElementById('punch-status');
        if(statusEl) statusEl.innerText = "Transmitting...";

        // Prepare Data
        const punchList = [];
        for (let i = 1; i < waypoints.length; i++) {
            const wp = waypoints[i];
            const latlng = wp.marker.getLatLng();

            let elevationFt = parseFloat(wp.data.alt) || 0;
            if (wp.data.type === 'TGT') {
                const tgt = parseFloat(wp.data.tgtElev);
                if (!isNaN(tgt) && tgt !== 0) elevationFt = tgt;
            }

            punchList.push({
                id: i,
                name: wp.data.name,
                lat: latlng.lat,
                long: latlng.lng, 
                elev: Math.round(elevationFt) 
            });
        }

        // Send
        socket.emit('startWaypointPunch', punchList);
    };

    // 3. CHECK MODE
    if (document.body.classList.contains('kb-mode')) {
        executePunch();
    } else {
        const safetyCheck = confirm(
            "⚠️ PRE-PUNCH CHECKLIST ⚠️\n\n" +
            "1. DCS is UNPAUSED.\n" +
            "2. F/A-18C Cockpit is active.\n" +
            "3. AMPCD (Center Screen) is on HSI Page.\n" +
            "4. HSI > DATA > A/C > PRECISE is Boxed.\n" +
            "5. Hands off mouse/keyboard.\n\n" +
            "Ready to type?"
        );

        if (safetyCheck) {
            executePunch();
        }
    }
}

// --- LISTEN FOR SERVER PROGRESS ---
socket.on('punchStatus', (msg) => {
    console.log("Punch Status:", msg);
    
    // Check if finished (Success or Error)
    const isFinished = msg.includes("Complete") || msg.includes("Error");

    // 1. Update Desktop Header Text
    const el = document.getElementById('punch-status');
    if(el) {
        if(msg.includes("Complete")) {
            el.innerText = "Done";
            el.style.color = "#2ecc71";
            setTimeout(() => el.innerText = "", 5000);
        } else if (msg.includes("Error")) {
            el.innerText = "Error";
            el.style.color = "#e74c3c";
        } else {
            el.innerText = msg;
            el.style.color = "#f1c40f"; 
        }
    }

    // 2. Update Map Button
    const mapBtn = document.querySelector('.btn-punch-map');
    if(mapBtn) {
        if(msg.includes("Complete")) {
            mapBtn.innerHTML = "✔"; 
            mapBtn.style.backgroundColor = "#2ecc71"; 
        } 
        else if (msg.includes("Error")) {
            mapBtn.innerHTML = "!";
            mapBtn.style.backgroundColor = "#e74c3c"; 
        }
    }

    // 3. UNLOCK IF FINISHED
    if (isFinished) {
        isPunching = false; // Unlock logic
        
        // Reset Map Button visual after delay
        if (mapBtn) {
            setTimeout(() => { 
                mapBtn.innerHTML = "P";
                mapBtn.style.backgroundColor = ""; 
                mapBtn.style.cursor = "pointer";
                mapBtn.style.opacity = "1";
            }, 3000);
        }

        // Reset Header Button
        const headerBtns = document.querySelectorAll('.header-actions button');
        headerBtns.forEach(b => {
            if(b.innerText === "BUSY") { // Find the one we changed
                b.disabled = false;
                b.style.borderColor = "#e67e22";
                b.style.color = "#e67e22";
                b.innerText = "PUNCH";
            }
        });
    }
});

// ==========================================
// MISSION ASSETS PARSER (SUPPORTING AGENCIES)
// ==========================================

function updateMissionAssets(mission) {
    const tbody = document.getElementById('mission-assets-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const assets = [];
    
    // RESET MAP
    liveRadioMap = {}; 

    const processGroups = (groups) => {
        if (!groups) return;
        
        groups.forEach(group => {
            const task = group.task || "Nothing"; 
            if (taskFilters[task] === false) return; 

            const name = group.name;
            
            let freq = group.frequency || 0;
            if (freq > 1000000) freq = freq / 1000000;
            if (freq === 0) return;

            // Format to 3 decimals (e.g. 132.000)
            const freqStr = freq.toFixed(3);
            
            // MAP IT: If this freq isn't mapped yet, store the name
            // (First found wins, or you could add logic to prefer AWACS over Tankers etc)
            if (!liveRadioMap[freqStr]) {
                liveRadioMap[freqStr] = name;
            }

            let unitType = (group.units && group.units.length > 0) ? group.units[0].type : "Unknown";
            unitType = unitType.replace(/_/g, " ").replace("hornet", "").replace("defense", "").toUpperCase();

            let onboardFuel = 0;
            if (group.units && group.units.length > 0 && group.units[0].payload) {
                onboardFuel = parseFloat(group.units[0].payload.fuel) || 0;
            }

            let maxAlt = 0;
            let avgSpeed = 0;
            
            if (group.route && group.route.points) {
                group.route.points.forEach(pt => {
                    const altFt = pt.alt * 3.28084;
                    if (altFt > maxAlt) maxAlt = altFt;
                    
                    const spdKts = pt.speed * 1.94384;
                    if (spdKts > 40 && avgSpeed === 0) avgSpeed = spdKts;
                });
            }

            assets.push({
                name: name,
                type: unitType,
                task: task,
                fuel: onboardFuel,
                freq: freqStr, // Use formatted string
                alt: Math.round(maxAlt / 100) * 100,
                speed: Math.round(avgSpeed)
            });
        });
    };

    if (mission.coalition && mission.coalition.blue && mission.coalition.blue.country) {
        const countries = mission.coalition.blue.country;
        countries.forEach(c => {
            if (c.plane && c.plane.group) processGroups(c.plane.group);
            if (c.helicopter && c.helicopter.group) processGroups(c.helicopter.group);
        });
    }

    // TRIGGER SYNC PRESETS
    syncCommNames(); 

    if (assets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#888;">No assets found (Check filters).</td></tr>`;
        return;
    }

    assets.sort((a, b) => a.task.localeCompare(b.task));

    assets.forEach(asset => {
        const tr = document.createElement('tr');
        
        let color = "#4a90e2"; 
        let icon = "✈";
        let taskDisplay = asset.task;
        
        if (asset.task === "Refueling") { 
            color = "#9b59b6"; 
            icon = "⛽"; 
            if (asset.fuel > 0) {
                const fuelK = (asset.fuel / 1000).toFixed(1);
                taskDisplay += ` <span style="color:#aaa; font-size:0.7rem;">(${fuelK}k lbs)</span>`;
            }
        }
        else if (asset.task === "AWACS") { color = "#f1c40f"; icon = "📡"; } 
        else if (asset.task === "CAS") { color = "#e67e22"; icon = "⚔"; } 
        else if (asset.task === "CAP") { color = "#2ecc71"; icon = "🛡"; }
        else if (asset.task === "SEAD") { color = "#e74c3c"; icon = "🎯"; }

        let cleanType = asset.type.replace("M PRS", "").replace(" MPRS", "");

        tr.innerHTML = `
            <td>
                <span style="color:${color}; font-weight:bold;">${asset.name}</span><br>
                <span style="font-size:0.7rem; color:#aaa;">${cleanType}</span>
            </td>
            <td style="vertical-align:middle; font-size:0.75rem;">
                ${icon} ${taskDisplay}
            </td>
            <td style="text-align:right; font-family:monospace;">
                <span style="color:#fff; font-weight:bold;">${asset.freq}</span> <span style="color:#666; font-size:0.7rem;">AM</span><br>
                <span style="color:#aaa;">${(asset.alt/1000).toFixed(1)}k' / ${asset.speed}kts</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- COMM SYNC LOGIC ---
function syncCommNames() {
    const activeEl = document.activeElement;

    // Helper to check and update a specific row
    const checkRow = (row) => {
        const nameInput = row.querySelector('.comm-name');
        const freqInput = row.querySelector('.comm-freq');
        
        if (nameInput && freqInput) {
            // SAFETY: Do not update if user is currently typing in the NAME box
            if (activeEl === nameInput) return;

            const currentFreq = freqInput.value.trim();
            
            // Check if we have a live match for this freq
            if (liveRadioMap[currentFreq]) {
                const newName = liveRadioMap[currentFreq];
                
                // Only update if different (prevents cursor jumping issues in some browsers)
                if (nameInput.value !== newName) {
                    nameInput.value = newName;
                }
            }
        }
    };

    // Scan Comm 1
    const c1Rows = document.getElementById('comm1-container').children;
    for (let row of c1Rows) checkRow(row);

    // Scan Comm 2
    const c2Rows = document.getElementById('comm2-container').children;
    for (let row of c2Rows) checkRow(row);
    
    // Save the updates so they persist
    // We don't call saveData() here to avoid write-loops during high frequency updates, 
    // but the inputs will be saved next time saveData is triggered by an event.
}

// ==========================================
// UPDATE CHECKER LOGIC
// ==========================================

async function checkForAppUpdate() {
    if (!window.electronAPI) return;

    const statusEl = document.getElementById('update-status');
    const btn = event.target;
    
    statusEl.innerText = "Checking Google Drive...";
    statusEl.style.color = "#ccc";
    btn.disabled = true;

    try {
        const result = await window.electronAPI.checkUpdate();

        if (result.error) {
            statusEl.innerText = result.error;
            statusEl.style.color = "#e74c3c";
        } 
        else if (result.updateAvailable) {
            statusEl.innerHTML = `
                <span style="color:#2ecc71; font-weight:bold;">v${result.remoteVersion} Available!</span><br>
                <a href="#" onclick="window.electronAPI.openUrl('${result.downloadUrl}')" style="color:#4a90e2;">Click here to Download</a>
            `;
        } 
        else {
            statusEl.innerText = "You are up to date.";
            statusEl.style.color = "#2ecc71";
        }
    } catch (e) {
        statusEl.innerText = "Check Failed.";
    }

    btn.disabled = false;
}

async function runAppUninstall() {
    if (!window.electronAPI) return;

    const confirmMsg = "Are you sure you want to completely uninstall this cool program?\n\n" +
                       "This action will:\n" +
                       "1. DELETE the integration scripts from your DCS folders.\n" +
                       "2. CLEAN your Export.lua file.\n" +
                       "3. REMOVE this application from Windows.\n\n" +
                       "The application will close immediately after.";

    showConfirm(confirmMsg, async () => {
        
        // --- STEP 1: CLEAN DCS SCRIPTS ---
        // Only works if we know where DCS is. 
        // If the user never set the path, we can't clean it (but files likely aren't there anyway).
        if (selectedDCSPath) {
            // Optional: Visual feedback if it takes a split second
            const statusEl = document.getElementById('uninstall-status');
            if(statusEl) statusEl.innerText = "Cleaning DCS Scripts...";
            
            try {
                // Call the existing backend handler
                await window.electronAPI.uninstallScripts(selectedDCSPath);
                console.log("Scripts cleaned successfully.");
            } catch (e) {
                console.error("Script cleanup warning:", e);
                // We continue to uninstall the app even if script cleaning fails
            }
        }

        // --- STEP 2: SELF DESTRUCT ---
        const result = await window.electronAPI.uninstallApp();
        
        if (!result.success) {
            alert("Error launching uninstaller: " + result.message);
            if(statusEl) statusEl.innerText = "Uninstall Failed.";
        }
        // If success, the app quits immediately via main.js
    });
}

// ==========================================
// BRIEFING EXTRACTOR
// ==========================================

async function loadBriefingFromFile() {
    const container = document.getElementById('briefing-container');
    container.innerHTML = "Locating mission file...";
    container.style.color = "#ccc";

    let missionPath = null;
    let method = "API";

    // --- ATTEMPT 1: DIRECT API (Best for SP) ---
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s fast timeout

        const response = await fetch('/api/mission-path', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const json = await response.json();
            if (json.path && json.path !== "") {
                missionPath = json.path;
            }
        }
    } catch (err) {
        console.warn("API Path fetch failed, trying fallback...", err);
    }

    // --- ATTEMPT 2: FILE SYSTEM FALLBACK (Best for MP) ---
    if (!missionPath) {
        const dcsInstallPath = localStorage.getItem('dcsInstallPath');
        
        if (dcsInstallPath && window.electronAPI) {
            container.innerHTML = "Scanning Tracks...";
            // Ask Electron to find the newest .trk file
            const trackPath = await window.electronAPI.findLatestTrack(dcsInstallPath);
            
            if (trackPath) {
                missionPath = trackPath;
                method = "TRACK SCAN";
            }
        }
    }

    // --- RESULT CHECK ---
    if (!missionPath) {
        container.innerHTML = `<span style="color:#e74c3c">
            Could not locate active mission file.<br>
            1. Ensure DCS is unpaused.<br>
            2. If in Multiplayer, ensure you have been spawned for at least 10 seconds.<br>
            3. Check Settings -> DCS Folder path.
            </span>`;
        return;
    }

    // --- PROCESS FILE ---
    container.innerHTML = `<span style='color:#888'>Reading (${method}): ${missionPath.split(/[\\/]/).pop()}...</span>`;

    try {
        if (!window.electronAPI) throw new Error("Desktop App required.");
        
        const fileBuffer = await window.electronAPI.readFile(missionPath);

        const zip = new JSZip();
        const contents = await zip.loadAsync(fileBuffer);
        
        // ... (Keep existing Dictionary/Mission Parsing logic exactly as before) ...
        // 1. Find Dictionary
        let dictFile = contents.file("l10n/DEFAULT/dictionary") || contents.file("dictionary");
        if (!dictFile) {
            const allFiles = Object.keys(contents.files);
            const foundPath = allFiles.find(p => p.toLowerCase().includes('dictionary'));
            if (foundPath) dictFile = contents.file(foundPath);
        }

        let dictionary = {};
        if (dictFile) {
            const dictText = await dictFile.async("string");
            const regex = /\["(.+?)"\]\s*=\s*"(.*?)"(?=,|$)/gs;
            let m;
            while ((m = regex.exec(dictText)) !== null) {
                let val = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '');
                dictionary[m[1]] = val;
            }
        }

        // 2. Find Mission Data
        let missionFile = contents.file("mission");
        if (!missionFile) {
             const all = Object.keys(contents.files);
             const mPath = all.find(p => p.endsWith("mission"));
             if(mPath) missionFile = contents.file(mPath);
        }
        
        if (!missionFile) throw new Error("Mission data file not found inside archive.");
        
        const missionText = await missionFile.async("string");
        let briefingText = "";
        
        const blueKeyMatch = missionText.match(/\["descriptionBlueTask"\]\s*=\s*"(DictKey_descriptionBlueTask_\d+)"/);
        
        if (blueKeyMatch && blueKeyMatch[1]) {
            const key = blueKeyMatch[1];
            briefingText = dictionary[key] || `[Key ${key} missing]`;
        } else {
            const directMatch = missionText.match(/descriptionBlueTask["\s]*=\s*"(.*?)"/s);
            if (directMatch) briefingText = directMatch[1];
            else briefingText = "No Blue Task description found.";
        }

        // 3. Display
        briefingText = briefingText.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        const freqRegex = /\b\d{3}\.\d{1,3}\b/g;
        const htmlText = briefingText.replace(freqRegex, `<span style="color:#e67e22; font-weight:bold;">$&</span>`);

        container.innerHTML = htmlText;
	extractIntelToNotes(briefingText);
        if (typeof resizeActiveAccordions === 'function') resizeActiveAccordions();

    } catch (e) {
        console.error(e);
        container.innerHTML = `<span style="color:#e74c3c">Error: ${e.message}</span>`;
    }
}

// ==========================================
// HARD TARGET LIST GENERATOR (FIXED)
// ==========================================

function updateHardTargets() {
    const tbody = document.getElementById('hard-targets-body');
    if (!tbody) return;

    let targetsFound = [];
    
    // 1. Determine Scan Center (Waypoints OR Ownship)
    let scanMode = 'ROUTE';
    let pathSegments = []; // Array of [p1, p2]
    
    if (waypoints.length > 1) {
        // Build segments from the route (e.g. WP0->WP1, WP1->WP2)
        for (let i = 0; i < waypoints.length - 1; i++) {
            pathSegments.push({
                p1: waypoints[i].marker.getLatLng(),
                p2: waypoints[i+1].marker.getLatLng()
            });
        }
    } else if (ownshipMarker) {
        scanMode = 'OWNSHIP';
    } else {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#666;">Waiting for route/pos...</td></tr>`;
        return;
    }

    // 2. Scan Live Markers
    for (const [id, unitMarker] of Object.entries(liveMarkers)) {
        const u = unitMarker.unitData;
        if (!u) continue;

        // --- FILTERS ---
        const isEnemy = (u.co === 1); 
        // Accept Category 2 (Helo), 3 (Ground), 4 (Ship)
        const isGroundOrSea = (u.c === 2 || u.c === 3 || u.c === 4);
        
        // Exclude Infantry/Paratroopers
        const name = u.n.toUpperCase();
        const isRelevant = !name.includes("SOLDIER") && !name.includes("PARATROOPER") && !name.includes("MANPAD");

        if (isEnemy && isGroundOrSea && isRelevant) {
            
            let isNear = false;
            const unitPos = L.latLng(u.la, u.lo);

            if (scanMode === 'ROUTE') {
                // Check distance to ANY flight leg
                for (let seg of pathSegments) {
                    const distMeters = getDistToSegmentMeters(unitPos, seg.p1, seg.p2);
                    const distNM = distMeters * 0.000539957;
                    
                    if (distNM < 50) {
                        isNear = true;
                        break; // Found it, stop checking other legs
                    }
                }
            } else {
                // Ownship fallback (100nm radius)
                const ownPos = ownshipMarker.getLatLng();
                const distNM = ownPos.distanceTo(unitPos) * 0.000539957;
                if (distNM < 100) isNear = true;
            }

            if (isNear) {
                // Calculate Range/Bearing from Ownship for display context
                let closestDist = 0;
                let bearingTo = 0;
                
                if(ownshipMarker) {
                    const ownPos = ownshipMarker.getLatLng();
                    closestDist = ownPos.distanceTo(unitPos) * 0.000539957;
                    bearingTo = GeoMath.getBearing(ownPos.lat, ownPos.lng, u.la, u.lo);
                }

                targetsFound.push({
                    name: u.n,
                    lat: u.la,
                    lon: u.lo,
                    elev: u.a,
                    dist: closestDist,
                    brg: bearingTo
                });
            }
        }
    }

    // 3. Render Table
    tbody.innerHTML = '';
    
    if (targetsFound.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#2ecc71;">No targets within 50nm of route.</td></tr>`;
        return;
    }

    // Sort by distance from Ownship
    targetsFound.sort((a, b) => a.dist - b.dist);

    targetsFound.slice(0, 30).forEach(tgt => {
        const tr = document.createElement('tr');
        
        // Coords based on settings
        let coordStr = "";
        if (typeof CoordConverter !== 'undefined') {
            if (coordFormat === 'MGRS_10') coordStr = CoordConverter.toMGRS(tgt.lat, tgt.lon, '10');
            else if (coordFormat === 'MGRS_6') coordStr = CoordConverter.toMGRS(tgt.lat, tgt.lon, '6');
            else if (coordFormat === 'UTM') coordStr = CoordConverter.toUTM(tgt.lat, tgt.lon);
            else if (coordFormat === 'DD') coordStr = CoordConverter.toDD(tgt.lat, tgt.lon);
            else if (coordFormat === 'DMS') coordStr = CoordConverter.toDMS(tgt.lat, tgt.lon);
            else coordStr = CoordConverter.toDDM(tgt.lat, tgt.lon).replace(/([NSEW])\s+/g, '$1');
        }

        // Secondary MGRS
        const mgrs = CoordConverter.toMGRS(tgt.lat, tgt.lon, '10');

        // Style: Bright Red for SAMs
        let nameColor = "#e74c3c"; 
        const nUpper = tgt.name.toUpperCase();
        if (nUpper.includes("SAM") || nUpper.includes("SA-") || nUpper.includes("RADAR") || nUpper.includes("BUK") || nUpper.includes("TOR")) {
            nameColor = "#ff5555"; 
        }

        tr.innerHTML = `
            <td style="color:${nameColor}; font-weight:bold; font-size:0.8rem; vertical-align:middle;">${tgt.name}</td>
            <td>
                <div style="font-size:0.8rem;">${coordStr}</div>
                <div style="font-size:0.7rem; color:#aaa;">${mgrs}</div>
                <div style="font-size:0.7rem; color:#888;">Elev: ${tgt.elev} ft</div>
            </td>
            <td style="text-align:right; font-family:monospace; vertical-align:middle;">
                <span style="color:var(--accent-color);">${Math.round(tgt.dist)}</span> nm<br>
                ${Math.round(tgt.brg)}°
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Debug log
    // console.log(`Hard Targets: ${targetsFound.length} found`);
}

// ==========================================
// KNEEBOARD PRINT / PDF GENERATION 
// ==========================================

function printMDC(e) {
    if(e) e.stopPropagation();

    // 1. Ensure latest data is rendered
    renderKneeboard();

    const element = document.getElementById('kneeboard-container');
    if(!element) return;

    // 2. Clone the element to manipulate it for printing without affecting the UI
    const clone = element.cloneNode(true);
    
    // 3. TRANSFER VALUES: Inputs don't clone their current values automatically
    const originalInputs = element.querySelectorAll('input, textarea, select');
    const cloneInputs = clone.querySelectorAll('input, textarea, select');

    for (let i = 0; i < originalInputs.length; i++) {
        if (originalInputs[i].tagName === 'TEXTAREA') {
            cloneInputs[i].innerHTML = originalInputs[i].value;
        } else if (originalInputs[i].tagName === 'SELECT') {
             // For selects, we just want the text of the selected option for the PDF
             const val = originalInputs[i].options[originalInputs[i].selectedIndex].text;
             const span = document.createElement('span');
             span.innerText = val;
             span.style.fontWeight = 'bold';
             cloneInputs[i].parentNode.replaceChild(span, cloneInputs[i]);
        } else {
            // For inputs, replace with a span containing the value to look like plain text
            // (Or keep as input with value attribute set, but text looks cleaner)
            const val = originalInputs[i].value;
            cloneInputs[i].setAttribute('value', val);
        }
    }

    // 4. Open Print Window
    const win = window.open('', 'MDC_PRINT', 'height=1123,width=794'); // A4 aspect ratio
    
    win.document.write('<html><head><title>MDC PRINT</title>');
    
    // LINK YOUR EXISTING STYLES
    win.document.write('<link rel="stylesheet" href="css/styles.css">');
    
    // ADD PRINT-SPECIFIC OVERRIDES (To force Dark Mode on Paper)
    win.document.write(`
        <style>
            @page {
                size: A4 portrait;
                margin: 0; /* Full bleed */
            }
            
            body { 
                background-color: #000000 !important; 
                margin: 0;
                padding: 20px;
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
                height: 100vh;
            }

            /* Center the card visually on the paper */
            #kneeboard-container {
                width: 100%;
                max-width: 210mm; /* A4 Width */
                margin: 0 auto;
                border: none; /* Remove outer border if desired */
                background-color: #0f1012 !important; /* Force panel color */
            }

            /* Hide UI buttons that might have been cloned */
            button, .header-actions, .btn-reset-section { 
                display: none !important; 
            }

            /* Ensure text contrasts remain sharp */
            * {
                text-shadow: none !important;
            }
            
            /* Clean up Input borders for the print view */
            input {
                border: none !important;
                background: transparent !important;
                color: #fff !important;
            }
            
            /* Specific fix for the Threat Box background */
            .kb-threat-box {
                background-color: rgba(231, 76, 60, 0.1) !important;
                -webkit-print-color-adjust: exact;
            }
        </style>
    `);
    
    win.document.write('</head><body>');
    win.document.write(clone.outerHTML);
    win.document.write('</body></html>');
    
    win.document.close();
    win.focus();

    // Wait for CSS to load before triggering print
    setTimeout(() => {
        win.print();
        // Optional: win.close(); 
    }, 500);
}

// ==========================================
// COMMS CARD PRINT GENERATION (Centered & Spaced)
// ==========================================

function printComms(e) {
    if(e) e.stopPropagation();

    const element = document.getElementById('comms-print-wrapper');
    if(!element) return;

    const clone = element.cloneNode(true);
    
    const originalInputs = element.querySelectorAll('input, textarea');
    const cloneInputs = clone.querySelectorAll('input, textarea');

    for (let i = 0; i < originalInputs.length; i++) {
        if (originalInputs[i].tagName === 'TEXTAREA') {
            cloneInputs[i].innerHTML = originalInputs[i].value;
            cloneInputs[i].innerText = originalInputs[i].value;
        } else {
            cloneInputs[i].setAttribute('value', originalInputs[i].value);
        }
    }

    const win = window.open('', 'COMMS_PRINT', 'height=1123,width=794');
    
    win.document.write('<html><head><title>COMMS DATA CARD</title>');
    win.document.write('<link rel="stylesheet" href="css/styles.css">');
    
    win.document.write(`
        <style>
            @page { size: A4 portrait; margin: 5mm; }
            
            body { 
                background-color: #000000 !important; 
                margin: 0; padding: 20px;
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
                height: 100vh;
                font-family: 'Roboto', sans-serif;
            }

            .print-wrapper { width: 100%; max-width: 210mm; margin: 0 auto; }

            /* --- LAYOUT MAGNIFICENCE --- */
            
            /* 1. The Container distributes space evenly */
            .comm-grid-container { 
                display: flex !important; 
                justify-content: space-evenly !important; /* | space | Col1 | space | Col2 | space | */
                width: 100% !important;
            }

            /* 2. The Columns shrink to fit content */
            .comm-col { 
                flex: 0 0 auto !important; /* Do not stretch */
                display: flex !important;
                flex-direction: column !important;
                align-items: center !important; /* Center the Header text */
            }
            
            /* 3. The Grid stays tight */
            .presets-list {
                display: grid !important;
                grid-template-columns: 1fr !important;
                gap: 2px !important;
                width: fit-content !important;
            }

            /* 4. The Row shrinks tight */
            .comm-entry {
                width: fit-content !important;
                white-space: nowrap !important;
                border: 1px solid #333 !important;
                /* Ensure internal content is centered if needed */
                justify-content: center !important; 
            }

            /* Inputs */
            input, textarea {
                background: #111 !important;
                color: #fff !important;
                border: 1px solid #333 !important;
                font-family: 'Courier New', monospace;
            }

            /* Exact Widths */
            .comm-name {
                width: 160px !important;
                flex-grow: 0 !important;
            }
            
            .comm-freq {
                width: 60px !important;
            }
            
            h3 { 
                color: #aaa !important; 
                border-bottom: 1px solid #444 !important; 
                width: 100%; 
                text-align: center;
            }
            
            .page-header {
                text-align: center; color: #4a90e2; 
                border-bottom: 2px solid #333; margin-bottom: 20px;
            }
            
            ::placeholder { color: transparent; }
        </style>
    `);
    
    win.document.write('</head><body>');
    win.document.write('<div class="print-wrapper">');
    win.document.write('<h1 class="page-header">COMMUNICATION PRESETS</h1>');
    win.document.write(clone.outerHTML);
    win.document.write('</div>');
    win.document.write('</body></html>');
    
    win.document.close();
    win.focus();

    setTimeout(() => { win.print(); }, 500);
}

// ==========================================
// AUTOMATED KNEEBOARD EXPORT (MULTI-PAGE)
// ==========================================

let kneeboardPath = null;

async function selectKneeboardFolder() {
    if (!window.electronAPI) return alert("Desktop App Required");
    const path = await window.electronAPI.selectFolder();
    if (path) {
        kneeboardPath = path;
        document.getElementById('kneeboard-path-display').value = path;
        localStorage.setItem('kneeboardPath', path);
    }
}

async function pushToKneeboard(type) {
    if (!window.electronAPI) return alert("Desktop App Required");
    if (!kneeboardPath) return alert("Please select a Kneeboard output folder in Settings first.");

    const btn = event.target;
    const oldText = btn.innerText;
    btn.innerText = "Generating...";
    btn.disabled = true;

    const staging = document.getElementById('export-staging');
    staging.innerHTML = ''; 

    // --- PAGE BUILDER HELPER ---
    const createPage = (pageNum, title) => {
        const page = document.createElement('div');
        page.className = 'export-page';
        
        const header = document.createElement('div');
        header.className = 'page-header';
        header.innerText = pageNum > 1 ? `${title} (Cont.)` : title;
        header.style.marginBottom = "10px";
        page.appendChild(header);
        
        staging.appendChild(page);
        return page;
    };

    let pagesToSave = [];

    // =======================================================
    // SCENARIO A: COMMUNICATIONS
    // =======================================================
    if (type === 'comms') {
        const sourceEl = document.getElementById('comms-print-wrapper');
        
        if (!sourceEl) {
            alert("Error: Could not find Comms Element. Please expand the Comms section first.");
            btn.innerText = "Error";
            btn.disabled = false;
            return;
        }

        const page = createPage(1, "COMMUNICATION PRESETS");
        
        // Clone
        const clone = sourceEl.cloneNode(true);
        
        // Transfer Input Values Explicitly
        const origInputs = sourceEl.querySelectorAll('input, textarea');
        const cloneInputs = clone.querySelectorAll('input, textarea');
        
        for (let i = 0; i < origInputs.length; i++) {
            if (origInputs[i].tagName === 'TEXTAREA') {
                cloneInputs[i].innerHTML = origInputs[i].value;
                cloneInputs[i].innerText = origInputs[i].value;
            } else {
                cloneInputs[i].setAttribute('value', origInputs[i].value);
                cloneInputs[i].value = origInputs[i].value;
            }
        }
        
        page.appendChild(clone);
        pagesToSave.push({ el: page, name: "VFA_Planner_Comms.png" });
    }
    
    // =======================================================
    // SCENARIO B: MDC (Fixed Pagination)
    // =======================================================
    else if (type === 'mdc') {
        renderKneeboard();
        const container = document.getElementById('kneeboard-container');
        
        if (!container) {
            alert("Error: Kneeboard container not found.");
            btn.innerText = "Error";
            btn.disabled = false;
            return;
        }

        // 1. Create Page 1
        let pageCount = 1;
        let currentPage = createPage(pageCount, "MISSION DATA CARD");
        
        let contentContainer = document.createElement('div');
        contentContainer.style.width = "100%"; 
        currentPage.appendChild(contentContainer);

        const sections = Array.from(container.querySelectorAll('.kb-section'));
        
        const appendClone = (original, target) => {
            const clone = original.cloneNode(true);
            const oInp = original.querySelectorAll('input, textarea');
            const cInp = clone.querySelectorAll('input, textarea');
            for(let i=0; i<oInp.length; i++) {
                if(oInp[i].tagName === 'TEXTAREA') cInp[i].innerHTML = oInp[i].value;
                else cInp[i].setAttribute('value', oInp[i].value);
            }
            target.appendChild(clone);
            return clone;
        };

        // Add Static Sections (Dep, Stores, Nav)
        if(sections[0]) appendClone(sections[0], contentContainer);
        if(sections[1]) appendClone(sections[1], contentContainer);
        if(sections[2]) appendClone(sections[2], contentContainer);

        // 2. Handle Threats (Dynamic)
        const threatSection = sections[3];
        if (threatSection) {
            let currentThreatSection = document.createElement('div');
            currentThreatSection.className = 'kb-section';
            
            const origHeader = threatSection.querySelector('.kb-header');
            if(origHeader) currentThreatSection.appendChild(origHeader.cloneNode(true));
            
            let threatBox = document.createElement('div');
            threatBox.className = 'kb-threat-box';
            currentThreatSection.appendChild(threatBox);
            contentContainer.appendChild(currentThreatSection);

            const origThreatBox = threatSection.querySelector('#kb-threats');
            const threatNodes = Array.from(origThreatBox.children);

            const MAX_HEIGHT = 1050; // Safety limit for A4

            for (let node of threatNodes) {
                // Use scrollHeight of the staging container
                const currentH = contentContainer.scrollHeight;
                
                if (currentH + 30 > MAX_HEIGHT) {
                    // NEW PAGE
                    pageCount++;
                    currentPage = createPage(pageCount, "THREAT ANALYSIS");
                    
                    contentContainer = document.createElement('div');
                    contentContainer.style.width = "100%";
                    currentPage.appendChild(contentContainer);
                    
                    currentThreatSection = document.createElement('div');
                    currentThreatSection.className = 'kb-section';
                    threatBox = document.createElement('div');
                    threatBox.className = 'kb-threat-box';
                    currentThreatSection.appendChild(threatBox);
                    contentContainer.appendChild(currentThreatSection);
                }
                threatBox.appendChild(node.cloneNode(true));
            }
            
            // 3. Handle Notes
            const notes = threatSection.querySelector('textarea');
            if(notes) {
                 if (contentContainer.scrollHeight + 100 > MAX_HEIGHT) {
                    pageCount++;
                    currentPage = createPage(pageCount, "NOTES");
                    contentContainer = document.createElement('div');
                    contentContainer.style.width = "100%";
                    currentPage.appendChild(contentContainer);
                 }
                 const notesClone = notes.cloneNode(true);
                 notesClone.innerHTML = notes.value;
                 const noteSec = document.createElement('div');
                 noteSec.className = 'kb-section';
                 noteSec.appendChild(notesClone);
                 contentContainer.appendChild(noteSec);
            }
        }

        const pages = staging.querySelectorAll('.export-page');
        pages.forEach((p, idx) => {
            const num = String(idx + 1).padStart(2, '0');
            pagesToSave.push({ el: p, name: `VFA_Planner_MDC_${num}.png` });
        });
    }

    // =======================================================
    // EXECUTE SAVING
    // =======================================================
    try {
        if (pagesToSave.length === 0) {
            throw new Error("No content generated to save.");
        }

        btn.innerText = "Saving...";
        
        for (let page of pagesToSave) {
            // Updated html2canvas settings for reliability
            const canvas = await html2canvas(page.el, {
                backgroundColor: "#000000",
                scale: 2, 
                width: 794,
                logging: false, // Turn off excessive logs
                useCORS: true   // Helps if external images are involved
            });

            const imgData = canvas.toDataURL("image/png");
            
            await window.electronAPI.saveImage({
                folder: kneeboardPath,
                filename: page.name,
                imageData: imgData
            });
        }

        btn.innerText = "Saved!";
        btn.style.borderColor = "#2ecc71";
        btn.style.color = "#2ecc71";

    } catch (err) {
        console.error("Export Error:", err);
        alert("Failed to generate image: " + err.message);
        btn.innerText = "Error";
    }

    staging.innerHTML = ''; 

    setTimeout(() => {
        btn.innerText = oldText;
        btn.disabled = false;
        btn.style.borderColor = "#e67e22";
        btn.style.color = "#e67e22";
    }, 2000);
}

// ==========================================
// WEATHER BRIEFING HANDLER (ADVANCED)
// ==========================================

socket.on('weatherBriefing', (data) => {
    if (!data || !data.mission || !data.mission.weather) return;

    // SAVE MISSION DATA
    latestMissionData = data.mission;

    // --- NEW: AUTO-LOAD BRIEFING TEXT ---
    // Check if the mission name has changed since we last loaded
    // (This runs on first connect OR when map changes)
    const currentName = data.mission.name || "Unknown";
    
    if (currentName !== lastLoadedMissionName) {
        console.log(`New Mission Detected: "${currentName}" - Auto-loading Briefing...`);
        lastLoadedMissionName = currentName;
        
        // Trigger the file extractor automatically
        // We use a small timeout to ensure the file system has caught up if it's a fresh track
        setTimeout(() => {
            loadBriefingFromFile(); 
        }, 1000);
    }
    // ------------------------------------

    // Show the box & Hide Placeholder
    document.getElementById('mission-briefing').style.display = 'block';
    
    // NEW: Hide the placeholder text if it exists
    const placeholder = document.getElementById('briefing-placeholder');
    if(placeholder) placeholder.style.display = 'none';

    const m = data.mission;
    const w = m.weather;

    // --- HELPERS ---
    const setVal = (id, txt) => {
        const el = document.getElementById(id);
        if(el) el.innerHTML = txt;
    };
    const toKnots = (mps) => Math.round(mps * 1.94384);
    const fixDir = (deg) => String(Math.round((deg + 180) % 360)).padStart(3, '0');
    const formatMetarTemp = (val) => (val < 0 ? "M" + Math.abs(val) : val);

    // --- 1. GENERAL INFO ---
    let theaterName = data.theatre || m.theatre || "Unknown";
    setVal('val-theater', theaterName);

    // Date
    if(m.date) {
        const day = String(m.date.Day).padStart(2, '0');
        const month = String(m.date.Month).padStart(2, '0');
        setVal('val-date', `${day}/${month}/${m.date.Year}`);
    }

    // Time
    const startSec = m.start_time || 0;
    const hours = Math.floor(startSec / 3600);
    const minutes = Math.floor((startSec % 3600) / 60);
    setVal('val-time', `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`);

    // Temp & QNH
    const tempC = Math.round(w.season.temperature);
    setVal('val-temp', `${tempC} °C`);

    const qnhInHgRaw = (w.qnh * 0.0393701).toFixed(2);
    const metarAlt = "A" + qnhInHgRaw.replace(".", ""); 
    setVal('val-qnh', `<b>${qnhInHgRaw}</b> (${metarAlt})`);

    // --- 2. ADVANCED VISIBILITY LOGIC ---
    let isFog = false;
    let isDust = false;
    let fogThicknessFt = 0;
    let dustCeilingFt = 0;
    let visMeters = w.visibility.distance; 

    // Check Dust
    if (w.enable_dust && w.dust_density > 0) {
        isDust = true;
        dustCeilingFt = Math.round(w.dust_density * 3.28084);
    }

    // Check Fog
    if (w.fog2 && w.fog2.manual && w.fog2.manual.length > 0) {
        const fogObj = w.fog2.manual[0];
        visMeters = Math.min(visMeters, fogObj.visibility); 
        fogThicknessFt = Math.round(fogObj.thickness * 3.28084);
        if (fogObj.thickness > 0) isFog = true;
    }

    // Display Vis
    const smRaw = visMeters * 0.000621371; 
    let smDisplay = "";
    let metarVis = "";

    if (smRaw > 10) {
        smDisplay = "+10 SM";
        metarVis = "10SM";
    } else if (smRaw < 0.5) {
        smDisplay = "< 1/2 SM";
        metarVis = "M1/4SM"; 
    } else {
        const smRounded = Math.round(smRaw * 2) / 2;
        smDisplay = `${smRounded} SM`;
        metarVis = `${Math.floor(smRounded)}SM`; 
    }
    setVal('val-vis', smDisplay);

    // --- 3. CLOUDS & WX CODES ---
    let wxCodes = [];
    const precType = w.clouds.iprecptns; 
    const presetName = w.clouds.preset ? w.clouds.preset.toUpperCase() : "";

    if (precType === 1 || presetName.includes("RAIN")) wxCodes.push("RA");
    else if (precType === 2 || presetName.includes("STORM")) wxCodes.push("TSRA");
    else if (precType === 3 || presetName.includes("SNOW")) wxCodes.push("SN");

    if (isDust) wxCodes.push("DU");
    if (visMeters < 1000) wxCodes.push("FG");
    else if (visMeters <= 5000) wxCodes.push("BR");

    const wxString = wxCodes.join(" ");

    // Cloud Base/Thick
    const baseFt = Math.round(w.clouds.base * 3.28084);
    const cloudThickFt = Math.round(w.clouds.thickness * 3.28084);

    setVal('val-cloud-base', `${baseFt.toLocaleString()} ft`);
    
    const lblThick = document.getElementById('lbl-cloud-thick');
    if (isFog && fogThicknessFt > 0) {
        lblThick.innerText = "Fog Thickness";
        setVal('val-cloud-thick', `${fogThicknessFt.toLocaleString()} ft`);
    } else if (isDust && dustCeilingFt > 0) {
        lblThick.innerText = "Dust Ceiling";
        setVal('val-cloud-thick', `${dustCeilingFt.toLocaleString()} ft`);
    } else {
        lblThick.innerText = "Cloud Thickness";
        setVal('val-cloud-thick', `${cloudThickFt.toLocaleString()} ft`);
    }

    // Density String
    let cloudStr = "SKC";
    if (w.clouds.density > 8) cloudStr="OVC";
    else if (w.clouds.density > 5) cloudStr="BKN";
    else if (w.clouds.density > 2) cloudStr="SCT";
    else if (w.clouds.density > 0) cloudStr="FEW";
    else if (w.clouds.preset) cloudStr = "BKN";
    
    if (cloudStr !== "SKC") {
        const flightLevel = Math.round(baseFt/100);
        cloudStr = `${cloudStr}${String(flightLevel).padStart(3,'0')}`; 
    }

    // --- 4. DEW POINT CALCULATION ---
    const isSaturated = wxCodes.some(code => ['RA','TSRA','SN','FG','BR'].includes(code));
    let dewPointC = tempC;
    
    if (isSaturated) {
        dewPointC = tempC;
    } else if (cloudStr !== "SKC") {
        const spread = baseFt / 410;
        dewPointC = Math.round(tempC - spread);
    } else {
        dewPointC = tempC - 4;
    }
    if(dewPointC > tempC) dewPointC = tempC;

    // --- 5. WINDS ---
    const gndSpd = toKnots(w.wind.atGround.speed);
    const gndDir = fixDir(w.wind.atGround.dir);
    setVal('wind-gnd-dir', `${gndDir}°`);
    setVal('wind-gnd-spd', `<b>${gndSpd}</b> kts`);

    const midSpd = toKnots(w.wind.at2000.speed);
    const midDir = fixDir(w.wind.at2000.dir);
    setVal('wind-2k-dir', `${midDir}°`);
    setVal('wind-2k-spd', `${midSpd} kts`);

    const highSpd = toKnots(w.wind.at8000.speed);
    const highDir = fixDir(w.wind.at8000.dir);
    setVal('wind-8k-dir', `${highDir}°`);
    setVal('wind-8k-spd', `${highSpd} kts`);

    // --- 6. PHYSICS UPDATES ---
    // Update global weather state for Ground Speed calculations
    weatherState.layers.ground = { spd: gndSpd, dir: parseInt(gndDir) };
    weatherState.layers[2000] = { spd: midSpd, dir: parseInt(midDir) };
    weatherState.layers[8000] = { spd: highSpd, dir: parseInt(highDir) };
    runFuelCalc();

    // --- 7. METAR STRING ---
    const metarMain = `METAR ${theaterName.toUpperCase().substring(0,4)} ${gndDir}/${String(gndSpd).padStart(2,'0')}KT ${metarVis} ${wxString} ${cloudStr} ${formatMetarTemp(tempC)}/${formatMetarTemp(dewPointC)} ${metarAlt}`;
    const rmkWinds = `ALOFT 060/${midDir}${midSpd}KT 260/${highDir}${highSpd}KT`;
    
    setVal('val-metar', `${metarMain} <br> <span style="color:#81c784">RMK ${rmkWinds}</span>`);

// NEW: Update Mission Assets Table
    if (data.mission) {
        updateMissionAssets(data.mission);
    }
   resizeActiveAccordions();
});


// ==========================================
// ELECTRON INSTALLER LOGIC
// ==========================================

let selectedDCSPath = null;

async function selectDCSFolder() {
    if (!window.electronAPI) {
        alert("This feature is only available in the Desktop Application.");
        return;
    }

    const path = await window.electronAPI.selectFolder();
    if (path) {
        selectedDCSPath = path;
        document.getElementById('dcs-path-display').value = path;
        document.getElementById('btn-install-scripts').disabled = false;
        localStorage.setItem('dcsInstallPath', path);
	saveData();
    }
}

async function runScriptInstall() {
    if (!selectedDCSPath) return;
    
    const statusEl = document.getElementById('install-status');
    statusEl.innerText = "Installing...";
    
    // Calls the main.js function we wrote in Step 3
    const result = await window.electronAPI.installScripts(selectedDCSPath);
    
    if (result.success) {
        statusEl.innerText = "Done! Restart DCS.";
        statusEl.style.color = "#2ecc71";
    } else {
        statusEl.innerText = "Error: " + result.message;
        statusEl.style.color = "#e74c3c";
    }
}

// Auto-load previous path if available
document.addEventListener('DOMContentLoaded', () => {
    // ... existing init ...
    const savedPath = localStorage.getItem('dcsInstallPath');
    if (savedPath) {
        selectedDCSPath = savedPath;
        const el = document.getElementById('dcs-path-display');
        if(el) {
            el.value = savedPath;
            document.getElementById('btn-install-scripts').disabled = false;
        }
    }
});

async function runScriptUninstall() {
    if (!selectedDCSPath) {
        alert("Please select your DCS Saved Games folder first (above).");
        return;
    }

    // Use your custom confirmation modal
    showConfirm("Are you sure you want to remove VFA-Planner scripts from DCS?", async () => {
        
        const statusEl = document.getElementById('uninstall-status');
        const btn = document.getElementById('btn-uninstall-scripts');
        
        statusEl.innerText = "Removing...";
        btn.disabled = true;

        if (window.electronAPI) {
            const result = await window.electronAPI.uninstallScripts(selectedDCSPath);
            
            if (result.success) {
                statusEl.innerText = "Success! Scripts removed.";
                statusEl.style.color = "#2ecc71";
                // Optional: Clear the path from memory to "Reset" the app state
                // localStorage.removeItem('dcsInstallPath');
            } else {
                statusEl.innerText = "Error: " + result.message;
                statusEl.style.color = "#e74c3c";
            }
        }
        
        btn.disabled = false;
    });
}


// ==========================================
// DATA EXPORT (THE WAY)
// ==========================================

function exportToTheWay() {
    // 1. Validation
    if (waypoints.length < 2) {
        alert("You need at least 2 waypoints (Start + 1 Dest) to export.");
        return;
    }

    const exportData = [];
    let exportIdCounter = 1;

    // 2. Iterate (Skip Index 0 because that is current position/takeoff)
    for (let i = 1; i < waypoints.length; i++) {
        const wp = waypoints[i];
        
        // Always get Raw Lat/Lng from marker (Decimal Degrees)
        // This ignores the MGRS/DMS display setting
        const latlng = wp.marker.getLatLng();

        // 3. Elevation Logic (Target vs Cruise)
        let elevationFt = parseFloat(wp.data.alt) || 0;
        
        if (wp.data.type === 'TGT') {
            // Use Target Elevation if specific, fallback to Altitude if 0/empty
            const tgt = parseFloat(wp.data.tgtElev);
            if (!isNaN(tgt) && tgt !== 0) {
                elevationFt = tgt;
            }
        }

        // 4. Convert Feet to Meters (Required for The Way)
        const elevationMeters = elevationFt * 0.3048;

        // 5. Build Object
        exportData.push({
            id: exportIdCounter++,
            name: wp.data.name,
            lat: latlng.lat,
            long: latlng.lng,
            elev: elevationMeters
        });
    }

    // 6. Create Download
    const dataStr = JSON.stringify(exportData, null, 2); // Pretty print
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Create temporary link to trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = "waypoints.tw"; // Standard filename for The Way
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

window.updateCoordFormat = function() {
    const sel = document.getElementById('coord-format-select');
    coordFormat = sel.value;
    saveData();
    // Note: Popups update on the NEXT data packet received (0.5s), 
    // or we could force a redraw, but waiting 0.5s is fine.
};

