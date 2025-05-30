// components/convertToDiaRoteiro.tsx

import { BoardColumn } from './generateInitialBoard';

export interface PontoRoteiro {
  id: string;
  nome: string;
  tipo: 'base' | 'interesse';
  tempo?: number;
}

export interface DiaRoteiro {
  data: string;
  pontos: PontoRoteiro[];
}

export function convertToDiaRoteiro(board: BoardColumn[]): DiaRoteiro[] {
  return board.map((col) => ({
    data: col.label,
    pontos: col.items.map((item) => ({
      id: item.id,
      nome: item.label, // CORRIGIDO
      tipo: item.type,  // CORRIGIDO
      tempo: item.time,
    })),
  }));
}
