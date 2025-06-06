import { PontoRoteiro, TipoPonto, Roteiro } from './types';
import { groupPointsByBase } from './groupPointsByBase';

export interface BoardItem {
  id: string;
  pointIndex: number;
  label: string;
  time: number;
  type: TipoPonto;
  fixo?: boolean;
}

export interface BoardColumn {
  id: string;
  label: string;
  data: string; // ISO date string
  items: BoardItem[];
}

function sincronizarBasesEntreDias(board: BoardColumn[]): BoardColumn[] {
  const novoBoard = board.map((col) => ({ ...col, items: [...col.items] }));

  for (let i = 0; i < novoBoard.length - 1; i++) {
    const diaAtual = novoBoard[i];
    const diaSeguinte = novoBoard[i + 1];

    const ultimaBase = [...diaAtual.items].reverse().find((item) => item.type === 'base');
    if (!ultimaBase) continue;

    const primeiro = diaSeguinte.items[0];
    if (primeiro?.fixo && primeiro.pointIndex === ultimaBase.pointIndex) continue;
    if (primeiro?.fixo) diaSeguinte.items.shift();

    diaSeguinte.items.unshift({
      ...ultimaBase,
      fixo: true,
      id: `${ultimaBase.id}-replica-dia${i + 1}`,
    });
  }

  return novoBoard;
}

function calcularDistancia(p1: number[], p2: number[]): number {
  const [lat1, lon1] = p1;
  const [lat2, lon2] = p2;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function generateInitialBoard(roteiro: Roteiro): Promise<BoardColumn[]> {
  const { dataIda, dataVolta, pontos } = roteiro;
  const startDate = new Date(dataIda);
  const endDate = new Date(dataVolta);

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const board: BoardColumn[] = [];

  for (let day = 0; day < totalDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    board.push({
      id: `day-${day}`,
      label: currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
      }),
      data: currentDate.toISOString().split('T')[0],
      items: [],
    });
  }

  const pontosBase = pontos.filter((p) => p.tipo === 'base');
  const pontosInteresse = pontos.filter((p) => p.tipo === 'interesse');

  let agrupados;
  try {
    agrupados = await groupPointsByBase(pontosBase, pontosInteresse);
    const totalAlocados = Object.values(agrupados).reduce((acc, grupo) => acc + grupo.pontos.length, 0);
    if (totalAlocados === 0) throw new Error('Fallback');
  } catch (e) {
    console.warn('Agrupamento falhou, aplicando fallback por precedência...', e);
    agrupados = {};
    pontosBase.forEach((base, i) => {
      agrupados[i] = { base, pontos: [] };
    });
    pontosInteresse.forEach((p, i) => {
      agrupados[i % pontosBase.length].pontos.push(p);
    });
  }

  let diaAtual = 0;
  const diasPorBase = Math.ceil(totalDays / Object.keys(agrupados).length);

  for (const key of Object.keys(agrupados)) {
    const { base, pontos: pontosGrupo } = agrupados[parseInt(key)];
    const baseIndex = roteiro.pontos.indexOf(base);

    const ordenados = [...pontosGrupo].sort((a, b) => {
      const dA = calcularDistancia(base.coordinates, a.coordinates);
      const dB = calcularDistancia(base.coordinates, b.coordinates);
      return dA - dB;
    });

    const chunkSize = Math.ceil(ordenados.length / diasPorBase);

    for (let i = 0; i < ordenados.length; i += chunkSize) {
      const pontosDoDia = ordenados.slice(i, i + chunkSize);
      const col = board[diaAtual];
      if (!col) break;

      if (diaAtual === 0) {
        col.items.unshift({
          id: `base-origem-fixa`,
          pointIndex: baseIndex,
          label: base.label,
          time: 0,
          type: 'base',
          fixo: true,
        });
      } else {
        col.items.push({
          id: `base-${diaAtual}-start`,
          pointIndex: baseIndex,
          label: base.label,
          time: 0,
          type: 'base',
        });
      }

      for (const ponto of pontosDoDia) {
        col.items.push({
          id: `ponto-${ponto.id ?? roteiro.pontos.indexOf(ponto)}`,
          pointIndex: roteiro.pontos.indexOf(ponto),
          label: ponto.label,
          time: ponto.tempo ?? 120,
          type: 'interesse',
        });
      }

      col.items.push({
        id: `base-${diaAtual}-end`,
        pointIndex: baseIndex,
        label: base.label,
        time: 0,
        type: 'base',
      });

      diaAtual++;
      if (diaAtual >= totalDays) break;
    }
  }

  return sincronizarBasesEntreDias(board);
}
