/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable */
/* @ts-nocheck */

// React via PluginDependencies (sem imports)
const _PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = _PD.React;

interface PointResult {
  uid?: string;
  label?: string;
  name?: string;
  city?: string;
  uf?: string;
  coordinates?: [number, number]; // [lon, lat]
  tempo?: number;
}

interface Direction {
  id: string;
  geojson: GeoJSON.Feature<GeoJSON.LineString> & {
    properties: {
      id: string;
      color?: string;
      query?: any;
      summary?: {
        distance?: number; // metros
        duration?: number; // segundos
      };
    };
  };
}

interface Roteiro {
  pontos: PointResult[];
  dataIda: string;
  dataVolta: string;
  interesses?: string;
  tempo?: number; // dias
}

interface Props {
  roteiro: Roteiro;
  directions?: Direction[];
}

/* ---------- Helpers de distância (Haversine) ---------- */
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

/* ---------- Cores por dia vindas do Board (TT_VIAGENS) ---------- */
function getDayColorsLegend(): Array<{ day: string; color: string; legs: number }> {
  const viagens = (window as any).TT_VIAGENS || [];
  return viagens.map((v: any) => ({
    day: v.day,
    color: v.color,
    legs: Array.isArray(v.legs) ? v.legs.length : 0,
  }));
}

/* ---------- Helpers de formatação ---------- */
function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR');
  } catch {
    return dateStr;
  }
}

function labelFromPoint(p?: PointResult): string {
  if (!p) return '(sem nome)';
  if (p.label && p.label.trim()) return p.label.trim();

  const composed = [p.name, p.city, p.uf].filter(Boolean).join(', ');
  if (composed) return composed;

  if (Array.isArray(p.coordinates) && p.coordinates.length === 2) {
    const [lon, lat] = p.coordinates;
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  return '(sem nome)';
}

/* ---------- Componente principal ---------- */
export function RoteiroResumo({ roteiro, directions = [] }: Props) {
  const pontos = roteiro?.pontos ?? [];
  const total = pontos.length;

  const origem = total > 0 ? pontos[0] : undefined;
  const destino = total > 1 ? pontos[total - 1] : undefined;
  const paradas = total > 2 ? pontos.slice(1, total - 1) : [];

  // 1) Distância usando as rotas retornadas (se tiver)
  const metersFromDirections = directions.reduce((acc, d) => {
    const geom = d?.geojson?.geometry;
    if (geom?.type === 'LineString' && Array.isArray(geom.coordinates)) {
      return acc + lineStringLengthMeters(geom.coordinates as Array<[number, number]>);
    }
    return acc;
  }, 0);

  // 2) Fallback: distância entre os pontos do formulário
  const metersFallback = (() => {
    let sum = 0;
    for (let i = 0; i < pontos.length - 1; i++) {
      const a = pontos[i]?.coordinates as [number, number] | undefined;
      const b = pontos[i + 1]?.coordinates as [number, number] | undefined;
      if (a && b) sum += haversineMeters(a, b);
    }
    return sum;
  })();

  const totalMeters = metersFromDirections > 0 ? metersFromDirections : metersFallback;
  const totalKm = totalMeters / 1000;
  const formattedKm =
    totalKm > 0
      ? totalKm.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : '—';

  // tempo de deslocamento (se summary vier preenchido)
  let totalMin = 0;
  directions.forEach((d) => {
    const dur = d?.geojson?.properties?.summary?.duration;
    if (typeof dur === 'number') {
      totalMin += dur / 60;
    }
  });
  totalMin = Math.round(totalMin);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;

  const legend = getDayColorsLegend();

  return (
    <section className="mt-4 space-y-4">
      {/* Legenda das cores por dia (se existir do board) */}
      {legend.length > 0 && (
        <div className="bg-white/90 border border-slate-200 rounded-xl p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Cores por dia do roteiro
          </h3>
          <div className="flex flex-wrap gap-2">
            {legend.map(({ day, color, legs }) => (
              <div
                key={day}
                className="flex items-center gap-2 px-2 py-1 rounded-lg border bg-slate-50"
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
                <span className="text-xs font-semibold text-slate-700">
                  {day}
                </span>
                {typeof legs === 'number' && legs > 0 && (
                  <span className="text-[10px] text-slate-500">
                    ({legs} trecho{legs > 1 ? 's' : ''})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cards principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card 1 – Datas e resumo geral */}
        <div className="lg:col-span-1 bg-white/90 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Resumo da viagem
          </h3>

          <div className="flex flex-col gap-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="font-medium">Data de ida:</span>
              <span>{formatDate(roteiro?.dataIda)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Data de volta:</span>
              <span>{formatDate(roteiro?.dataVolta)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Duração planejada:</span>
              <span>{roteiro?.tempo || 1} dia(s)</span>
            </div>
          </div>

          {roteiro?.interesses && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-slate-600 mb-1">
                Interesses
              </div>
              <p className="text-xs text-slate-600 whitespace-pre-line">
                {roteiro.interesses}
              </p>
            </div>
          )}
        </div>

        {/* Card 2 – Distância e tempo estimado de deslocamento */}
        <div className="lg:col-span-1 bg-white/90 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Deslocamentos previstos
          </h3>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex flex-col p-2 rounded-lg bg-slate-50">
              <span className="text-[11px] text-slate-500">
                Distância total (aprox.)
              </span>
              <span className="text-base font-semibold text-slate-800">
                {formattedKm !== '—' ? `${formattedKm} km` : '—'}
              </span>
            </div>

            <div className="flex flex-col p-2 rounded-lg bg-slate-50">
              <span className="text-[11px] text-slate-500">
                Tempo em deslocamento
              </span>
              <span className="text-base font-semibold text-slate-800">
                {totalMin > 0
                  ? horas > 0
                    ? `${horas}h ${minutos}min`
                    : `${minutos} min`
                  : '—'}
              </span>
            </div>
          </div>

          <div className="mt-2 text-[11px] text-slate-500">
            Total de rotas geradas: <strong>{directions.length}</strong>
          </div>
        </div>

        {/* Card 3 – Lista de pontos (itinerário) */}
        <div className="lg:col-span-1 bg-white/90 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            Itinerário planejado
          </h3>

          <ol className="text-xs text-slate-700 space-y-2">
            {origem && (
              <li className="flex items-start gap-2">
                <span className="mt-[2px] h-2 w-2 rounded-full bg-emerald-500" />
                <div>
                  <div className="font-semibold text-slate-800">
                    Origem
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {labelFromPoint(origem)}
                  </div>
                </div>
              </li>
            )}

            {paradas.map((p, idx) => (
              <li key={p.uid ?? idx} className="flex items-start gap-2">
                <span className="mt-[2px] h-2 w-2 rounded-full bg-blue-500" />
                <div>
                  <div className="font-semibold text-slate-800">
                    Parada {idx + 1}
                    {p.tempo ? (
                      <span className="text-[10px] text-slate-500 ml-1">
                        ({p.tempo} min)
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {labelFromPoint(p)}
                  </div>
                </div>
              </li>
            ))}

            {destino && destino !== origem && (
              <li className="flex items-start gap-2">
                <span className="mt-[2px] h-2 w-2 rounded-full bg-rose-500" />
                <div>
                  <div className="font-semibold text-slate-800">
                    Destino
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {labelFromPoint(destino)}
                  </div>
                </div>
              </li>
            )}
          </ol>
        </div>
      </div>
    </section>
  );
}

export default RoteiroResumo;
