/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

// React via PluginDependencies (sem imports)
const _PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = _PD.React;

interface PointResult {
  label?: string;
  coordinates: [number, number]; // [lon, lat]
}

interface Direction {
  id: string;
  geojson: GeoJSON.Feature<GeoJSON.LineString> & {
    properties: {
      id: string;
      color?: string;
      query?: any;
    };
  };
}

interface Roteiro {
  pontos: PointResult[];
  dataIda: string;
  dataVolta: string;
}

interface Props {
  roteiro: Roteiro;
  directions?: Direction[];
}

/* ---------- Helpers de distância ---------- */
function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

function lineStringLengthMeters(coords: Array<[number, number]>): number {
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    if (
      Array.isArray(a) &&
      Array.isArray(b) &&
      typeof a[0] === 'number' &&
      typeof a[1] === 'number' &&
      typeof b[0] === 'number' &&
      typeof b[1] === 'number'
    ) {
      total += haversineMeters(a, b);
    }
  }
  return total;
}

/* ---------- Cores por dia vindas do Board ---------- */
function getDayColorsLegend():
  Array<{ day: string; color: string; legs: number }> {
  const viagens = (window as any).TT_VIAGENS || [];
  return viagens.map((v: any) => ({
    day: v.day,
    color: v.color,
    legs: Array.isArray(v.legs) ? v.legs.length : 0,
  }));
}

export function RoteiroResumo({ roteiro, directions = [] }: Props) {
  const total = roteiro.pontos.length;

  const formatPoint = (ponto?: PointResult): string =>
    ponto?.label?.trim() ||
    (Array.isArray(ponto?.coordinates) && ponto.coordinates.length === 2
      ? ponto.coordinates.join(', ')
      : '---');

  const origem = formatPoint(roteiro.pontos[0]);
  const destino = formatPoint(roteiro.pontos[total - 1]);
  const paradas = roteiro.pontos.slice(1, total - 1);

  // 1) pela geometria das rotas
  const metersFromDirections = directions.reduce((acc, d) => {
    const geom = d?.geojson?.geometry;
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      return acc + lineStringLengthMeters(geom.coordinates as Array<[number, number]>);
    }
    return acc;
  }, 0);

  // 2) fallback entre os pontos do formulário
  const metersFallback = (() => {
    let sum = 0;
    for (let i = 0; i < roteiro.pontos.length - 1; i++) {
      const a = roteiro.pontos[i]?.coordinates as [number, number] | undefined;
      const b = roteiro.pontos[i + 1]?.coordinates as [number, number] | undefined;
      if (a && b) sum += haversineMeters(a, b);
    }
    return sum;
  })();

  const totalMeters = metersFromDirections > 0 ? metersFromDirections : metersFallback;
  const totalKm = totalMeters / 1000;
  const formattedKm = totalKm.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const legend = getDayColorsLegend();

  return (
    <section className="mt-4 border-t pt-4 bg-blue-50 p-4 rounded">
      <h3 className="font-semibold text-lg">Resumo do Roteiro</h3>

      {/* Legenda das cores por dia (se existir do board) */}
      {legend.length > 0 && (
        <div className="mt-3">
          <div className="text-sm font-medium mb-1">Cores por dia:</div>
          <div className="flex flex-wrap gap-2">
            {legend.map(({ day, color, legs }) => (
              <div
                key={day}
                className="flex items-center gap-2 px-2 py-1 rounded border bg-white"
                style={{ borderColor: '#e5e7eb' }}
                title={`Trechos: ${legs}`}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: 4,
                    background: color,
                    boxShadow: '0 0 0 1px rgba(0,0,0,.08) inset',
                  }}
                />
                <span className="text-xs font-semibold">{day}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ul className="list-disc ml-5 mt-3 text-sm space-y-1">
        <li><strong>Data de Ida:</strong> {roteiro.dataIda}</li>
        <li><strong>Data de Volta:</strong> {roteiro.dataVolta}</li>
        <li><strong>Origem:</strong> {origem}</li>
        <li><strong>Destino:</strong> {destino}</li>

        {paradas.length > 0 && (
          <li>
            <strong>Paradas:</strong>
            <ul className="list-circle ml-4 mt-1">
              {paradas.map((p, index) => (
                <li key={index}>{formatPoint(p)}</li>
              ))}
            </ul>
          </li>
        )}

        <li><strong>Total de rotas geradas:</strong> {directions.length}</li>
        <li><strong>Distância total:</strong> {formattedKm} km</li>
      </ul>
    </section>
  );
}

export default RoteiroResumo;
