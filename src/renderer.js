"use strict";

require("./utils/mods/extenssrMenuItemsPlugin");

/** @type {import('./types').RendererApi['drParseNoCar']} */
import { drParseNoCar } from "./utils/mods/drParseNoCar";
/** @type {import('./types').RendererApi['blinkMode']} */
import { blinkMode } from "./utils/mods/blinkMode";
/** @type {import('./types').RendererApi['satelliteMode']} */
import { satelliteMode } from "./utils/mods/satelliteMode";

window.chatguessrApi.init({
    populateMap,
    clearMarkers,
    drParseNoCar,
    blinkMode,
    satelliteMode,
    showSatelliteMap,
    hideSatelliteMap,
    centerSatelliteView,
    getBounds,
    focusOnGuess,
});

/** @type {google.maps.Map | undefined} */
let globalMap = undefined;
/** @type {google.maps.Map | undefined} */
let satelliteLayer = undefined;
/** @type {google.maps.Marker | undefined} */
let satelliteMarker = undefined;
const satelliteCanvas = document.createElement("div");
satelliteCanvas.id = "satelliteCanvas";

const mapReady = hijackMap();

/** @type {google.maps.Marker[]} */
let markers = [];
/** @type {google.maps.Polyline[]} */
let polylines = [];

/** @type {import('./types').RendererApi['populateMap']} */
function populateMap(location, scores, limit) {
    const map = globalMap;
    const infowindow = new google.maps.InfoWindow();
    const icon = {
        path: `M13.04,41.77c-0.11-1.29-0.35-3.2-0.99-5.42c-0.91-3.17-4.74-9.54-5.49-10.79c-3.64-6.1-5.46-9.21-5.45-12.07
			c0.03-4.57,2.77-7.72,3.21-8.22c0.52-0.58,4.12-4.47,9.8-4.17c4.73,0.24,7.67,3.23,8.45,4.07c0.47,0.51,3.22,3.61,3.31,8.11
			c0.06,3.01-1.89,6.26-5.78,12.77c-0.18,0.3-4.15,6.95-5.1,10.26c-0.64,2.24-0.89,4.17-1,5.48C13.68,41.78,13.36,41.78,13.04,41.77z`,
        fillColor: "#de3e3e",
        fillOpacity: 0.7,
        scale: 1.2,
        strokeColor: "#000000",
        strokeWeight: 1,
        anchor: new google.maps.Point(14, 43),
        labelOrigin: new google.maps.Point(13.5, 15),
    };

    const locationMarker = new google.maps.Marker({
        position: location,
        icon,
        map,
    });
    locationMarker.addListener("click", () => {
        const url = new URL("https://www.google.com/maps/@?api=1&map_action=pano");
        if (location.panoId) {
            url.searchParams.set("pano", location.panoId);
        }
        url.searchParams.set("viewpoint", `${location.lat},${location.lng}`);
        url.searchParams.set("heading", String(location.heading));
        url.searchParams.set("pitch", String(location.pitch));
        const fov = 180 / 2 ** location.zoom;
        url.searchParams.set("fov", String(fov));
        window.open(url, "_blank");
    });
    markers.push(locationMarker);

    icon.scale = 1;
    scores.forEach((score, index) => {
        if (index >= limit) return;
        const color = index == 0 ? "#E3BB39" : index == 1 ? "#C9C9C9" : index == 2 ? "#A3682E" : score.color;
        icon.fillColor = color;

        const guessMarker = new google.maps.Marker({
            position: score.position,
            icon,
            map,
            label: {
                color: "#000",
                fontWeight: "bold",
                fontSize: "16px",
                text: `${index + 1}`,
            },
            optimized: true,
        });
        guessMarker.addListener("mouseover", () => {
            infowindow.setContent(`
				${score.flag ? `<span class="flag-icon" style="background-image: url(flag:${score.flag})"></span>` : ""}
                <span class="username" style="color:${color}">${score.username}</span><br>
                ${score.score}<br>
				${score.distance >= 1 ? score.distance.toFixed(1) + " km" : Math.floor(score.distance * 1000) + "m"}
			`);
            infowindow.open(globalMap, guessMarker);
        });
        guessMarker.addListener("mouseout", () => {
            infowindow.close();
        });
        markers.push(guessMarker);

        polylines.push(
            new google.maps.Polyline({
                strokeColor: color,
                strokeWeight: 4,
                strokeOpacity: 0.6,
                geodesic: true,
                map,
                path: [score.position, location],
            })
        );
    });
}

/** @type {import('./types').RendererApi['clearMarkers']} */
function clearMarkers() {
    for (const marker of markers) {
        marker.setMap(null);
    }
    for (const line of polylines) {
        line.setMap(null);
    }
    markers = [];
    polylines = [];
}

