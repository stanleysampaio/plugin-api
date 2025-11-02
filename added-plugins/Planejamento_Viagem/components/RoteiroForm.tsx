/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable @typescript-eslint/no-explicit-any */

const PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = PD.React;

const PluginMapInput = PD.PluginMapInput;

// Serviço opcional do host para “forçar” estilo do pin imediatamente
const pinService = (PD.pinService ?? {}) as {
  setPinStyle?: (id: string, props: any) => Promise<void>;
};

// tipos aceitos pelo renderer do host
const TR_POI_TYPE  = 'tr_poi';
const TR_BASE_TYPE = 'tr_base';

// cinza neutro pré-roteiro
const NEUTRAL_HEX  = '#64748b';
const NEUTRAL_RGBA: [number, number, number, number] = [100, 116, 139, 0.95];

function restylePin(pinHook: any, id: string, kind: 'base' | 'poi') {
  const wantType = kind === 'base' ? TR_BASE_TYPE : TR_POI_TYPE;

  const tryHook = () => {
    try { pinHook?.updatePin?.(id, { type: wantType }); } catch {}
  };
  const tryService = async () => {
    if (!pinService?.setPinStyle) return;
    try {
      await pinService.setPinStyle(id, {
        kind, type: wantType,
        colorHex: NEUTRAL_HEX, colorRGBA: NEUTRAL_RGBA,
      });
    } catch {}
  };

  requestAnimationFrame(tryHook);
  setTimeout(tryHook, 60);
  setTimeout(tryHook, 140);
  setTimeout(tryService, 0);
  setTimeout(tryService, 120);
  setTimeout(tryService, 240);
}

interface PointResult {
  uid: string;
  id?: string;
  label?: string;
  name?: string;
  city?: string;
  uf?: string;
  coordinates?: number[]; // [lon, lat]
  tipo?: 'base' | 'interesse';
  tempo?: number;
}
interface Roteiro {
  dataIda: string;
  dataVolta: string;
  interesses: string;
  tempo: number;
  pontos: PointResult[];
}
interface Props { onSubmit: (r: Roteiro) => void; }

function generateUid() { return Math.random().toString(36).slice(2, 9); }

export function RoteiroForm({ onSubmit }: Props) {
  const pinHook = PD.usePin ? PD.usePin() : null;

  const [dataIda, setDataIda] = _R.useState('');
  const [dataVolta, setDataVolta] = _R.useState('');
  const [interesses, setInteresses] = _R.useState('');
  const [tempo, setTempo] = _R.useState(1);
  const [pontos, setPontos] = _R.useState<PointResult[]>([
    { uid: generateUid(), tipo: 'base' },                // Origem
    { uid: generateUid(), tipo: 'interesse', tempo: 60 } // Parada 1
  ]);

  function normalizeLabel(p: Partial<PointResult>): string {
    return (
      p.label ||
      [p.name, p.city, p.uf].filter(Boolean).join(', ') ||
      (Array.isArray(p.coordinates) && p.coordinates.length === 2
        ? `${(p.coordinates[1] as number).toFixed(6)}, ${(p.coordinates[0] as number).toFixed(6)}`
        : '')
    );
  }

  function updatePoint(index: number, newValue?: PointResult) {
    if (!newValue || !Array.isArray(newValue.coordinates)) return;
    setPontos((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...newValue, label: normalizeLabel(newValue) };
      const id = `point-${next[index].uid}`;
      const kind = next[index].tipo === 'base' ? 'base' : 'poi';
      restylePin(pinHook, id, kind);
      return next;
    });
  }

  function updateTipo(index: number, tipo: 'base' | 'interesse') {
    setPontos((prev) => {
      const next = [...prev];
      next[index].tipo = tipo;
      if (tipo === 'interesse' && !next[index].tempo) next[index].tempo = 60;
      if (tipo === 'base') delete next[index].tempo;
      restylePin(pinHook, `point-${next[index].uid}`, tipo);
      return next;
    });
  }

  function updateTempo(index: number, t: number) {
    setPontos((prev) => {
      const next = [...prev];
      next[index].tempo = t;
      return next;
    });
  }

  function addPonto() {
    setPontos((prev) => {
      const next = [...prev];
      next.splice(next.length - 1, 0, { uid: generateUid(), tipo: 'interesse', tempo: 60 });
      return next;
    });
  }

  function removePonto(index: number) {
    setPontos((prev) => {
      if (prev.length <= 2) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    onSubmit({ dataIda, dataVolta, interesses, tempo, pontos });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input type="date" value={dataIda} onChange={(e) => setDataIda(e.target.value)} className="border p-2 rounded" required />
      <input type="date" value={dataVolta} onChange={(e) => setDataVolta(e.target.value)} className="border p-2 rounded" required />
      <textarea placeholder="Interesses (ex: natureza, cultura, gastronomia)" value={interesses} onChange={(e) => setInteresses(e.target.value)} className="border p-2 rounded" />
      <input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} className="border p-2 rounded" min={1} placeholder="Tempo estimado (dias)" />

      <div className="flex flex-col gap-2 mt-2">
        <label className="font-semibold">Pontos da Rota</label>

        {pontos.map((ponto, index) => {
          const rotulo =
            index === 0 ? 'Origem' :
            index === pontos.length - 1 ? 'Destino' :
            `Parada ${index}`;
          return (
            <div key={ponto.uid} className="flex flex-col gap-1 w-full border p-2 rounded">
              <span className="text-xs font-semibold text-gray-600">{rotulo}</span>

              <div className="flex items-center gap-2">
                <PluginMapInput
                  id={`point-${ponto.uid}`}
                  selectedValue={
                    Array.isArray(ponto.coordinates) && ponto.coordinates.length === 2
                      ? { id: ponto.uid, name: ponto.name, city: ponto.city, uf: ponto.uf, coordinates: ponto.coordinates }
                      : undefined
                  }
                  onSelectValue={(val: any) =>
                    updatePoint(index, {
                      uid: ponto.uid,
                      id: val?.id, name: val?.name, city: val?.city, uf: val?.uf,
                      coordinates: val?.coordinates, tipo: ponto.tipo, tempo: ponto.tempo,
                    })
                  }
                  onUnselectValue={() => removePonto(index)}
                />
                {pontos.length > 2 && index !== 0 && index !== pontos.length - 1 && (
                  <button type="button" onClick={() => removePonto(index)} className="text-red-500 text-sm hover:underline">
                    Remover
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select value={ponto.tipo} onChange={(e) => updateTipo(index, e.target.value as any)} className="text-sm border p-1 rounded">
                  <option value="base">Ponto Base</option>
                  <option value="interesse">Ponto de Interesse</option>
                </select>
                {ponto.tipo === 'interesse' && (
                  <input
                    type="number"
                    value={ponto.tempo ?? 60}
                    onChange={(e) => updateTempo(index, Number(e.target.value))}
                    className="text-sm border p-1 rounded w-20"
                    min={5} step={5} placeholder="Tempo (min)" title="Tempo de permanência no local"
                  />
                )}
              </div>
            </div>
          );
        })}

        <button type="button" onClick={addPonto} className="bg-gray-200 text-sm rounded p-1 mt-1 w-fit">
          + Adicionar parada
        </button>
      </div>

      <button type="submit" className="bg-blue-500 text-white rounded p-2 mt-4">Gerar Roteiro</button>
    </form>
  );
}

export default RoteiroForm;
