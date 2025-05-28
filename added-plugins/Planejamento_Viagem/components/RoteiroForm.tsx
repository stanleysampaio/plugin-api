const PluginMapInput = window.PluginDependencies.PluginMapInput;

interface PointResult {
  label?: string;
  name?: string;
  city?: string;
  uf?: string;
  coordinates: number[];
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

export function RoteiroForm({ onSubmit }: Props) {
  const [dataIda, setDataIda] = React.useState('');
  const [dataVolta, setDataVolta] = React.useState('');
  const [interesses, setInteresses] = React.useState('');
  const [tempo, setTempo] = React.useState(1);
  const [pontos, setPontos] = React.useState<PointResult[]>([
    { label: '', coordinates: [] },
    { label: '', coordinates: [] },
  ]);

  function updatePoint(index: number, newValue?: PointResult) {
    if (!newValue || !newValue.coordinates?.length) return;

    const updated = [...pontos];

    const label =
      newValue.label ||
      [
        newValue.name,
        newValue.city,
        newValue.uf,
      ]
        .filter(Boolean)
        .join(', ') ||
      `${newValue.coordinates[1].toFixed(6)}, ${newValue.coordinates[0].toFixed(6)}`;

    updated[index] = { ...newValue, label };
    setPontos(updated);
  }

  function addPonto() {
    setPontos((prev) => {
      const updated = [...prev];
      updated.splice(updated.length - 1, 0, { label: '', coordinates: [] }); // inserir antes do destino
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
            <div key={index} className="flex flex-col gap-1 w-full">
              <span className="text-xs font-semibold text-gray-600">{label}</span>
              <div className="flex items-center gap-2">
                <PluginMapInput
                  id={`point-${index}`}
                  selectedValue={ponto}
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
