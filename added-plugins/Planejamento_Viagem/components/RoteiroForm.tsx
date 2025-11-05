/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */
/* eslint-disable @typescript-eslint/no-explicit-any */

const _PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = _PD.React;

// Expostos pelo host
const PluginMapInput = _PD.PluginMapInput;

// Serviço opcional exposto pelo host
const pinService = (_PD.pinService ?? {}) as {
  setPinStyle?: (id: string, props: any) => Promise<void>;
  hideSelectorsNow?: () => Promise<void> | void;
};

// Tipos de ícone suportados pelo pinService / OpenLayers
const TR_POI_TYPE  = 'tr_poi';
const TR_BASE_TYPE = 'tr_base';

// Cor neutra enquanto o Board ainda não coloriu por dia
const NEUTRAL_HEX  = '#64748b';
const NEUTRAL_RGBA: [number, number, number, number] = [100, 116, 139, 0.95];

type PointResult = {
  uid: string;
  id?: string;
  label?: string;
  name?: string;
  city?: string;
  uf?: string;
  coordinates?: number[]; // [lon, lat]
  tipo?: 'base' | 'interesse';
  tempo?: number;
};
type Roteiro = {
  dataIda: string;
  dataVolta: string;
  interesses: string;
  tempo: number;
  pontos: PointResult[];
};
type Props = { onSubmit: (r: Roteiro) => void };

/** Aplica imediatamente o estilo do pin (sem mostrar quadrado/bolinha cinza).
 *  1) tenta atualizar via hook do host (updatePin) — quando existir,
 *  2) força via pinService.setPinStyle (TR_BASE/TR_POI + cor neutra),
 *  3) remove seletores cinza que o OL às vezes deixa no mapa. */
function restylePin(pinHook: any, id: string, kind: 'base' | 'poi') {
  const wantType = kind === 'base' ? TR_BASE_TYPE : TR_POI_TYPE;

  const tryHook = () => {
    try {
      if (pinHook?.updatePin) {
        pinHook.updatePin(id, { type: wantType });
      }
    } catch {}
  };

  const tryService = async () => {
    try {
      await pinService.hideSelectorsNow?.();
      await pinService.setPinStyle?.(id, {
        kind,
        type: wantType,
        colorHex: NEUTRAL_HEX,
        colorRGBA: NEUTRAL_RGBA,
      });
    } catch {}
  };

  // O MapInput cria o feature logo após o select → batemos em alguns frames
  requestAnimationFrame(tryHook);
  setTimeout(tryHook, 50);
  setTimeout(tryHook, 140);

  setTimeout(tryService, 0);
  setTimeout(tryService, 120);
  setTimeout(tryService, 260);
}

function generateUid() {
  return Math.random().toString(36).slice(2, 9);
}

function normalizeLabel(p: Partial<PointResult>): string {
  return (
    p.label ||
    [p.name, p.city, p.uf].filter(Boolean).join(', ') ||
    (Array.isArray(p.coordinates) && p.coordinates.length === 2
      ? `${(p.coordinates[1] as number).toFixed(6)}, ${(p.coordinates[0] as number).toFixed(6)}`
      : '')
  );
}

