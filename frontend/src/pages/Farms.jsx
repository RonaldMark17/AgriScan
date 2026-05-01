import { Crosshair, Loader2, MapPinned, Plus } from 'lucide-react';
import * as L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client.js';
import EmptyState from '../components/shared/EmptyState.jsx';
import PageHeader from '../components/shared/PageHeader.jsx';
import { getApiErrorMessage } from '../utils/apiErrors.js';
import { reverseGeocodeLocation } from '../utils/openStreetMap.js';

const DEFAULT_CENTER = { lat: 12.8797, lng: 121.774 };
const EMPTY_FORM = {
  name: '',
  barangay: '',
  municipality: '',
  province: '',
  latitude: '',
  longitude: '',
  area_hectares: '',
};

function parseCoordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasCoordinates(item) {
  return parseCoordinate(item?.latitude) !== null && parseCoordinate(item?.longitude) !== null;
}

function formatFarmLocation(farm) {
  return [farm.barangay, farm.municipality, farm.province].filter(Boolean).join(', ') || 'Location details not set';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildCirclePath(latitude, longitude, radiusMeters, steps = 28) {
  const earthRadius = 6378137;
  const latRad = (latitude * Math.PI) / 180;
  const lngRad = (longitude * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadius;

  return Array.from({ length: steps }, (_, index) => {
    const bearing = (2 * Math.PI * index) / steps;
    const latPoint = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const lngPoint =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
        Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(latPoint)
      );

    return {
      lat: (latPoint * 180) / Math.PI,
      lng: (lngPoint * 180) / Math.PI,
    };
  });
}

function createApproxBoundaryGeoJson(latitude, longitude, areaHectares) {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  const area = parsePositiveNumber(areaHectares);

  if (lat === null || lng === null || area === null) return null;

  const radiusMeters = Math.sqrt((area * 10000) / Math.PI);
  const path = buildCirclePath(lat, lng, radiusMeters);
  const coordinates = path.map((point) => [Number(point.lng.toFixed(6)), Number(point.lat.toFixed(6))]);
  coordinates.push(coordinates[0]);

  return {
    type: 'Polygon',
    coordinates: [coordinates],
  };
}

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeNumber(value, precision) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(precision)) : null;
}

function farmSignature(farm) {
  return JSON.stringify([
    cleanText(farm.name).toLowerCase(),
    cleanText(farm.barangay).toLowerCase(),
    cleanText(farm.municipality).toLowerCase(),
    cleanText(farm.province).toLowerCase(),
    normalizeNumber(farm.latitude, 6),
    normalizeNumber(farm.longitude, 6),
    normalizeNumber(farm.area_hectares, 4),
    farm.boundary_geojson ? JSON.stringify(farm.boundary_geojson) : null,
  ]);
}

function hasDuplicateFarm(farms, payload) {
  const nextSignature = farmSignature(payload);
  return farms.some((farm) => farmSignature(farm) === nextSignature);
}

