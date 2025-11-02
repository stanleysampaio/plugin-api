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
  pontosOriginais: any[]
): DiaRoteiro[] {
  return board.map((col) => {
    const pontos: PontoRoteiro[] = col.items.map((item) => {
      const original = pontosOriginais[item.pointIndex] || {};
      const mapId =
        typeof original?.uid === 'string' ? `point-${original.uid}` :
        (typeof original?.id === 'string' && original.id.startsWith('point-'))
          ? original.id
          : item.id;

      return {
        id: mapId,                          // <- usa SEMPRE o id do MapInput
        uid: original?.uid,
        label: original?.label ?? item.label,
        tipo: item.type,
        tempo: item.time,
        fixo: item.fixo,
        coordinates: original?.coordinates ?? [0, 0],
      } as any;
    });

    return {
      data: col.data,                       // <- ISO do dia (não o label)
      pontos,
    };
  });
}