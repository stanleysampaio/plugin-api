const { React } = window.PluginDependencies;

interface DiaRoteiro {
  data: string;
  pontos: PontoRoteiro[];
}

interface PontoRoteiro {
  id: string;
  nome: string;
  tipo: 'base' | 'interesse';
  tempo?: number;
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
    setDragItem({ ponto, origem });
  }

  function handleDrop(diaIndex: number) {
    if (!dragItem) return;

    const updatedRoteiro = [...roteiro];

    if (dragItem.origem) {
      // Remover do dia original
      const origemPontos = [...updatedRoteiro[dragItem.origem.diaIndex].pontos];
      origemPontos.splice(dragItem.origem.pontoIndex, 1);
      updatedRoteiro[dragItem.origem.diaIndex].pontos = origemPontos;
    } else {
      // Remover da lista de disponíveis
      const novos = pontosDisponiveis.filter((p) => p.id !== dragItem.ponto.id);
      onUpdateDisponiveis?.(novos);
    }

    updatedRoteiro[diaIndex].pontos.push(dragItem.ponto);
    onUpdateRoteiro(updatedRoteiro);
    setDragItem(null);
  }

  return (
    <div className="flex gap-4 overflow-x-auto mt-6">
      <div className="min-w-[200px]">
        <h4 className="font-bold mb-2">Pontos Disponíveis</h4>
        {pontosDisponiveis.length === 0 && (
          <div className="text-xs italic text-gray-400">Todos os pontos estão alocados</div>
        )}
        {pontosDisponiveis.map((ponto) => (
          <div
            key={ponto.id}
            className="p-2 border rounded mb-2 bg-white cursor-move text-sm"
            draggable
            onDragStart={() => handleDragStart(ponto)}
          >
            {ponto.nome}
          </div>
        ))}
      </div>

      {roteiro.map((dia, diaIndex) => (
        <div key={dia.data} className="min-w-[200px] bg-gray-100 p-2 rounded">
          <h4 className="text-sm font-bold text-center mb-2">{dia.data}</h4>

          {dia.pontos.map((ponto, pontoIndex) => (
            <div
              key={ponto.id}
              className={`p-2 border rounded mb-2 text-sm cursor-move ${
                ponto.tipo === 'base' ? 'bg-yellow-100' : 'bg-blue-100'
              }`}
              draggable
              onDragStart={() => handleDragStart(ponto, { diaIndex, pontoIndex })}
            >
              <strong>{ponto.nome}</strong>
              {ponto.tipo === 'interesse' && ponto.tempo && (
                <div className="text-xs text-gray-600">{ponto.tempo} min</div>
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
