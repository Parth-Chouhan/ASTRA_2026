/**
 * Sky dome 3D direction & Moon-fixed coordinate conversions (CLAUDE.md):
 *
 * 1. Local sky dome frame (x = east, y = up, -z = north):
 *    dir(az, el) = (cos(el) * sin(az), sin(el), -cos(el) * cos(az))
 *
 * 2. Local (az, el) -> Moon-fixed frame (z = pole, x = lon 0 on equator):
 *    up    = (cos lat cos lon, cos lat sin lon, sin lat)
 *    east  = (-sin lon, cos lon, 0)
 *    north = (-sin lat cos lon, -sin lat sin lon, cos lat)
 *    v     = cos(el) sin(az) east + cos(el) cos(az) north + sin(el) up
 *
 * 3. Moon-fixed -> Three.js drawing frame (maps Moon z to Three.js y):
 *    (x, y, z)_moon -> (x, z, -y)_three
 */
const DEG = Math.PI / 180;

export function dir(azDeg, elDeg) {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const cosEl = Math.cos(el);
  return {
    x: cosEl * Math.sin(az),
    y: Math.sin(el),
    z: -cosEl * Math.cos(az),
  };
}

export function azElTo3D(azDeg, elDeg, distance = 1) {
  const d = dir(azDeg, elDeg);
  return {
    x: distance * d.x,
    y: distance * d.y,
    z: distance * d.z,
  };
}

export function latLonToMoonFixed(latDeg, lonDeg, r = 1) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const clat = Math.cos(lat);
  return {
    x: r * clat * Math.cos(lon),
    y: r * clat * Math.sin(lon),
    z: r * Math.sin(lat),
  };
}

export function localAzElToMoonFixed(latDeg, lonDeg, azDeg, elDeg) {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const az = azDeg * DEG;
  const el = elDeg * DEG;

  const clat = Math.cos(lat), slat = Math.sin(lat);
  const clon = Math.cos(lon), slon = Math.sin(lon);
  const cel = Math.cos(el), sel = Math.sin(el);
  const saz = Math.sin(az), caz = Math.cos(az);

  const up    = { x: clat * clon,  y: clat * slon,  z: slat };
  const east  = { x: -slon,        y: clon,         z: 0 };
  const north = { x: -slat * clon, y: -slat * slon, z: clat };

  const ceSaz = cel * saz;
  const ceCaz = cel * caz;
  return {
    x: ceSaz * east.x + ceCaz * north.x + sel * up.x,
    y: ceSaz * east.y + ceCaz * north.y + sel * up.y,
    z: ceSaz * east.z + ceCaz * north.z + sel * up.z,
  };
}

export function moonFixedToThree(v) {
  return { x: v.x, y: v.z, z: -v.y };
}
