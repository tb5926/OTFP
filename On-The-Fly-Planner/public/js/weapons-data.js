/**
 * WEAPONS DATA LIBRARY (F/A-18C)
 * Updated with MK-83 AIR (Centerline)
 */

const STATION_LOADOUTS = {
    // Station 1 & 9 (Wing Tips)
    tips: [
        "Empty", 
        "AIM-9L", "AIM-9M", "AIM-9X", "CATM-9",
        "ACMI Pod"
    ],

    // Station 2 & 8 (Outer Wing)
    outerWing: [
        "Empty",
        "6x BDU-33", 
        "BDU-45 (W)", "2x BDU-45 (W)", "BDU-45B (W)", "2x BDU-45B (W)",
        "MK 82 (W)", "2x MK 82 (W)", 
        "MK 82 SE (W)", "2x MK 82 SE (W)", 
        "MK 82 AIR (W)", "2x MK 82 AIR (W)",
        "GBU-12 (W)", "2x GBU-12 (W)",
        
        "MK 83 (W)", "2x MK 83 (W)", "MK 83 AIR (W)", "2x MK 83 AIR (W)",
        "GBU-16 (W)", "MK-84 (W)", "GBU-10 (W)", 
        "MK 20 (W)", "2x MK 20 (W)", "CBU-99 (W)", "2x CBU-99 (W)",
        "GBU-38 (W)", "2x GBU-38 (W)", 
        "GBU-31 (W)", "GBU-31 v2b (W)", "GBU-31 v3b (W)", "GBU-31 v4b (W)",
        "AGM-62 II (W)", 
        
        // ROCKETS
        "LAU-10 ZUNI (W)", "2x LAU-10 ZUNI (W)", 
        "LAU-68 HYDRA (W)", "2x LAU-68 HYDRA (W)", 
        "LAU-61 HYDRA (W)", "2x LAU-61 HYDRA (W)", 

        "AGM-65E (W)", "AGM-65F (W)", "AGM-88C (W)", 
        "AGM-154A (W)", "2x AGM-154A (W)", "AGM-154C (W)", "2x AGM-154C (W)",
        "AIM-9L (W)", "2x AIM-9L (W)", "AIM-9M (W)", "2x AIM-9M (W)", "AIM-9X (W)", "2x AIM-9X (W)",
        "CATM-9 (W)", "2x CATM-9 (W)",
        "AIM-7F (W)", "AIM-7M (W)", "AIM-7MH (W)", "AIM-7P (W)", 
        "AIM-120B (W)", "2x AIM-120B (W)", "AIM-120C (W)", "2x AIM-120C (W)",
        "AGM-84D (W)", "AGM-84H (W)", "AGM-84E (W)",
        "SUU-63 (W)", "GBU-32 (W)", "2x GBU-32(W)", "GBU-24 (W)", 
        "ADM-141A (W)", "2x ADM-141A (W)", "3x ADM-141A (W)",
        "AWW-13 DL"
    ],

    // Station 3 & 7 (Inner Wing)
    innerWing: [
        "Empty",
        "FPU-8/A", // Fuel Tank
        "6x BDU-33", 
        "BDU-45 (W)", "2x BDU-45 (W)", "BDU-45B (W)", "2x BDU-45B (W)",
        "MK 82 (W)", "2x MK 82 (W)", 
        "MK 82 SE (W)", "2x MK 82 SE (W)", 
        "MK 82 AIR (W)", "2x MK 82 AIR (W)",
        "GBU-12 (W)", "2x GBU-12 (W)",

        "MK 83 (W)", "2x MK 83 (W)", "MK 83 AIR (W)", "2x MK 83 AIR (W)",
        "GBU-16 (W)", "MK-84 (W)", "GBU-10 (W)",
        "MK 20 (W)", "2x MK 20 (W)", "CBU-99 (W)", "2x CBU-99 (W)",
        "GBU-38 (W)", "2x GBU-38 (W)",
        "GBU-31 (W)", "GBU-31 v2b (W)", "GBU-31 v3b (W)", "GBU-31 v4b (W)",
        "AGM-62 II (W)",
        
        // ROCKETS
        "LAU-10 ZUNI (W)", "2x LAU-10 ZUNI (W)",
        "LAU-68 HYDRA (W)", "2x LAU-68 HYDRA (W)",
        "LAU-61 HYDRA (W)", "2x LAU-61 HYDRA (W)",

        "AGM-65E (W)", "AGM-65F (W)", "AGM-88C (W)",
        "AGM-154A (W)", "2x AGM-154A (W)", "AGM-154C (W)", "2x AGM-154C (W)",
        "AIM-9L (W)", "2x AIM-9L (W)", "AIM-9M (W)", "2x AIM-9M (W)", "AIM-9X (W)", "2x AIM-9X (W)",
        "CATM-9 (W)", "2x CATM-9 (W)",
        "AIM-7F (W)", "AIM-7M (W)", "AIM-7MH (W)", "AIM-7P (W)",
        "AIM-120B (W)", "2x AIM-120B (W)", "AIM-120C (W)", "2x AIM-120C (W)",
        "AGM-84D (W)", "AGM-84H (W)", "AGM-84E (W)",
        "AN/AAQ-28", "AN/ASQ-228", "AWW-13 DL", 
        "GBU-32 (W)", "2x GBU-32(W)", "GBU-24 (W)", 
        "ADM-141A (W)", "2x ADM-141A (W)", "3x ADM-141A (W)"
    ],

    // Station 4 & 6 (Cheek/Fuselage)
    cheek: [
        "Empty",
        "AIM-7F (F)", "AIM-7M (F)", "AIM-7MH (F)", "AIM-7P (F)",
        "AIM-120B (F)", "AIM-120C (F)",
        "LAU-116 (F)", 
        "AN/AAQ-28", "AN/ASQ-228" 
    ],

    // Station 5 (Centerline)
    center: [
        "Empty",
        "FPU-8/A", 
        "AN/AAQ-28 (CL)", "AWW-13 DL (CL)", 
        "MK 82 (CL)", "2x MK 82 (CL)",
        "MK 82 SE (CL)", "2x MK 82 SE (CL)",
        "MK 82 AIR (CL)", "2x MK 82 AIR (CL)",
        
        "MK 83 (CL)", 
        "MK 83 AIR (CL)", // <--- ADDED
        
        "MK-84 (CL)",
        "MK 20 (CL)", "2x MK 20 (CL)",
        "CBU-99 (CL)", "2x CBU-99 (CL)",
        "BDU-45 (CL)", "2x BDU-45 (CL)", 
        "BDU-45B (CL)", "2x BDU-45B (CL)",
        "SUU-62 (CL)"
    ]
};