export function RoteiroForm({ onSubmit }: Props) {
  // hook do host (se disponível) deve ser chamado dentro do componente
  const pinHook = _PD.usePin ? _PD.usePin() : null;

  const [dataIda, setDataIda] = _R.useState('');
  const [dataVolta, setDataVolta] = _R.useState('');
  const [interesses, setInteresses] = _R.useState('');
  const [tempo, setTempo] = _R.useState(1);

  // Começamos com ORIGEM (base), 1 parada (interesse) e DESTINO (base)
  const [pontos, setPontos] = _R.useState<PointResult[]>([
    { uid: generateUid(), tipo: 'base' },
    { uid: generateUid(), tipo: 'interesse', tempo: 60 },
    { uid: generateUid(), tipo: 'base' },
  ]);

  // limpa seletores cinza que porventura existam no carregamento do form
  _R.useEffect(() => {
    try { pinService.hideSelectorsNow?.(); } catch {}
  }, []);

  function updatePoint(index: number, newValue?: PointResult) {
    if (!newValue || !newValue.coordinates?.length) return;

    setPontos((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        ...newValue,
        label: normalizeLabel(newValue),
      };

      // aplica ícone correto instantaneamente
      const id   = `point-${next[index].uid}`;
      const kind = next[index].tipo === 'base' ? 'base' : 'poi';
      restylePin(pinHook, id, kind);

      return next;
    });
  }

  function updateTipo(index: number, tipo: 'base' | 'interesse') {
    setPontos((prev) => {
      const next = [...prev];
      next[index].tipo = tipo;
      if (tipo === 'interesse') next[index].tempo = next[index].tempo ?? 60;
      if (tipo === 'base') delete next[index].tempo;

      // ORIGEM e DESTINO sempre base → se usuário mudar, voltamos p/ base
      if (index === 0 || index === next.length - 1) {
        next[index].tipo = 'base';
        delete next[index].tempo;
      }

      const id = `point-${next[index].uid}`;
      restylePin(pinHook, id, next[index].tipo === 'base' ? 'base' : 'poi');

      return next;
    });
  }

  function updateTempo(index: number, t: number) {
    setPontos((prev) => {
      const next = [...prev];
      if (next[index].tipo === 'interesse') next[index].tempo = Math.max(5, t);
      return next;
    });
  }

  function addPonto() {
    setPontos((prev) => {
      const next = [...prev];
      // insere antes do DESTINO
      next.splice(next.length - 1, 0, { uid: generateUid(), tipo: 'interesse', tempo: 60 });
      return next;
    });
  }

  function removePonto(index: number) {
    setPontos((prev) => {
      if (prev.length <= 3) return prev; // mantém origem e destino + 1 parada mínima
      if (index === 0 || index === prev.length - 1) return prev; // não remove origem/destino
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleSubmit(e: any) {
    e.preventDefault();
    onSubmit({ dataIda, dataVolta, interesses, tempo, pontos });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <input
        type="date"
        value={dataIda}
        onChange={(e) => setDataIda(e.target.value)}
        className="border p-2 rounded"
        required
      />
      <input
        type="date"
        value={dataVolta}
        onChange={(e) => setDataVolta(e.target.value)}
        className="border p-2 rounded"
        required
      />
      <textarea
        placeholder="Interesses (ex: natureza, cultura, gastronomia)"
        value={interesses}
        onChange={(e) => setInteresses(e.target.value)}
        className="border p-2 rounded"
      />
      <input
        type="number"
        value={tempo}
        onChange={(e) => setTempo(Number(e.target.value))}
        className="border p-2 rounded"
        min={1}
        placeholder="Tempo estimado (dias)"
      />

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
                      ? {
                          id: ponto.uid,
                          name: ponto.name,
                          city: ponto.city,
                          uf: ponto.uf,
                          coordinates: ponto.coordinates,
                        }
                      : undefined
                  }
                  onSelectValue={(val: any) =>
                    updatePoint(index, {
                      uid: ponto.uid,
                      id: val?.id,
                      name: val?.name,
                      city: val?.city,
                      uf: val?.uf,
                      coordinates: val?.coordinates,
                      tipo: ponto.tipo,
                      tempo: ponto.tempo,
                    })
                  }
                  onUnselectValue={() => removePonto(index)}
                />

                {/* Remover apenas paradas intermediárias */}
                {pontos.length > 3 && index > 0 && index < pontos.length - 1 && (
                  <button
                    type="button"
                    onClick={() => removePonto(index)}
                    className="text-red-500 text-sm hover:underline"
                  >
                    Remover
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={ponto.tipo}
                  onChange={(e) => updateTipo(index, e.target.value as 'base' | 'interesse')}
                  className="text-sm border p-1 rounded"
                >
                  <option value="base">Ponto Base</option>
                  <option value="interesse">Ponto de Interesse</option>
                </select>

                {ponto.tipo === 'interesse' && (
                  <input
                    type="number"
                    value={ponto.tempo ?? 60}
                    onChange={(e) => updateTempo(index, Number(e.target.value))}
                    className="text-sm border p-1 rounded w-20"
                    min={5}
                    step={5}
                    placeholder="Tempo (min)"
                    title="Tempo de permanência no local"
                  />
                )}
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={addPonto}
          className="bg-gray-200 text-sm rounded p-1 mt-1 w-fit"
        >
          + Adicionar parada
        </button>
      </div>

      <button type="submit" className="bg-blue-500 text-white rounded p-2 mt-4">
        Gerar Roteiro
      </button>
    </form>
  );
}

export default RoteiroForm;
