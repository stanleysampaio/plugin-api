import { PontoRoteiro, TipoPonto, Roteiro } from './types';

export interface BoardItem {
  id: string;
  pointIndex: number;
  label: string;
  time: number; // tempo de consumo em minutos
  type: TipoPonto;
}

export interface BoardColumn {
  id: string;
  label: string;
  items: BoardItem[];
}

export function generateInitialBoard(roteiro: Roteiro): BoardColumn[] {
  const { dataIda, dataVolta, pontos } = roteiro;
  const startDate = new Date(dataIda);
  const endDate = new Date(dataVolta);

  const totalDays =
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const board: BoardColumn[] = [];

  for (let day = 0; day < totalDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);
    const label = currentDate.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
    });

    board.push({
      id: `day-${day}`,
      label,
      items: [],
    });
  }

  const pontosBase = pontos.filter((p) => p.tipo === 'base');
  const pontosInteresse = pontos.filter((p) => p.tipo === 'interesse');

  // Colocar ponto base no início do primeiro dia
  if (pontosBase.length > 0) {
    board[0].items.push({
      id: `point-base-start`,
      pointIndex: pontos.indexOf(pontosBase[0]),
      label: pontosBase[0].label,
      time: 0,
      type: 'base',
    });
  }

  // Distribuir pontos de interesse na ordem de criação (sem embaralhar)
  pontosInteresse.forEach((point, index) => {
    const dayIndex = Math.floor(index / Math.ceil(pontosInteresse.length / totalDays));

    board[dayIndex].items.push({
      id: `point-${index}`,
      pointIndex: pontos.indexOf(point),
      label: point.label,
      time: point.tempo ?? 120,
      type: 'interesse',
    });
  });

  // Colocar ponto base no fim do último dia
  if (pontosBase.length > 1) {
    board[board.length - 1].items.push({
      id: `point-base-end`,
      pointIndex: pontos.indexOf(pontosBase[pontosBase.length - 1]),
      label: pontosBase[pontosBase.length - 1].label,
      time: 0,
      type: 'base',
    });
  }

  return board;
}