// FULL WEAPONS DATABASE
const DRAG_DB = {
    "Empty": { drag: 0, weight: 0 },

    // --- WING TIPS ---
    "AIM-9L": { drag: 2, weight: 196 },
    "AIM-9M": { drag: 2, weight: 196 },
    "AIM-9X": { drag: 2, weight: 196 },
    "CATM-9": { drag: 2, weight: 195 },
    "ACMI Pod": { drag: 2, weight: 190 },

    // --- FUSELAGE / CHEEK ---
    "AIM-7F (F)": { drag: 4, weight: 571 },
    "AIM-7M (F)": { drag: 4, weight: 571 },
    "AIM-7MH (F)": { drag: 4, weight: 571 },
    "AIM-7P (F)": { drag: 4, weight: 571 }, 
    "AIM-120B (F)": { drag: 4, weight: 413 },
    "AIM-120C (F)": { drag: 4, weight: 413 },
    "LAU-116 (F)": { drag: 0, weight: 65 },
    "AN/AAQ-28": { drag: 9, weight: 435 }, 
    "AN/ASQ-228": { drag: 7.5, weight: 406 }, 

    // --- CENTERLINE SPECIALS ---
    "AN/AAQ-28 (CL)": { drag: 12, weight: 574 }, 
    "AWW-13 DL (CL)": { drag: 5.9, weight: 922 }, 

    // --- WING (W) & CENTER (CL) ---
    "FPU-8/A": { drag: 14.5, weight: 2535, capacity: 2244 }, 
    "6x BDU-33": { drag: 27.6, weight: 736 },
    
    // ROCKETS
    "LAU-10 ZUNI (W)": { drag: 32.5, weight: 500 },
    "2x LAU-10 ZUNI (W)": { drag: 57.5, weight: 1225 }, 
    "LAU-68 HYDRA (W)": { drag: 19.5, weight: 210 },
    "2x LAU-68 HYDRA (W)": { drag: 31.5, weight: 645 }, 
    "LAU-61 HYDRA (W)": { drag: 39, weight: 550 },
    "2x LAU-61 HYDRA (W)": { drag: 70.5, weight: 1325 }, 

    // BDU
    "BDU-45 (W)": { drag: 10.5, weight: 899 },
    "2x BDU-45 (W)": { drag: 13.5, weight: 1488 },
    "BDU-45B (W)": { drag: 10.5, weight: 899 },
    "2x BDU-45B (W)": { drag: 13.5, weight: 1488 },
    "BDU-45 (CL)": { drag: 6, weight: 728 },
    "2x BDU-45 (CL)": { drag: 9, weight: 1488 }, 
    "BDU-45B (CL)": { drag: 6, weight: 728 },
    "2x BDU-45B (CL)": { drag: 9, weight: 1488 },

    // MK-82 Series
    "MK 82 (W)": { drag: 10.5, weight: 899 },
    "2x MK 82 (W)": { drag: 13.5, weight: 1488 },
    "MK 82 (CL)": { drag: 6, weight: 728 },
    "2x MK 82 (CL)": { drag: 9, weight: 1317 },

    "MK 82 SE (W)": { drag: 12.5, weight: 953 },
    "2x MK 82 SE (W)": { drag: 17.5, weight: 1596 },
    "MK 82 SE (CL)": { drag: 8, weight: 782 },
    "2x MK 82 SE (CL)": { drag: 13, weight: 1425 },

    "MK 82 AIR (W)": { drag: 12.5, weight: 953 },
    "2x MK 82 AIR (W)": { drag: 17.5, weight: 1596 },
    "MK 82 AIR (CL)": { drag: 8, weight: 782 },
    "2x MK 82 AIR (CL)": { drag: 13, weight: 1425 },

    // MK-83 Series
    "MK 83 (W)": { drag: 12.5, weight: 1372 },
    "2x MK 83 (W)": { drag: 17.5, weight: 2434 },
    "MK 83 (CL)": { drag: 8, weight: 1201 },
    "2x MK 83 (CL)": { drag: 13, weight: 2263 },

    // MK-83 AIR
    "MK 83 AIR (W)": { drag: 12.5, weight: 1372 }, 
    "2x MK 83 AIR (W)": { drag: 17.5, weight: 2434 },
    "MK 83 AIR (CL)": { drag: 8, weight: 1201 }, // <--- ADDED

    "MK-84 (W)": { drag: 14.5, weight: 2378 },
    "MK-84 (CL)": { drag: 10, weight: 2207 },

    // GBUs
    "GBU-10 (W)": { drag: 22.5, weight: 2539 },
    "GBU-10 (CL)": { drag: 18, weight: 2329 },
    
    "GBU-12 (W)": { drag: 5.5, weight: 606 },
    "2x GBU-12 (W)": { drag: 11, weight: 1682 },
    "GBU-12 (CL)": { drag: 5.5, weight: 996 },
    "2x GBU-12 (CL)": { drag: 11, weight: 1511 },

    "GBU-16 (W)": { drag: 17, weight: 1498 },
    "GBU-16 (CL)": { drag: 12.5, weight: 1327 },

    "GBU-24 (W)": { drag: 23.5, weight: 2782 },

    // JDAMs
    "GBU-31 (W)": { drag: 14.5, weight: 2417 },
    "GBU-31 v2b (W)": { drag: 14.5, weight: 2422 },
    "GBU-31 v3b (W)": { drag: 14.5, weight: 2417 },
    "GBU-31 v4b (W)": { drag: 14.5, weight: 2501 },
    "GBU-31 (CL)": { drag: 10, weight: 2246 },
    "GBU-31 v2b (CL)": { drag: 10, weight: 2251 },
    "GBU-31 v3b (CL)": { drag: 10, weight: 2246 },
    "GBU-31 v4b (CL)": { drag: 10, weight: 2330 },

    "GBU-32 (W)": { drag: 12.5, weight: 1399 },
    "2x GBU-32(W)": { drag: 17.5, weight: 2488 },

    "GBU-38 (W)": { drag: 10.5, weight: 976 },
    "2x GBU-38 (W)": { drag: 13.5, weight: 1642 },
    "GBU-38 (CL)": { drag: 6, weight: 805 },
    "2x GBU-38 (CL)": { drag: 9, weight: 1471 },

    // Clusters
    "MK 20 (W)": { drag: 15, weight: 892 },
    "2x MK 20 (W)": { drag: 22.5, weight: 1474 },
    "MK 20 (CL)": { drag: 10.5, weight: 721 },
    "2x MK 20 (CL)": { drag: 18, weight: 1303 },

    "CBU-99 (W)": { drag: 15, weight: 892 },
    "2x CBU-99 (W)": { drag: 22.5, weight: 1474 },
    "CBU-99 (CL)": { drag: 10.5, weight: 721 },
    "2x CBU-99 (CL)": { drag: 18, weight: 1303 },

    // Missiles (Wing)
    "AIM-9L (W)": { drag: 13.5, weight: 671 },
    "2x AIM-9L (W)": { drag: 19.5, weight: 956 },
    "AIM-9M (W)": { drag: 13.5, weight: 671 },
    "2x AIM-9M (W)": { drag: 19.5, weight: 956 },
    "AIM-9X (W)": { drag: 13.5, weight: 671 },
    "2x AIM-9X (W)": { drag: 19.5, weight: 956 },
    "CATM-9 (W)": { drag: 13.5, weight: 671 },
    "2x CATM-9 (W)": { drag: 19.5, weight: 956 },

    "AIM-7F (W)": { drag: 17.5, weight: 989 },
    "AIM-7M (W)": { drag: 17.5, weight: 989 },
    "AIM-7MH (W)": { drag: 17.5, weight: 989 },
    "AIM-7P (W)": { drag: 17.5, weight: 989 },

    "AIM-120B (W)": { drag: 16.5, weight: 830 },
    "2x AIM-120B (W)": { drag: 21.5, weight: 1274 },
    "AIM-120C (W)": { drag: 16.5, weight: 830 },
    "2x AIM-120C (W)": { drag: 21.5, weight: 1274 },

    // AGMs
    "AGM-65E (W)": { drag: 20.5, weight: 1163 },
    "AGM-65F (W)": { drag: 20.5, weight: 1190 },
    "AGM-88C (W)": { drag: 19.9, weight: 1286 },
    "AGM-84D (W)": { drag: 18, weight: 1742 },
    "AGM-84H (W)": { drag: 19.9, weight: 1973 },
    "AGM-84E (W)": { drag: 19.9, weight: 1846 },
    "AGM-62 II (W)": { drag: 23.5, weight: 2801 },
    "AGM-154A (W)": { drag: 15.7, weight: 1441 },
    "2x AGM-154A (W)": { drag: 23.9, weight: 2572 },
    "AGM-154C (W)": { drag: 15.7, weight: 1441 },
    "2x AGM-154C (W)": { drag: 23.9, weight: 2572 },

    // Misc
    "AWW-13 DL": { drag: 10.4, weight: 1093 },
    "SUU-63 (W)": { drag: 7.5, weight: 310 },
    "SUU-62 (CL)": { drag: 3, weight: 139 },
    "ADM-141A (W)": { drag: 20, weight: 509 },
    "2x ADM-141A (W)": { drag: 25, weight: 906 },
    "3x ADM-141A (W)": { drag: 29, weight: 1303 }
};