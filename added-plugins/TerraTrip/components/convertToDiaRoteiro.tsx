import { BoardColumn } from './generateInitialBoard';
import { PontoRoteiro } from './types';

export interface DiaRoteiro {
  data: string;
  pontos: PontoRoteiro[];
}

/**
 * Converte a estrutura do board (quadro) para o formato final de roteiro por dia,
 * restaurando os dados completos dos pontos a partir da lista original.
 */
export function convertToDiaRoteiro(
  board: BoardColumn[],
  pontosOriginais: PontoRoteiro[]
): DiaRoteiro[] {
  return board.map((col) => {
    const pontos: PontoRoteiro[] = col.items.map((item) => {
      const original = pontosOriginais[item.pointIndex];

      return {
        id: item.id,
        label: item.label,
        tipo: item.type,
        tempo: item.time,
        fixo: item.fixo,
        coordinates: original?.coordinates ?? [0, 0],
      };
    });

    return {
      data: col.label,
      pontos,
    };
  });
}
