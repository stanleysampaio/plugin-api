const PluginMapInput = window.PluginDependencies.PluginMapInput;

interface PointResult {
  uid: string;
  label?: string;
  name?: string;
  city?: string;
  uf?: string;
  coordinates?: number[];
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

interface Props {
  onSubmit: (roteiro: Roteiro) => void;
}

function generateUid() {
  return Math.random().toString(36).substring(2, 9);
}

export function RoteiroForm({ onSubmit }: Props) {
  const [dataIda, setDataIda] = React.useState('');
  const [dataVolta, setDataVolta] = React.useState('');
  const [interesses, setInteresses] = React.useState('');
  const [tempo, setTempo] = React.useState(1);
  const [pontos, setPontos] = React.useState<PointResult[]>([
    { uid: generateUid(), tipo: 'base' },
    { uid: generateUid(), tipo: 'interesse', tempo: 60 },
  ]);

  function updatePoint(index: number, newValue?: PointResult) {
    if (!newValue || !newValue.coordinates?.length) return;

    const updated = [...pontos];

    const label =
      newValue.label ||
      [newValue.name, newValue.city, newValue.uf].filter(Boolean).join(', ') ||
      `${newValue.coordinates[1].toFixed(6)}, ${newValue.coordinates[0].toFixed(6)}`;

    updated[index] = {
      ...updated[index],
      ...newValue,
      label,
    };

    setPontos(updated);
  }

  function updateTipo(index: number, tipo: 'base' | 'interesse') {
    const updated = [...pontos];
    updated[index].tipo = tipo;

    if (tipo === 'interesse' && !updated[index].tempo) {
      updated[index].tempo = 60;
    }
    if (tipo === 'base') {
      delete updated[index].tempo;
    }

    setPontos(updated);
  }

  function updateTempo(index: number, tempo: number) {
    const updated = [...pontos];
    updated[index].tempo = tempo;
    setPontos(updated);
  }

  function addPonto() {
    setPontos((prev) => {
      const updated = [...prev];
      updated.splice(updated.length - 1, 0, {
        uid: generateUid(),
        tipo: 'interesse',
        tempo: 60,
      });
      return updated;
    });
  }

  function removePonto(index: number) {
    if (pontos.length <= 2) return;
    setPontos(pontos.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
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
          let label = `Parada ${index}`;
          if (index === 0) label = 'Origem';
          else if (index === pontos.length - 1) label = 'Destino';

          return (
            <div key={ponto.uid} className="flex flex-col gap-1 w-full border p-2 rounded">
              <span className="text-xs font-semibold text-gray-600">{label}</span>

              <div className="flex items-center gap-2">
                <PluginMapInput
                  id={`point-${ponto.uid}`}
                  selectedValue={
                    ponto.coordinates?.length ? ponto : undefined
                  }
                  onSelectValue={(val: PointResult) => updatePoint(index, val)}
                  onUnselectValue={() => removePonto(index)}
                />
                {pontos.length > 2 && index !== 0 && index !== pontos.length - 1 && (
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
