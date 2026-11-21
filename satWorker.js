import { simulate } from './satellite.js';

self.onmessage = (e) => {
  const { id, site, simStartIso, simEndIso, satAltitude, satStartAngle } = e.data;
  const result = simulate(site, simStartIso, simEndIso, satAltitude, satStartAngle);
  self.postMessage({ id, result });
};

