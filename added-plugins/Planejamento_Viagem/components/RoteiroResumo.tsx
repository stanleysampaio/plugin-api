const { React } = window.PluginDependencies;

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

function haversineMeters(a: [number, number], b: [number, number]): number {
  // a,b = [lon, lat] em graus
  const R = 6371000; // raio médio da Terra (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const [lon1, lat1] = a;
  const [lon2, lat2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);

  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

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

  // 1) Tenta medir pela geometria das rotas
  const metersFromDirections = directions.reduce((acc, d) => {
    const geom = d?.geojson?.geometry;
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      return acc + lineStringLengthMeters(geom.coordinates as Array<[number, number]>);
    }
    return acc;
  }, 0);

  // 2) Fallback: distância direta entre os pontos informados no formulário
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

  return (
    <section className="mt-4 border-t pt-4 bg-blue-50 p-4 rounded">
      <h3 className="font-semibold text-lg">Resumo do Roteiro</h3>
      <ul className="list-disc ml-5 mt-2 text-sm space-y-1">
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
