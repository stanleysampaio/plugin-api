// components/generateInitialBoard.tsx

import {
  PontoRoteiro,
  TipoPonto,
  Roteiro,
  BoardItem,
  BoardColumn,
} from './types';
import { groupPointsByBase } from './groupPointsByBase';

/* ---------------- utils de data ---------------- */
function toDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}
function datesInclusive(a: string, b: string): string[] {
  const start = toDate(a);
  const end = toDate(b);
  const out: string[] = [];
  const cur = new Date(start.getTime());
  while (cur <= end) {
    out.push(fmt(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/* --------------- distância (lon,lat) --------------- */
function haversineMeters(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return R * c;
}

/* --------------- ordena POIs por vizinho + próximo a partir da base --------------- */
function orderByNearestFromBase(base: PontoRoteiro, pts: PontoRoteiro[]) {
  const remaining = pts.slice();
  const route: PontoRoteiro[] = [];
  let cur = base.coordinates;
  while (remaining.length) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(cur, remaining[i].coordinates);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const next = remaining.splice(best, 1)[0];
    route.push(next);
    cur = next.coordinates;
  }
  return route;
}

/* --------------- capacidade diária e utilidades --------------- */
const DAY_CAP_MIN = 600;              // 08:30–18:30 efetivos
const DEFAULT_POI_MIN = 120;          // se não houver tempo informado
const dur = (p?: PontoRoteiro) =>
  Math.max(30, (p as any)?.tempo ?? DEFAULT_POI_MIN);

/** Empacota POIs sequenciais respeitando a capacidade por dia */
function packIntoDays(ordered: PontoRoteiro[], numDays: number): PontoRoteiro[][] {
  const days = Math.max(1, numDays);
  const buckets: PontoRoteiro[][] = Array.from({ length: days }, () => []);
  const used: number[] = Array.from({ length: days }, () => 0);
  let d = 0;
  for (const poi of ordered) {
    const m = dur(poi);
    if (used[d] + m <= DAY_CAP_MIN) {
      buckets[d].push(poi);
      used[d] += m;
    } else {
      d = Math.min(d + 1, days - 1);
      buckets[d].push(poi);
      used[d] += m;
    }
  }
  return buckets;
}

/** Necessidade mínima de dias por base (ceil(totalMin/600), no mínimo 1 se houver POI) */
function neededDaysForBase(pois: PontoRoteiro[]) {
  if (!pois?.length) return 1;
  const total = pois.reduce((acc, p) => acc + dur(p), 0);
  return Math.max(1, Math.ceil(total / DAY_CAP_MIN));
}

/** Distribui totalDays entre as bases seguindo a necessidade e garantindo 1º/último dia */
function allocateDaysPerBase(baseCount: number, need: number[], totalDays: number) {
  let alloc = need.map(n => Math.max(1, n));
  let sum = alloc.reduce((a, b) => a + b, 0);

  // reduzir se excedeu
  if (sum > totalDays) {
    const protectedIdx = new Set<number>([0, baseCount - 1]);
    while (sum > totalDays) {
      let idx = -1;
      let best = -1;
      for (let i = 0; i < alloc.length; i++) {
        if (!protectedIdx.has(i) && alloc[i] > 1 && alloc[i] > best) {
          best = alloc[i];
          idx = i;
        }
      }
      if (idx === -1) break;
      alloc[idx] -= 1;
      sum -= 1;
    }
  }

  // distribuir se faltou
  if (sum < totalDays) {
    const pairs = need.map((n, i) => ({ i, n })).sort((a, b) => b.n - a.n);
    let left = totalDays - sum;
    let p = 0;
    while (left > 0 && pairs.length) {
      alloc[pairs[p].i] += 1;
      left -= 1;
      p = (p + 1) % pairs.length;
    }
  }

  // garante 1º e último (se existirem)
  if (baseCount >= 1) alloc[0] = Math.max(1, alloc[0]);
  if (baseCount >= 2) alloc[baseCount - 1] = Math.max(1, alloc[baseCount - 1]);

  return alloc;
}

/** Gera rótulo "qui, 27/10" no padrão que você já usava */
function headLabel(iso: string) {
  const d = toDate(iso);
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  });
}

/* ---------------- sincroniza base fim -> base início do dia seguinte ---------------- */
function sincronizarBasesEntreDias(board: BoardColumn[]): BoardColumn[] {
  const novoBoard = board.map((col) => ({ ...col, items: [...col.items] }));

  for (let i = 0; i < novoBoard.length - 1; i++) {
    const diaAtual = novoBoard[i];
    const diaSeguinte = novoBoard[i + 1];

    const ultimaBase = [...diaAtual.items].reverse().find((it) => it.type === 'base');
    if (!ultimaBase) continue;

    const primeiro = diaSeguinte.items[0];
    if (primeiro?.fixo && primeiro.pointIndex === ultimaBase.pointIndex) continue;
    if (primeiro?.fixo) diaSeguinte.items.shift();

    diaSeguinte.items.unshift({
      ...ultimaBase,
      fixo: true,
      id: `${ultimaBase.id}-replica-dia${i + 1}`,
      time: 0,
    });
  }
  return novoBoard;
}

/* ---------------- função principal ---------------- */
export async function generateInitialBoard(roteiro: Roteiro): Promise<BoardColumn[]> {
  const { dataIda, dataVolta, pontos } = roteiro;

  const dates = datesInclusive(dataIda, dataVolta);
  const totalDays = Math.max(1, dates.length);

  // cria colunas (dias) vazias
  const board: BoardColumn[] = dates.map((iso, i) => ({
    id: `day-${i}`,
    label: headLabel(iso),
    data: iso,
    items: [],
  }));

  // separa bases (na ORDEM que chegaram!) e POIs
  const bases = pontos.filter((p) => p.tipo === 'base');
  const poisAll = pontos.filter((p) => p.tipo === 'interesse');

  // mapeador estável para pointIndex
  const pointIndexOf = (pt: PontoRoteiro) => {
    const idx = pontos.indexOf(pt);
    if (idx >= 0) return idx;
    // fallback: por label + coords
    return Math.max(
      0,
      pontos.findIndex(
        (q) =>
          q.label === pt.label &&
          q.coordinates?.[0] === pt.coordinates?.[0] &&
          q.coordinates?.[1] === pt.coordinates?.[1]
      )
    );
  };

  // agrupamento por base (via rotas) + fallback
  let agrupado: Record<number, { base: PontoRoteiro; pontos: PontoRoteiro[] }>;
  try {
    const out = await groupPointsByBase(bases, poisAll);
    const totalAlocados = Object.values(out).reduce(
      (acc, g) => acc + (g?.pontos?.length ?? 0),
      0
    );
    if (!out || totalAlocados === 0) throw new Error('fallback');
    agrupado = out as any;
  } catch {
    agrupado = {};
    bases.forEach((b, i) => (agrupado[i] = { base: b, pontos: [] }));
    poisAll.forEach((p, i) =>
      agrupado[i % Math.max(1, bases.length)].pontos.push(p)
    );
  }

  if (bases.length === 0) {
    // sem bases: coloca tudo no último dia como POI e retorna
    const last = board[board.length - 1];
    let gid = 0;
    for (const p of poisAll) {
      last.items.push({
        id: `poi-${gid++}`,
        pointIndex: pointIndexOf(p),
        label: p.label,
        time: dur(p),
        type: 'interesse',
      });
    }
    return board;
  }

  // necessidade de dias por base e alocação para caber no calendário
  const need = bases.map((_, bi) =>
    neededDaysForBase(agrupado[bi]?.pontos ?? [])
  );
  const alloc = allocateDaysPerBase(bases.length, need, totalDays);

  // índice da base de cada dia (sequência contígua por base)
  const dayBaseIndex: number[] = [];
  for (let bi = 0; bi < bases.length; bi++) {
    for (let k = 0; k < alloc[bi]; k++) dayBaseIndex.push(bi);
  }
  while (dayBaseIndex.length < totalDays) dayBaseIndex.push(bases.length - 1);
  if (dayBaseIndex.length > totalDays) dayBaseIndex.length = totalDays;

  // força 1º dia = primeira base, último dia = última base
  dayBaseIndex[0] = 0;
  dayBaseIndex[totalDays - 1] = bases.length - 1;

  // para cada base, ordena POIs (vizinho + próximo) e empacota nos dias dessa base
  const dayIdxByBase: number[][] = bases.map(() => []);
  dayBaseIndex.forEach((bi, di) => dayIdxByBase[bi].push(di));

  const bucketsPerDay: PontoRoteiro[][] = Array.from(
    { length: totalDays },
    () => []
  );

  for (let bi = 0; bi < bases.length; bi++) {
    const base = bases[bi];
    const myDayIdx = dayIdxByBase[bi];
    if (!myDayIdx.length) continue;

    const ordered = orderByNearestFromBase(
      base,
      agrupado[bi]?.pontos ?? []
    );
    const buckets = packIntoDays(ordered, myDayIdx.length);

    buckets.forEach((list, j) => {
      const dayIndex = myDayIdx[j];
      if (typeof dayIndex === 'number' && bucketsPerDay[dayIndex]) {
        bucketsPerDay[dayIndex] = bucketsPerDay[dayIndex].concat(list);
      }
    });
  }

  // monta itens por dia:
  // - dia 0: base de start (fixo)
  // - POIs desse dia
  // - base de END = base do próximo dia (ou base final no último dia)
  let gid = 0;
  for (let di = 0; di < totalDays; di++) {
    const col = board[di];
    const bi = dayBaseIndex[di];                // base "do dia"
    const baseDoDia = bases[bi];

    if (di === 0) {
      // âncora inicial
      col.items.push({
        id: `base-start-0`,
        pointIndex: pointIndexOf(baseDoDia),
        label: baseDoDia.label,
        time: 0,
        type: 'base',
        fixo: true,
      });
    }

    // POIs deste dia
    for (const poi of bucketsPerDay[di]) {
      col.items.push({
        id: `poi-${gid++}`,
        pointIndex: pointIndexOf(poi),
        label: poi.label,
        time: dur(poi),
        type: 'interesse',
      });
    }

    // base de término do dia:
    // - se não é o último dia, termina na base DO PRÓXIMO DIA
    // - se é o último, termina na base FINAL (que forçou ser a última)
    const nextBi = di < totalDays - 1 ? dayBaseIndex[di + 1] : dayBaseIndex[di];
    const baseTermino = bases[nextBi];

    col.items.push({
      id: `base-end-${di}`,
      pointIndex: pointIndexOf(baseTermino),
      label: baseTermino.label,
      time: 0,
      type: 'base',
      // não marca fixo: a sincronização copiará este item como início fixo do dia seguinte
    });
  }

  // replica "base fim do dia i" -> "base início fixo do dia i+1"
  return sincronizarBasesEntreDias(board);
}
