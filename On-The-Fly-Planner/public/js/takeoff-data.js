/**
 * TAKEOFF PERFORMANCE CALCULATOR (F/A-18C)
 * Handles:
 * 1. CG Calculation
 * 2. V1/V2 Speeds
 * 3. Takeoff Distance (Ground Roll)
 */

const TakeoffCalculator = {
    // --- V-SPEED DATA ---
    cgRows: [16, 18, 20, 22, 24, 26],
    weightCols: [32000, 36000, 40000, 44000, 48000, 52000],

    v1Table: [
        [145, 154, 165, 176, 183, 193], // CG 16
        [139, 148, 159, 170, 177, 186], // CG 18
        [134, 142, 152, 162, 170, 180], // CG 20
        [128, 135, 145, 154, 163, 174], // CG 22
        [121, 129, 138, 147, 156, 167], // CG 24
        [114, 122, 131, 140, 149, 159]  // CG 26
    ],

    v2Table: [
        [159, 167, 175, 185, 192, 203],
        [154, 162, 170, 179, 186, 196],
        [149, 157, 164, 173, 180, 189],
        [144, 151, 158, 167, 173, 182],
        [140, 147, 153, 161, 167, 175],
        [136, 142, 148, 155, 160, 168]
    ],

    // --- DISTANCE DATA ---
    
    // Base Distance (Wind Calm)
    // Key: Weight, Value: Distance (ft)
    baseDistTable: {
        32000: 2800, 33000: 3067, 34000: 3333, 35000: 3600,
        36000: 3680, 37000: 3760, 38000: 3840, 39000: 3920,
        40000: 4000, 41000: 4250, 42000: 4500, 43000: 4750,
        44000: 5000, 45000: 5150, 46000: 5300, 47000: 5450,
        48000: 5600, 49000: 5900, 50000: 6200, 51000: 6500,
        52000: 6800, 53000: 7100, 54000: 7400
    },

    // Wind Correction Factors (Reduction Feet per 1 Knot of Headwind)
    // Derived from your chart (e.g., at 32k, 5kts = 100ft reduction -> 20ft per knot)
    windFactors: {
        32000: 20, 
        36000: 20, 
        40000: 25, 
        44000: 45, 
        48000: 60, 
        52000: 60
    },

    /**
     * Linear Interpolation Helper
     */
    lerp: function(x, x0, x1, y0, y1) {
        if (x1 === x0) return y0;
        return y0 + (x - x0) * (y1 - y0) / (x1 - x0);
    },

    /**
     * 2D Interpolation for V-Speeds
     */
    interpolateVSpeed: function(table, weight, cg) {
        if (weight < 32000) weight = 32000;
        if (weight > 52000) weight = 52000;
        if (cg < 16) cg = 16;
        if (cg > 26) cg = 26;

        let r = 0, c = 0;
        for (let i = 0; i < this.weightCols.length - 1; i++) {
            if (weight >= this.weightCols[i] && weight <= this.weightCols[i+1]) { c = i; break; }
        }
        for (let i = 0; i < this.cgRows.length - 1; i++) {
            if (cg >= this.cgRows[i] && cg <= this.cgRows[i+1]) { r = i; break; }
        }

        const q11 = table[r][c];
        const q21 = table[r][c+1];
        const q12 = table[r+1][c];
        const q22 = table[r+1][c+1];

        const x1 = this.weightCols[c], x2 = this.weightCols[c+1];
        const y1 = this.cgRows[r], y2 = this.cgRows[r+1];

        const r1 = ((x2 - weight) / (x2 - x1)) * q11 + ((weight - x1) / (x2 - x1)) * q21;
        const r2 = ((x2 - weight) / (x2 - x1)) * q12 + ((weight - x1) / (x2 - x1)) * q22;

        return Math.round(((y2 - cg) / (y2 - y1)) * r1 + ((cg - y1) / (y2 - y1)) * r2);
    },

    /**
     * CALCULATE TAKEOFF DISTANCE
     */
    calculateDistance: function(weight, headwind) {
        // 1. Get Base Distance (Interpolated from Weight)
        const weights = Object.keys(this.baseDistTable).map(Number).sort((a,b) => a - b);
        let wLow = weights[0], wHigh = weights[weights.length-1];

        // Bounds
        if (weight < wLow) weight = wLow;
        if (weight > wHigh) weight = wHigh;

        // Find bracket
        for(let i=0; i<weights.length-1; i++) {
            if(weight >= weights[i] && weight <= weights[i+1]) {
                wLow = weights[i];
                wHigh = weights[i+1];
                break;
            }
        }
        
        let baseDist = this.lerp(weight, wLow, wHigh, this.baseDistTable[wLow], this.baseDistTable[wHigh]);

        // 2. Calculate Wind Correction
        // Interpolate the "Factor" (ft per knot) based on weight
        const factorWeights = Object.keys(this.windFactors).map(Number).sort((a,b) => a - b);
        let fLow = factorWeights[0], fHigh = factorWeights[factorWeights.length-1];
        
        for(let i=0; i<factorWeights.length-1; i++) {
            if(weight >= factorWeights[i] && weight <= factorWeights[i+1]) {
                fLow = factorWeights[i];
                fHigh = factorWeights[i+1];
                break;
            }
        }

        const factor = this.lerp(weight, fLow, fHigh, this.windFactors[fLow], this.windFactors[fHigh]);
        
        // Calculate reduction
        const reduction = factor * headwind;

        // 3. Final Result
        let finalDist = baseDist - reduction;
        
        // Safety check (can't take off in 0 feet even with 100kt wind)
        if(finalDist < 500) finalDist = 500; 

        return Math.round(finalDist);
    }
};