function getPolygonPath(boundaryGeojson) {
  if (boundaryGeojson?.type !== 'Polygon' || !Array.isArray(boundaryGeojson.coordinates?.[0])) {
    return null;
  }

  const path = boundaryGeojson.coordinates[0]
    .map(([longitude, latitude]) => ({
      lat: Number(latitude),
      lng: Number(longitude),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  return path.length >= 3 ? path : null;
}

function getFarmBoundaryPath(farm) {
  const savedPath = getPolygonPath(farm.boundary_geojson);
  if (savedPath) return savedPath;

  const lat = parseCoordinate(farm.latitude);
  const lng = parseCoordinate(farm.longitude);
  const area = parsePositiveNumber(farm.area_hectares);
  if (lat === null || lng === null || area === null) return null;

  const radiusMeters = Math.sqrt((area * 10000) / Math.PI);
  return buildCirclePath(lat, lng, radiusMeters);
}

function buildLeafletMarkerOptions(isSelected, status) {
  const fillColor = isSelected ? '#166534' : status === 'approved' ? '#22c55e' : status === 'rejected' ? '#dc2626' : '#f59e0b';
  return {
    radius: isSelected ? 8 : 6,
    fillColor,
    fillOpacity: 1,
    color: '#ffffff',
    weight: 2,
  };
}

function buildGpsErrorMessage(error) {
  if (!error) return 'Could not get your current location.';
  if (error.code === error.PERMISSION_DENIED) return 'Location access was blocked on this device.';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Your current location is unavailable right now.';
  if (error.code === error.TIMEOUT) return 'Location lookup timed out. Please try again.';
  return 'Could not get your current location.';
}

export default function Farms() {
  const [farms, setFarms] = useState([]);
  const [selectedFarmId, setSelectedFarmId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [gpsLocating, setGpsLocating] = useState(false);
  const [mapState, setMapState] = useState({
    loading: true,
    error: '',
    notice: '',
  });

  const mapHostRef = useRef(null);
  const leafletMapRef = useRef(null);
  const leafletLayerGroupRef = useRef(null);
  const leafletMapClickHandlerRef = useRef(null);
  const autoLocateAttemptedRef = useRef(false);

  const draftBoundaryGeoJson = useMemo(
    () => createApproxBoundaryGeoJson(form.latitude, form.longitude, form.area_hectares),
    [form.latitude, form.longitude, form.area_hectares]
  );

  const selectedFarm = useMemo(
    () => farms.find((farm) => farm.id === selectedFarmId) || null,
    [farms, selectedFarmId]
  );

  async function loadFarms(preferredFarmId = null) {
    const { data } = await api.get('/farms');
    setFarms(data);
    setSelectedFarmId((current) => {
      if (preferredFarmId && data.some((farm) => farm.id === preferredFarmId)) return preferredFarmId;
      if (current && data.some((farm) => farm.id === current)) return current;
      return data.find((farm) => hasCoordinates(farm))?.id || data[0]?.id || null;
    });
  }

  useEffect(() => {
    loadFarms().catch(() => setFarms([]));
  }, []);

  const destroyLeafletMapArtifacts = useCallback(() => {
    if (leafletMapRef.current && leafletMapClickHandlerRef.current) {
      leafletMapRef.current.off('click', leafletMapClickHandlerRef.current);
      leafletMapClickHandlerRef.current = null;
    }
    if (leafletLayerGroupRef.current) {
      leafletLayerGroupRef.current.clearLayers();
      leafletLayerGroupRef.current = null;
    }
    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
      leafletMapRef.current = null;
    }
  }, []);

  const initializeLeafletMap = useCallback((notice = '') => {
    if (!leafletMapRef.current && mapHostRef.current) {
      leafletMapRef.current = L.map(mapHostRef.current, {
        center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
        zoom: 6,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(leafletMapRef.current);

      leafletLayerGroupRef.current = L.layerGroup().addTo(leafletMapRef.current);
      leafletMapClickHandlerRef.current = (event) => {
        setForm((current) => ({
          ...current,
          latitude: event.latlng.lat.toFixed(6),
          longitude: event.latlng.lng.toFixed(6),
        }));
      };
      leafletMapRef.current.on('click', leafletMapClickHandlerRef.current);
    }

    window.setTimeout(() => leafletMapRef.current?.invalidateSize(), 0);
    setMapState({
      loading: false,
      error: '',
      notice,
    });
  }, []);

  useEffect(() => {
    if (!mapHostRef.current) return undefined;
    try {
      initializeLeafletMap();
    } catch (mapError) {
      console.error('Map initialization failed.', mapError);
      setMapState({
        loading: false,
        error: 'Could not load the OpenStreetMap view on this device.',
        notice: '',
      });
    }
    return undefined;
  }, [initializeLeafletMap]);

  useEffect(() => {
    return () => destroyLeafletMapArtifacts();
  }, [destroyLeafletMapArtifacts]);

  const applyDetectedLocation = useCallback(async (position) => {
    const latitude = position.coords.latitude.toFixed(6);
    const longitude = position.coords.longitude.toFixed(6);
    let municipality = '';
    let province = '';

    try {
      const geocodedLocation = await reverseGeocodeLocation(latitude, longitude);
      municipality = geocodedLocation.municipality || '';
      province = geocodedLocation.province || '';
    } catch {
      municipality = '';
      province = '';
    }

    setForm((current) => ({
      ...current,
      latitude,
      longitude,
      municipality: municipality || current.municipality,
      province: province || current.province,
    }));

    if (leafletMapRef.current) {
      leafletMapRef.current.setView([Number(latitude), Number(longitude)], 16);
    }
  }, []);

  const locate = useCallback(({ silent = false } = {}) => {
    if (!navigator.geolocation) {
      if (!silent) {
        setError('Geolocation is not supported on this device.');
      }
      return;
    }

    setError('');
    setGpsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await applyDetectedLocation(position);
        } finally {
          setGpsLocating(false);
        }
      },
      (gpsError) => {
        setGpsLocating(false);
        if (!silent) {
          setError(buildGpsErrorMessage(gpsError));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [applyDetectedLocation]);

  useEffect(() => {
    if (autoLocateAttemptedRef.current) return;
    autoLocateAttemptedRef.current = true;
    locate({ silent: true });
  }, [locate]);

  useEffect(() => {
    const draftLatitude = parseCoordinate(form.latitude);
    const draftLongitude = parseCoordinate(form.longitude);

    if (leafletMapRef.current && leafletLayerGroupRef.current) {
      const map = leafletMapRef.current;
      const layerGroup = leafletLayerGroupRef.current;
      layerGroup.clearLayers();

      const bounds = L.latLngBounds([]);
      let farmPointCount = 0;

      farms.forEach((farm) => {
        const latitude = parseCoordinate(farm.latitude);
        const longitude = parseCoordinate(farm.longitude);
        if (latitude === null || longitude === null) return;

        const isSelected = farm.id === selectedFarmId;
        const marker = L.circleMarker([latitude, longitude], buildLeafletMarkerOptions(isSelected, farm.status)).addTo(layerGroup);
        marker.bindPopup(
          `<div style="min-width:220px;padding:4px 2px;font-family:Inter,Segoe UI,sans-serif;">
            <div style="font-size:15px;font-weight:700;color:#1c1917;">${escapeHtml(farm.name)}</div>
            <div style="margin-top:6px;font-size:12px;color:#57534e;">${escapeHtml(formatFarmLocation(farm))}</div>
            <div style="margin-top:10px;font-size:12px;color:#44403c;">Status: ${escapeHtml(farm.status)}</div>
            <div style="margin-top:4px;font-size:12px;color:#44403c;">Area: ${farm.area_hectares || '-'} ha</div>
          </div>`
        );
        marker.on('click', () => {
          setSelectedFarmId(farm.id);
          marker.openPopup();
        });

        bounds.extend([latitude, longitude]);
        farmPointCount += 1;

        const boundaryPath = getFarmBoundaryPath(farm);
        if (boundaryPath) {
          const polygon = L.polygon(
            boundaryPath.map((point) => [point.lat, point.lng]),
            {
              color: isSelected ? '#166534' : '#22c55e',
              weight: isSelected ? 3 : 2,
              opacity: 0.9,
              fillColor: isSelected ? '#86efac' : '#bbf7d0',
              fillOpacity: isSelected ? 0.22 : 0.12,
            }
          ).addTo(layerGroup);
          if (isSelected) {
            polygon.bringToFront();
            marker.bringToFront();
          }
          boundaryPath.forEach((point) => bounds.extend([point.lat, point.lng]));
        }
      });

      if (draftLatitude !== null && draftLongitude !== null) {
        const previewMarker = L.circleMarker([draftLatitude, draftLongitude], {
          radius: 7,
          fillColor: '#0f766e',
          fillOpacity: 1,
          color: '#ffffff',
          weight: 2,
        }).addTo(layerGroup);
        previewMarker.bindPopup('Draft farm location');

        const previewPath = getPolygonPath(draftBoundaryGeoJson);
        if (previewPath) {
          L.polygon(
            previewPath.map((point) => [point.lat, point.lng]),
            {
              color: '#0f766e',
              weight: 2,
              opacity: 0.95,
              fillColor: '#2dd4bf',
              fillOpacity: 0.16,
            }
          ).addTo(layerGroup);
          previewPath.forEach((point) => bounds.extend([point.lat, point.lng]));
        } else {
          bounds.extend([draftLatitude, draftLongitude]);
        }

        map.setView([draftLatitude, draftLongitude], 16);
        return undefined;
      }

      if (selectedFarm && hasCoordinates(selectedFarm)) {
        map.setView([Number(selectedFarm.latitude), Number(selectedFarm.longitude)], 16);
        return undefined;
      }

      if (farmPointCount > 1 && bounds.isValid()) {
        map.fitBounds(bounds.pad(0.15), { padding: [32, 32] });
        return undefined;
      }

      if (farmPointCount === 1) {
        const firstFarm = farms.find((farm) => hasCoordinates(farm));
        if (firstFarm) {
          map.setView([Number(firstFarm.latitude), Number(firstFarm.longitude)], 15);
        }
        return undefined;
      }

      map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 6);
      return undefined;
    }

    return undefined;
  }, [draftBoundaryGeoJson, farms, form.latitude, form.longitude, selectedFarm, selectedFarmId]);

  async function submit(event) {
    event.preventDefault();
    setError('');

    try {
      const payload = {
        ...form,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        area_hectares: form.area_hectares ? Number(form.area_hectares) : null,
        boundary_geojson: draftBoundaryGeoJson,
      };

      if (hasDuplicateFarm(farms, payload)) {
        setError('A farm with the same details already exists.');
        return;
      }

      const { data: createdFarm } = await api.post('/farms', payload);
      setForm(EMPTY_FORM);
      await loadFarms(createdFarm.id);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Could not save farm.'));
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Farm mapping"
        title="Farm registry"
        body="Register farm locations and keep boundaries ready for scans and weather alerts."
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <form className="surface rounded-lg p-4 sm:p-5" onSubmit={submit}>
          <h2 className="section-title flex items-center gap-2">
            <Plus className="h-5 w-5 text-leaf-700" />
            Register farm
          </h2>
          {error && <div className="danger-message mt-4">{error}</div>}
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Farm name</span>
              <input className="field mt-2" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Barangay</span>
              <input className="field mt-2" value={form.barangay} onChange={(event) => setForm({ ...form, barangay: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Municipality / City</span>
              <input className="field mt-2" value={form.municipality} onChange={(event) => setForm({ ...form, municipality: event.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Province</span>
              <input className="field mt-2" value={form.province} onChange={(event) => setForm({ ...form, province: event.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Latitude</span>
                <input className="field mt-2" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-stone-700">Longitude</span>
                <input className="field mt-2" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-stone-700">Area in hectares</span>
              <input className="field mt-2" value={form.area_hectares} onChange={(event) => setForm({ ...form, area_hectares: event.target.value })} />
            </label>
            <button type="button" className="btn-secondary" onClick={() => locate()} disabled={gpsLocating}>
              {gpsLocating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
              {gpsLocating ? 'Locating...' : 'Use GPS location'}
            </button>
            <button className="btn-primary">Save farm</button>
          </div>
        </form>

        <section className="space-y-4">
          <div className="surface rounded-lg p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="section-title flex items-center gap-2">
                  <MapPinned className="h-5 w-5 text-leaf-700" />
                  GPS boundary map
                </div>
                <p className="mt-2 text-sm text-stone-500">
                  Farm pins, saved boundaries, and draft locations.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-wide text-stone-500">
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1">{farms.length} farms</span>
                <span className="rounded-full border border-stone-200 bg-white px-3 py-1">OpenStreetMap</span>
                {selectedFarm && <span className="rounded-full border border-leaf-200 bg-leaf-50 px-3 py-1 text-leaf-700">Focused: {selectedFarm.name}</span>}
              </div>
            </div>
            {mapState.notice && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {mapState.notice}
              </div>
            )}

            <div className="relative mt-4 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              <div ref={mapHostRef} className="min-h-[300px] w-full sm:min-h-[380px] lg:min-h-[420px]" />
              {(mapState.loading || mapState.error) && (
                <div className="absolute inset-0 grid place-items-center bg-white/85 px-6 text-center">
                  <div>
                    {mapState.loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-leaf-700" /> : null}
                    <p className="mt-3 font-semibold text-stone-900">
                      {mapState.loading ? 'Loading farm map...' : 'Map could not be shown'}
                    </p>
                    <p className="mt-1 max-w-md text-sm text-stone-500">
                      {mapState.loading
                        ? 'Preparing farm pins, GPS boundaries, and location capture.'
                        : mapState.error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {farms.length === 0 ? (
            <EmptyState title="No farms yet" body="Register a farm to unlock weather, predictions, scans, marketplace listings, and inspection workflows." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {farms.map((farm) => {
                const isSelected = farm.id === selectedFarmId;
                return (
                  <button
                    key={farm.id}
                    type="button"
                    className={`surface rounded-lg p-4 text-left transition ${
                      isSelected ? 'border-leaf-300 bg-leaf-50/70' : 'hover:-translate-y-0.5 hover:border-leaf-200 hover:bg-leaf-50/40'
                    }`}
                    onClick={() => setSelectedFarmId(farm.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="break-words font-bold text-stone-950">{farm.name}</h3>
                        <p className="mt-1 text-sm text-stone-500">{formatFarmLocation(farm)}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-leaf-100 px-2 py-1 text-xs font-bold uppercase text-leaf-800">{farm.status}</span>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm min-[420px]:grid-cols-2">
                      <div>
                        <dt className="text-stone-500">Area</dt>
                        <dd className="font-semibold">{farm.area_hectares || '-'} ha</dd>
                      </div>
                      <div>
                        <dt className="text-stone-500">GPS</dt>
                        <dd className="font-semibold">{farm.latitude ? `${farm.latitude}, ${farm.longitude}` : '-'}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-xs font-medium text-stone-500">
                      {farm.boundary_geojson
                        ? 'Saved farm boundary loaded on the map.'
                        : farm.area_hectares && farm.latitude
                          ? 'Boundary estimated from saved area and GPS center.'
                          : 'Add GPS and area data for a visible boundary.'}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
