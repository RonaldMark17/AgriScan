export async function reverseGeocodeLocation(latitude, longitude) {
  const language =
    (typeof document !== 'undefined' && document.documentElement.lang) ||
    (typeof navigator !== 'undefined' && navigator.language) ||
    'en';

  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
  endpoint.searchParams.set('format', 'jsonv2');
  endpoint.searchParams.set('lat', String(latitude));
  endpoint.searchParams.set('lon', String(longitude));
  endpoint.searchParams.set('zoom', '10');
  endpoint.searchParams.set('addressdetails', '1');
  endpoint.searchParams.set('accept-language', language);

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Reverse geocoding failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const address = payload?.address || {};
  const province =
    address.province ||
    address.state_district ||
    address.county ||
    address.state ||
    address.region ||
    null;
  const municipality =
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.suburb ||
    null;

  return {
    province,
    municipality,
    formattedAddress: payload?.display_name || null,
  };
}
