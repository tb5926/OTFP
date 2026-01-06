/* 
 * UTM CONVERTER FOR DCS PLANNER
 * Based on code by Po Shan Cheah & Dr. Steve Dutch
 */

var UTMConv = (function () {
	"use strict";

	var DatumInfo = {
	    wgs84 : { eqrad : 6378137.0, flat : 298.2572236 }
        // (Other datums removed for brevity as DCS uses WGS84)
	};

	function UTMCoords(utmz, easting, northing) {
	    this.utmz = utmz;
	    this.easting = easting;
	    this.northing = northing;
	}

	function DegCoords(latd, lngd, datum) {
	    this.latd = latd;
	    this.lngd = lngd;
	    this.datum = datum || "wgs84";
	}

	DegCoords.prototype.calc_utmz = function () {
	    return 1 + Math.floor((this.lngd + 180) / 6);
	};

	DegCoords.prototype.to_utm = function (utmz) {
	    var a = DatumInfo[this.datum].eqrad;
	    var f = 1 / DatumInfo[this.datum].flat;
	    var drad = Math.PI/180;
	    var k0 = 0.9996;
	    var b = a*(1-f);
	    var e = Math.sqrt(1 - (b/a)*(b/a));
	    var phi = this.latd*drad;

	    utmz = utmz || this.calc_utmz();

	    var zcm = 3 + 6*(utmz-1) - 180;
	    var esq = (1 - (b/a)*(b/a));
	    var e0sq = e*e/(1-e*e);

	    var N = a/Math.sqrt(1-Math.pow(e*Math.sin(phi),2));
	    var T = Math.pow(Math.tan(phi),2);
	    var C = e0sq*Math.pow(Math.cos(phi),2);
	    var A = (this.lngd-zcm)*drad*Math.cos(phi);

	    var M = phi*(1 - esq*(1/4 + esq*(3/64 + 5*esq/256)));
	    M = M - Math.sin(2*phi)*(esq*(3/8 + esq*(3/32 + 45*esq/1024)));
	    M = M + Math.sin(4*phi)*(esq*esq*(15/256 + esq*45/1024));
	    M = M - Math.sin(6*phi)*(esq*esq*esq*(35/3072));
	    M = M*a;

	    var M0 = 0;
	    var x = k0*N*A*(1 + A*A*((1-T+C)/6 + A*A*(5 - 18*T + T*T + 72*C -58*e0sq)/120));
	    x = x + 500000;
	    var y = k0*(M - M0 + N*Math.tan(phi)*(A*A*(1/2 + A*A*((5 - T + 9*C + 4*C*C)/24 + A*A*(61 - 58*T + T*T + 600*C - 330*e0sq)/720))));

        // Handle Southern Hemisphere
	    if (y < 0){ y = 10000000+y; }

	    return new UTMCoords(utmz, x, y);
	};

	return { UTMCoords : UTMCoords, DegCoords : DegCoords };
}());

// Helper function to call from App.js
function DegreesToUTM(lat, lng) {
    // Determine Hemisphere for label
    var hemi = (lat >= 0) ? "N" : "S";
    
    // Perform Calculation
    var deg = new UTMConv.DegCoords(lat, lng, "wgs84");
    var utm = deg.to_utm();
    
    // Return formatted object
    return {
        zone: utm.utmz,
        hemi: hemi,
        easting: Math.round(utm.easting),
        northing: Math.round(utm.northing)
    };
};