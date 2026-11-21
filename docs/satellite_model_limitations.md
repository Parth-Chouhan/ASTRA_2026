# Example Lunar Relay Satellite Model — Equations, Constants & Limitations

This document describes the illustrative relay satellite simulation in `src/satellite/satellite.js`. It is an **example relay orbit** for first-screening comparison, **not** an operational mission orbit design.

---

## 1. Authoritative Constants

| Constant | Value | Units | Source |
|---|---|---|---|
| `R_MOON` | `1737.4` | `km` | IAU/IAG WGCCRE mean lunar reference sphere (Archinal et al., 2018); matches JPL Horizons DE441 `Center radii: 1737.4 km` |
| `MU_MOON` | `4902.8` | `km³/s²` | NASA JPL DE440/DE441 lunar gravitational parameter (`GM`) |
| `MOON_SIDEREAL_DAYS` | `27.321661` | `days` | IAU / JPL lunar sidereal rotation period |

---

## 2. Equations & Coordinate Transformations

1. **Circular Orbit Period:**
   $$a = R_{\text{Moon}} + h, \qquad T = 2\pi\sqrt{\frac{a^3}{\mu}}$$
   At $h = 100\text{ km}$, $a = 1837.4\text{ km}$ and $T \approx 7070.3\text{ s} \approx 117.84\text{ min}$.

2. **Inertial Polar Orbit (fixed $x\text{–}z$ plane):**
   $$\theta(t) = \theta_0 + \frac{2\pi t}{T}, \qquad \mathbf{r}_i(t) = \begin{pmatrix} a\cos\theta \\ 0 \\ a\sin\theta \end{pmatrix}$$

3. **Moon-Fixed Frame Transformation:**
   The Moon rotates eastward about its $+z$ polar axis by $\phi(t) = \frac{2\pi t}{T_{\text{sidereal}}}$. Rotating $\mathbf{r}_i$ by $-\phi$ about $+z$ transforms into the Moon-fixed frame (preserving $|\mathbf{r}'| = a$):
   $$x' = x_i\cos\phi + y_i\sin\phi, \qquad y' = -x_i\sin\phi + y_i\cos\phi, \qquad z' = z_i$$

4. **Site Position & Local ENU Basis (matching Phase 1 East-positive geodetic convention):**
   $$\mathbf{u} = \begin{pmatrix} \cos\text{lat}\cos\text{lon} \\ \cos\text{lat}\sin\text{lon} \\ \sin\text{lat} \end{pmatrix}, \quad \mathbf{e} = \begin{pmatrix} -\sin\text{lon} \\ \cos\text{lon} \\ 0 \end{pmatrix}, \quad \mathbf{n} = \begin{pmatrix} -\sin\text{lat}\cos\text{lon} \\ -\sin\text{lat}\sin\text{lon} \\ \cos\text{lat} \end{pmatrix}, \quad \mathbf{r}_{\text{site}} = R_{\text{Moon}}\mathbf{u}$$

5. **Topocentric Elevation & Azimuth:**
   $$\mathbf{v} = \mathbf{r}' - \mathbf{r}_{\text{site}}, \qquad \text{el} = \arcsin\!\left(\text{clamp}_{[-1,1]}\!\left(\frac{\mathbf{v}\cdot\mathbf{u}}{|\mathbf{v}|}\right)\right), \qquad \text{az} = \text{atan2}(\mathbf{v}\cdot\mathbf{e},\, \mathbf{v}\cdot\mathbf{n}) \bmod 360^\circ$$
   Visibility above the flat geometric horizon: $\text{el} > 0^\circ$.

6. **First-Order Earth Line-of-Sight Approximation (`canSeeEarth`):**
   - Earth direction is approximated as the fixed Moon-fixed unit vector $\hat{\mathbf{e}}_{\oplus} = (1, 0, 0)$ (mean sub-Earth point at $\text{lat}=0^\circ, \text{lon}=0^\circ$).
   - The satellite is occluded by the Moon iff $x' < 0$ AND $\sqrt{y'^2 + z'^2} \le R_{\text{Moon}}$.
   - Relay usability requires **both** lander-to-satellite visibility ($\text{el} > 0^\circ$) **and** satellite-to-Earth line of sight.

7. **Combined Communication Coverage:**
   - Direct Earth elevation from the 2-hour Horizons series is linearly interpolated to each 2-minute satellite timestamp.
   - `combined_available = (interpolated_earth_elev > 0) OR (lander_sees_satellite AND satellite_sees_earth)`.
   - Returns `null` when no valid Earth elevation series is supplied.

---

## 3. Explicit Scientific Limitations

- **Illustrative orbit only:** Circular polar Keplerian orbit; ignores lunar gravity anomalies (mascons), third-body Earth/Sun perturbations, and nodal precession.
- **Flat geometric horizon:** Ignores local crater rims, ridges, and topographic masking.
- **Libration ignored in Earth-link check:** Fixed sub-Earth vector $(1, 0, 0)$ ignores lunar optical/physical libration ($\sim\pm 8^\circ$ longitude, $\sim\pm 7^\circ$ latitude) and finite Earth distance.
- **No RF link budget:** Geometric visibility above $0^\circ$ does not guarantee RF link closure, minimum elevation mask (e.g., $5^\circ\text{–}10^\circ$), or antenna slewing constraints.