async function hijackMap() {
    const MAPS_API_URL = "https://maps.googleapis.com/maps/api/js?";
    const MAPS_SCRIPT_SELECTOR = `script[src^="${MAPS_API_URL}"]`;
    await new Promise((resolve) => {
        let bodyDone = false;
        let headDone = false;

        function checkBodyDone() {
            if (!bodyDone && document.body) {
                scriptObserver.observe(document.body, { childList: true });
                bodyDone = true;
            }
        }
        function checkHeadDone() {
            if (!headDone && document.head) {
                scriptObserver.observe(document.head, { childList: true });
                headDone = true;
            }
        }

        /**
         * Check if `element` is a Google Maps script tag and resolve the outer Promise if so.
         * @param {Element} element
         */
        function checkMapsScript(element) {
            if (element.matches(MAPS_SCRIPT_SELECTOR)) {
                const onload = () => {
                    pageObserver.disconnect();
                    scriptObserver.disconnect();
                    resolve(undefined);
                };
                // It may already be loaded :O
                if (typeof google !== "undefined" && google?.maps?.Map) {
                    onload();
                } else {
                    element.addEventListener("load", onload);
                }
            }
        }

        const scriptObserver = new MutationObserver((mutations, observer) => {
            for (const mutation of mutations) {
                for (const tmp of mutation.addedNodes) {
                    if (tmp.nodeType === Node.ELEMENT_NODE) {
                        checkMapsScript(/** @type {Element} */ (tmp));
                    }
                }
            }
        });
        const pageObserver = new MutationObserver((_, observer) => {
            checkBodyDone();
            checkHeadDone();
            if (headDone && bodyDone) {
                observer.disconnect();
            }
        });

        pageObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });

        // Do an initial check, we may be running in a fully loaded game already.
        checkBodyDone();
        checkHeadDone();
        /** @type {HTMLElement|undefined} */
        const existingTag = document.querySelector(MAPS_SCRIPT_SELECTOR);
        if (existingTag) checkMapsScript(existingTag);
    });

    await new Promise((resolve, reject) => {
        const google = window.google;
        const isGamePage = () => location.pathname.startsWith("/results/") || location.pathname.startsWith("/game/");
        /** @param {google.maps.Map} map */
        function onMapUpdate(map) {
            try {
                if (!isGamePage()) return;
                globalMap = map;
                resolve();
            } catch (error) {
                console.error("GeoguessrHijackMap Error:", error);
                reject(error);
            }
        }

        google.maps.Map = class extends google.maps.Map {
            /**
             * @param {HTMLElement} mapDiv
             * @param {google.maps.MapOptions} opts
             */
            constructor(mapDiv, opts) {
                super(mapDiv, opts);
                this.addListener("idle", () => {
                    if (globalMap == null) {
                        onMapUpdate(this);
                    }
                });
                this.addListener("maptypeid_changed", () => {
                    // Save the map type ID so we can prevent GeoGuessr from resetting it
                    localStorage.chatguessrMapTypeId = this.getMapTypeId();
                });
            }
            /**
             * @param {google.maps.MapOptions} opts
             */
            setOptions(opts) {
                // GeoGuessr's `setOptions` calls always include `backgroundColor`
                // so this is how we can distinguish between theirs and ours
                if (opts.backgroundColor) {
                    opts.mapTypeId = localStorage.chatguessrMapTypeId ?? opts.mapTypeId;
                    opts.mapTypeControl = true;
                    opts.mapTypeControlOptions = {
                        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
                        position: google.maps.ControlPosition.TOP_RIGHT,
                    };
                }
                super.setOptions(opts);
            }
        };
    });
}

/** @type {import('./types').RendererApi['showSatelliteMap']} */
async function showSatelliteMap(location) {
    await mapReady;

    const boundsLimit = parseInt(localStorage.getItem("satelliteModeBoundsLimit")) || 10;

    if (!document.body.contains(satelliteCanvas)) {
        document.querySelector(".game-layout__canvas").append(satelliteCanvas);
    }
    satelliteCanvas.style.display = "block";

    satelliteLayer ??= new google.maps.Map(satelliteCanvas, {
        fullscreenControl: false,
        mapTypeId: google.maps.MapTypeId.SATELLITE,
    });
    satelliteLayer.setOptions({
        restriction: {
            latLngBounds: getBounds(location, boundsLimit * 1000),
            strictBounds: true,
        },
    });
    satelliteLayer.setCenter(location);
    satelliteLayer.setZoom(20);
    satelliteMarker?.setMap(null);
    satelliteMarker = new google.maps.Marker({
        position: location,
        map: satelliteLayer,
    });
}

/** @type {import('./types').RendererApi['hideSatelliteMap']} */
async function hideSatelliteMap() {
    await mapReady;

    satelliteCanvas.style.display = "none";
}

/** @type {import('./types').RendererApi['centerSatelliteView']} */
function centerSatelliteView(location) {
    satelliteLayer.setCenter(location);
}

/** @type {import('./types').RendererApi['focusOnGuess']} */
function focusOnGuess(location) {
    globalMap.setCenter(location);
    globalMap.setZoom(8);
}

/** @type {import('./types').RendererApi['getBounds']} */
function getBounds(location, limit) {
    const meters = limit / 2;
    const earth = 6371.071;
    const pi = Math.PI;
    const cos = Math.cos;
    const m = 1 / (((2 * pi) / 360) * earth) / 1000;

    const north = location.lat + meters * m;
    const south = location.lat - meters * m;
    const west = location.lng - (meters * m) / cos(location.lat * (pi / 180));
    const east = location.lng + (meters * m) / cos(location.lat * (pi / 180));

    return { north, south, west, east };
}
