export async function generateInitialBoard(roteiro: Roteiro): Promise<BoardColumn[]> {
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

  let agrupados;
  try {
    agrupados = await groupPointsByBase(pontosBase, pontosInteresse);
    const totalAlocados = Object.values(agrupados).reduce(
      (acc, grupo) => acc + grupo.pontos.length,
      0
    );

    if (totalAlocados === 0) throw new Error('Fallback para precedência');
  } catch (e) {
    console.warn('Agrupamento falhou, aplicando fallback por precedência...', e);

    const chunkSize = Math.ceil(pontosInteresse.length / totalDays);
    let interesseIndex = 0;

    for (let i = 0; i < totalDays; i++) {
      const dia = board[i];
      const base = pontosBase[i % pontosBase.length];
      const baseIndex = pontos.indexOf(base);

      dia.items.push({
        id: `base-${i}-start`,
        pointIndex: baseIndex,
        label: base.label,
        time: 0,
        type: 'base',
      });

      for (let j = 0; j < chunkSize && interesseIndex < pontosInteresse.length; j++) {
        const ponto = pontosInteresse[interesseIndex];
        const pontoIndex = pontos.indexOf(ponto);

        dia.items.push({
          id: `ponto-${pontoIndex}`,
          pointIndex: pontoIndex,
          label: ponto.label,
          time: ponto.tempo ?? 120,
          type: 'interesse',
        });

        interesseIndex++;
      }

      dia.items.push({
        id: `base-${i}-end`,
        pointIndex: baseIndex,
        label: base.label,
        time: 0,
        type: 'base',
      });

      // ✅ Garante que o ponto base apareça fixamente no início do próximo dia
      if (i + 1 < totalDays) {
        board[i + 1].items.unshift({
          id: `base-replica-dia${i + 1}`,
          pointIndex: baseIndex,
          label: base.label,
          time: 0,
          type: 'base',
          fixo: true,
        });
      }
    }

    return board;
  }

  // Agrupamento por base
  let diaAtual = 0;
  const diasPorBase = Math.ceil(totalDays / Object.keys(agrupados).length);

  for (const key of Object.keys(agrupados)) {
    const { base, pontos: pontosDoGrupo } = agrupados[parseInt(key)];
    const baseIndex = roteiro.pontos.indexOf(base);
    const chunkSize = Math.ceil(pontosDoGrupo.length / diasPorBase);

    for (let i = 0; i < pontosDoGrupo.length; i += chunkSize) {
      const pontosDoDia = pontosDoGrupo.slice(i, i + chunkSize);
      const col = board[diaAtual];
      if (!col) break;

      col.items.push({
        id: `base-${diaAtual}-start`,
        pointIndex: baseIndex,
        label: base.label,
        time: 0,
        type: 'base',
      });

      for (const ponto of pontosDoDia) {
        col.items.push({
          id: `ponto-${ponto.id}`,
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

      if (diaAtual + 1 < totalDays) {
        board[diaAtual + 1].items.unshift({
          id: `base-replica-dia${diaAtual + 1}`,
          pointIndex: baseIndex,
          label: base.label,
          time: 0,
          type: 'base',
          fixo: true,
        });
      }

      diaAtual++;
      if (diaAtual >= totalDays) break;
    }
  }

  return board;
}
