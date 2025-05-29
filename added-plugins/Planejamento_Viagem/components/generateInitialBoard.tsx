// components/generateInitialBoard.tsx

import { Roteiro, TipoPonto } from './types';

export interface BoardItem {
  id: string;
  pointIndex: number;
  label: string;
  time: number;
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
    const label = currentDate.toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
    });

    board.push({
      id: `day-${day}`,
      label,
      items: [],
    });
  }

  pontos.forEach((point, index) => {
    const type = point.tipo;
    const baseItem: BoardItem = {
      id: `point-${index}`,
      pointIndex: index,
      label: point.label || `Ponto ${index + 1}`,
      time: point.tempo ?? 0,
      type,
    };

    if (type === "base") {
      if (board[0]) board[0].items.unshift(baseItem);
      if (board.length > 1) {
        board[board.length - 1].items.push({
          ...baseItem,
          id: `point-${index}-end`,
        });
      }
    }

    if (type === "interesse") {
      const dayIndex = index % totalDays;
      board[dayIndex].items.push(baseItem);
    }
  });

  return board;
}
