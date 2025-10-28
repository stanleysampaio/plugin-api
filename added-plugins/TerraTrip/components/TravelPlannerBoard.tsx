const { React } = window.PluginDependencies;

interface DiaRoteiro {
  data: string;
  pontos: PontoRoteiro[];
}

interface PontoRoteiro {
  id: string;
  label: string;
  tipo: 'base' | 'interesse';
  tempo?: number;
  fixo?: boolean;
  coordinates: [number, number];
}

interface TravelPlannerBoardProps {
  roteiro: DiaRoteiro[];
  pontosDisponiveis: PontoRoteiro[];
  onUpdateRoteiro: (novoRoteiro: DiaRoteiro[]) => void;
  onUpdateDisponiveis?: (novosDisponiveis: PontoRoteiro[]) => void;
}

export function TravelPlannerBoard({
  roteiro,
  pontosDisponiveis,
  onUpdateRoteiro,
  onUpdateDisponiveis,
}: TravelPlannerBoardProps) {
  const [dragItem, setDragItem] = React.useState<{
    ponto: PontoRoteiro;
    origem?: { diaIndex: number; pontoIndex: number };
  } | null>(null);

  function handleDragStart(ponto: PontoRoteiro, origem?: { diaIndex: number; pontoIndex: number }) {
    if (ponto.fixo) return;
    setDragItem({ ponto, origem });
  }

  function handleDrop(diaIndex: number, insertIndex?: number) {
    if (!dragItem) return;

    const updatedRoteiro = [...roteiro.map(d => ({ ...d, pontos: [...d.pontos] }))];

    if (dragItem.origem) {
      const origemDia = updatedRoteiro[dragItem.origem.diaIndex];
      if (!origemDia.pontos[dragItem.origem.pontoIndex]?.fixo) {
        origemDia.pontos.splice(dragItem.origem.pontoIndex, 1);
      }
    }

    const destinoDia = updatedRoteiro[diaIndex];

    if (destinoDia.pontos.find(p => p.id === dragItem.ponto.id)) return;

    const ultimaPos = destinoDia.pontos.findLastIndex(p => p.tipo === 'base');
    let indexInsercao = insertIndex ?? ultimaPos;

    // Se for ponto de interesse e houver base no fim, insere antes da última base
    if (
      dragItem.ponto.tipo === 'interesse' &&
      ultimaPos >= 0 &&
      ultimaPos === destinoDia.pontos.length - 1
    ) {
      indexInsercao = ultimaPos;
    } else if (insertIndex === undefined) {
      indexInsercao = destinoDia.pontos.length;
    }

    destinoDia.pontos.splice(indexInsercao, 0, dragItem.ponto);

    onUpdateRoteiro(sincronizarBasesEntreDias(updatedRoteiro));
    setDragItem(null);
  }

  function handleRemove(diaIndex: number, pontoIndex: number) {
    const ponto = roteiro[diaIndex].pontos[pontoIndex];
    if (ponto.fixo) return;

    const updatedRoteiro = [...roteiro.map(d => ({ ...d, pontos: [...d.pontos] }))];
    updatedRoteiro[diaIndex].pontos.splice(pontoIndex, 1);

    if (ponto.tipo === 'interesse') {
      onUpdateDisponiveis?.([...pontosDisponiveis, ponto]);
    }

    onUpdateRoteiro(sincronizarBasesEntreDias(updatedRoteiro));
  }

  function sincronizarBasesEntreDias(roteiro: DiaRoteiro[]): DiaRoteiro[] {
    const novoRoteiro = roteiro.map((dia) => ({
      ...dia,
      pontos: [...dia.pontos],
    }));

    for (let i = 0; i < novoRoteiro.length - 1; i++) {
      const diaAtual = novoRoteiro[i];
      const diaSeguinte = novoRoteiro[i + 1];

      const ultimaBase = [...diaAtual.pontos].reverse().find(p => p.tipo === 'base');
      if (!ultimaBase) continue;

      const primeiro = diaSeguinte.pontos[0];

      if (primeiro?.fixo && primeiro.id === `${ultimaBase.id}-replica-dia${i + 1}`) continue;
      if (primeiro?.fixo) diaSeguinte.pontos.shift();

      diaSeguinte.pontos.unshift({
        ...ultimaBase,
        fixo: true,
        id: `${ultimaBase.id}-replica-dia${i + 1}`,
      });
    }

    return novoRoteiro;
  }

  return (
    <div className="flex gap-4 overflow-x-auto mt-6">
      <div className="min-w-[200px]">
        <h4 className="font-bold mb-2">Bases Disponíveis</h4>
        {pontosDisponiveis.length === 0 && (
          <div className="text-xs italic text-gray-400">Nenhuma base disponível</div>
        )}
        {pontosDisponiveis
          .filter(p => p.tipo === 'base')
          .map((ponto) => (
            <div
              key={ponto.id}
              className="p-2 border rounded mb-2 bg-white cursor-move text-sm"
              draggable
              onDragStart={() => handleDragStart(ponto)}
            >
              {ponto.label}
            </div>
          ))}
      </div>

      {roteiro.map((dia, diaIndex) => (
        <div key={dia.data} className="min-w-[200px] bg-gray-100 p-2 rounded">
          <h4 className="text-sm font-bold text-center mb-2">{dia.data}</h4>

          {dia.pontos.map((ponto, pontoIndex) => (
            <div
              key={ponto.id}
              className={`relative p-2 border rounded mb-2 text-sm ${
                ponto.fixo
                  ? 'bg-gray-300 cursor-not-allowed'
                  : ponto.tipo === 'base'
                  ? 'bg-yellow-100 cursor-move'
                  : 'bg-blue-100 cursor-move'
              }`}
              draggable={!ponto.fixo}
              onDragStart={() =>
                !ponto.fixo && handleDragStart(ponto, { diaIndex, pontoIndex })
              }
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(diaIndex, pontoIndex)}
              title={ponto.fixo ? 'Ponto fixo de base (não editável)' : ''}
            >
              <strong>{ponto.label}</strong>
              {ponto.tipo === 'interesse' && ponto.tempo && (
                <div className="text-xs text-gray-600">{ponto.tempo} min</div>
              )}
              {!ponto.fixo && (
                <button
                  onClick={() => handleRemove(diaIndex, pontoIndex)}
                  className="absolute top-1 right-1 text-xs text-red-500"
                  title="Remover ponto"
                >
                  ✕
                </button>
              )}
            </div>
          ))}

          <div
            className="h-10 mt-2 border-2 border-dashed border-gray-300 rounded flex items-center justify-center text-xs text-gray-500"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(diaIndex)}
          >
            Soltar aqui
          </div>
        </div>
      ))}
    </div>
  );
}
