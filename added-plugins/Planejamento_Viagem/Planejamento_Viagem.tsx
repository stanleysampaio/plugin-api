/** @jsx _R.createElement */
/** @jsxFrag _R.Fragment */
/** @jsxRuntime classic */

import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { TravelPlannerBoard } from './components/TravelPlannerBoard';
import { generateInitialBoard } from './components/generateInitialBoard';
import { convertToDiaRoteiro } from './components/convertToDiaRoteiro';
import type { PontoRoteiro } from './components/types';

/* ========= PluginDependencies com aliases seguros ========= */
const __PD: any = (window as any).PluginDependencies || {};
const _R: typeof import('react') = __PD.React;

const TT_GoBackButton = __PD.GoBackButton;
const TT_ReactIcons   = __PD.ReactIcons;
const TT_useMenu      = __PD.useMenu;
const TT_Direction    = __PD.Direction;

const TT_directionService = __PD.directionService;
const TT_pinService       = __PD.pinService;

const { MdOutlineMap: TT_MdOutlineMap } = (TT_ReactIcons?.md ?? {}) as any;


(window as any).TERRA_PIN_LAYER_ID = 'pins';
/** ----------------- Paleta de cores por dia (RGBA) ----------------- **/
const DAY_COLORS: number[][] = [
  [ 59, 130, 246, 0.95 ], // azul
  [ 16, 185, 129, 0.95 ], // esmeralda
  [234, 179,   8, 0.95 ], // amarelo
  [244,  63,  94, 0.95 ], // rose
  [139,  92, 246, 0.95 ], // violeta
  [245, 158,  11, 0.95 ], // amber
  [ 34, 197,  94, 0.95 ], // green
  [239,  68,  68, 0.95 ], // red
];
const colorForDay = (i: number) => DAY_COLORS[i % DAY_COLORS.length];

function rgbaToHex([r,g,b]: number[]) {
  const h = (n:number)=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** ----------------- Tipos p/ debug ----------------- */
type ViagemLeg = { from: string; to: string; distance?: number; duration?: number; };
type ViagensDia = { dayIndex: number; date?: string; colorIndex: number; color: number[]; legs: ViagemLeg[]; };

/** ----------------- Pins helpers ----------------- */
type PinFeature = {
  type: 'Feature';
  id: string;
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    kind: 'base' | 'poi';
    label?: string;
    colorHex: string;
    colorRGBA: [number, number, number, number];
    day?: string;
    dayIndex?: number;
  };
};

function stablePinId(dayIndex: number, date: string | undefined, p: { id?: string; label?: string; coordinates: [number,number] }, tag: string) {
  const base = p?.id || p?.label || `${p.coordinates[0]},${p.coordinates[1]}`;
  return `pin::${date ?? 'nodate'}::${dayIndex}::${tag}::${base}`;
}
function isBasePointId(pId?: string) {
  if (!pId) return false;
  return pId.startsWith('base-start-') || pId.startsWith('base-end-') || pId.startsWith('__base_of_');
}

/** 👇 NOVO: se houver uid, usamos o MESMO id do MapInput para substituir a “gotinha” */
function idForMapPin(p: any, dayIndex: number, date?: string, tag?: string) {
  if (p?.uid) return `point-${p.uid}`; // <- mesmo id que o MapInput usa
  // fallback estável se não houver uid
  return stablePinId(dayIndex, date, p, tag ?? 'poi');
}

function buildPinsFromBoard(board: any[]): PinFeature[] {
  const pins: PinFeature[] = [];
  for (let dayIndex = 0; dayIndex < board.length; dayIndex++) {
    const day = board[dayIndex];
    const pts = (day?.pontos || []) as Array<{ uid?: string; id?: string; label?: string; tipo?: 'base'|'interesse'; coordinates: [number, number] }>;
    const rgba = colorForDay(dayIndex) as [number,number,number,number];
    const hex = rgbaToHex(rgba);

    for (const p of pts) {
      if (p?.id && p.id.startsWith('__base_of_')) continue; // marcador invisível

      const kind: 'base' | 'poi' = (p?.tipo === 'base') || isBasePointId(p?.id) ? 'base' : 'poi';
      const featureId = idForMapPin(p, dayIndex, day?.data, kind);

      pins.push({
        type: 'Feature',
        id: featureId,
        geometry: { type: 'Point', coordinates: p.coordinates },
        properties: { kind, label: p?.label, colorHex: hex, colorRGBA: rgba, day: day?.data, dayIndex },
      });
    }
  }
  return pins;
}

async function replaceAllPins(features: PinFeature[]) {
  if (!TT_pinService) return;
  try {
    if (typeof TT_pinService.updateAllPins === 'function') {
      await TT_pinService.updateAllPins(features);
    } else if (typeof TT_pinService.setPins === 'function') {
      await TT_pinService.setPins(features);
    } else if (typeof TT_pinService.replaceAll === 'function') {
      await TT_pinService.replaceAll(features);
    } else {
      if (typeof TT_pinService.clear === 'function') await TT_pinService.clear();
      if (typeof TT_pinService.addPins === 'function') await TT_pinService.addPins(features);
    }
  } catch (e) {
    console.warn('[TerraTripper] Falha ao atualizar pins:', e);
  }
}

/** ----------------- Ordenação simples p/ rotas ----------------- */
function orderedDaysForRouting(board: any[]): any[] {
  return (board || []).map((d: any) => {
    const start = (d?.pontos || []).find((p: any) => String(p?.id) === `base-start-${d?.data}`);
    const end   = (d?.pontos || []).find((p: any) => String(p?.id) === `base-end-${d?.data}`);
    const pois  = (d?.pontos || []).filter((p: any) => p?.tipo === 'interesse');
    const seq = ([] as any[]).concat(start ? [start] : [], pois, end ? [end] : []);
    return { ...d, pontos: seq.length ? seq : (d?.pontos || []) };
  });
}

/** ----------------- Assinatura do board ----------------- */
function boardSignature(board: any[]): string {
  const segs = (board || []).map(d => {
    const ids = (d?.pontos || []).map((p: any) => (p?.uid ? `point-${p.uid}` : p?.id)).filter(Boolean);
    const pairs: string[] = [];
    for (let i = 0; i < ids.length - 1; i++) pairs.push(`${ids[i]}->${ids[i + 1]}`);
    return `${d?.data ?? ''}::${pairs.join('|')}`;
  });
  return segs.join('||');
}

/* ======================== Componente principal ======================== */
function TerraTripperPluginContent() {
  const { changeMenuOption } = TT_useMenu();
  const [roteiro, setRoteiro] = _R.useState<any>(null);
  const [directions, setDirections] = _R.useState<InstanceType<typeof TT_Direction>[]>([]);
  const [roteiroBoard, setRoteiroBoard] = _R.useState<any[]>([]);
  const [pontosDisponiveis, setPontosDisponiveis] = _R.useState<any[]>([]);
  const [mostrarQuadro, setMostrarQuadro] = _R.useState(false);
  const [hover, setHover] = _R.useState(false);

  const recomputeLockRef = _R.useRef(false);
  const queuedBoardRef   = _R.useRef<any[] | null>(null);
  const lastSigRef       = _R.useRef<string>('');
  const tokenRef         = _R.useRef(0);

  async function clearAllRoutes(prev: InstanceType<typeof TT_Direction>[]) {
    try {
      let cleared = false;
      if (TT_directionService?.clear)        { await TT_directionService.clear(); cleared = true; }
      if (TT_directionService?.clearSource)  { await TT_directionService.clearSource(); cleared = true; }
      if (TT_directionService?.reset)        { await TT_directionService.reset(); cleared = true; }
      if (TT_directionService?.removeAll)    { await TT_directionService.removeAll(); cleared = true; }
      if (!cleared && prev?.length && TT_directionService?.removeDirection) {
        for (const d of prev) await TT_directionService.removeDirection(d.id);
      }
    } catch (e) {
      console.warn('Não foi possível limpar rotas antigas:', e);
    }
  }

  /** ----------------- Recompute rotas + pins ----------------- */
  const recomputeRoutes = _R.useCallback(async (novoBoard: any[]) => {
    const sig = boardSignature(novoBoard);
    if (sig === lastSigRef.current) return;

    if (recomputeLockRef.current) {
      queuedBoardRef.current = novoBoard;
      return;
    }
    recomputeLockRef.current = true;
    queuedBoardRef.current = null;
    lastSigRef.current = sig;
    const myToken = ++tokenRef.current;

    try {
      // pins por dia (AGORA usando os mesmos ids do MapInput se houver uid)
      await replaceAllPins(buildPinsFromBoard(novoBoard));

      // rotas
      await clearAllRoutes(directions);
      setDirections([]);

      const ordered = orderedDaysForRouting(novoBoard);
      const { fetchDirectionsController } = __PD;
      const novas: InstanceType<typeof TT_Direction>[] = [];

      const viagensPorDia: ViagensDia[] = [];

      for (let dayIndex = 0; dayIndex < ordered.length; dayIndex++) {
        const dia = ordered[dayIndex];
        const pts = (dia?.pontos || []) as Array<{ uid?: string; id?: string; label: string; coordinates: [number, number] }>;

        const color = colorForDay(dayIndex);
        const colorIndex = dayIndex % DAY_COLORS.length;
        const legs: ViagemLeg[] = [];

        for (let i = 0; i < pts.length - 1; i++) {
          if (myToken !== tokenRef.current) return;

          const origin = pts[i];
          const destination = pts[i + 1];
          const [ol, oa] = origin.coordinates;
          const [dl, da] = destination.coordinates;
          if (ol === dl && oa === da) continue;

          try {
            const result = await fetchDirectionsController.execute({
              origin,
              destination,
              profile: 'driving-car',
              preference: 'recommended',
              options: {
                avoidBorders: 'none',
                avoidFeatures: { highways: false, tollways: false, ferries: false },
              },
            });

            const props: any = result?.geojson?.properties ?? {};
            props.color = color;
            props.colorIndex = colorIndex;
            props.query = {
              origin, destination,
              preference: 'recommended',
              options: { avoidBorders: 'none', avoidFeatures: { highways: false, tollways: false, ferries: false } },
            };
            (result as any).geojson.properties = props;

            if (myToken !== tokenRef.current) return;

            await TT_directionService.addDirection(result);
            novas.push(result);

            const summary = props?.summary ?? {};
            legs.push({
              from: origin?.label ?? `${origin.coordinates}`,
              to: destination?.label ?? `${destination.coordinates}`,
              distance: typeof summary.distance === 'number' ? summary.distance : undefined,
              duration: typeof summary.duration === 'number' ? summary.duration : undefined,
            });
          } catch (e) {
            console.warn('Falha ao calcular um trecho:', e);
          }
        }

        viagensPorDia.push({ dayIndex, date: dia?.data, colorIndex, color, legs });
      }

      console.log('[TerraTripper] viagensPorDia:', viagensPorDia);

      if (myToken === tokenRef.current) setDirections(novas);
    } finally {
      recomputeLockRef.current = false;
      if (queuedBoardRef.current) {
        const next = queuedBoardRef.current;
        queuedBoardRef.current = null;
        void recomputeRoutes(next);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions]);

  /** ----------------- Submit inicial ----------------- */
  async function handleSubmit(formData: any) {
    setRoteiro(formData);

    try {
      // 1) Rotas neutras (preview) + pins neutros SUBSTITUINDO a gotinha (mesmo id)
      if (formData?.pontos?.length >= 2) {
        try {
          await clearAllRoutes(directions);
          setDirections([]);

          const { fetchDirectionsController } = __PD;
          const tempRoutes: InstanceType<typeof TT_Direction>[] = [];

          for (let i = 0; i < formData.pontos.length - 1; i++) {
            const origin = formData.pontos[i];
            const destination = formData.pontos[i + 1];
            if (!origin?.coordinates || !destination?.coordinates) continue;

            const result = await fetchDirectionsController.execute({
              origin,
              destination,
              profile: 'driving-car',
              preference: 'recommended',
              options: {
                avoidBorders: 'none',
                avoidFeatures: { highways: false, tollways: false, ferries: false },
              },
            });

            const props: any = result?.geojson?.properties ?? {};
            props.color = [100,116,139,0.95]; // slate-500
            props.colorIndex = -1;
            (result as any).geojson.properties = props;

            await TT_directionService.addDirection(result);
            tempRoutes.push(result);
          }
          setDirections(tempRoutes);

          if (TT_pinService) {
            const neutrals: PinFeature[] = (formData.pontos || [])
              .filter((p: any) => Array.isArray(p?.coordinates) && p.coordinates.length === 2)
              .map((p: any, idx: number) => ({
                type: 'Feature',
                id: p?.uid ? `point-${p.uid}` : `point-fallback-${idx}`, // 👈 mesmo id do MapInput
                geometry: { type: 'Point', coordinates: p.coordinates as [number,number] },
                properties: {
                  kind: p?.tipo === 'base' ? 'base' : 'poi',
                  label: p?.label,
                  colorHex: '#64748b',
                  colorRGBA: [100,116,139,0.95],
                }
              }));
            await replaceAllPins(neutrals);
          }
        } catch (e) {
          console.warn('Rota inicial (form) falhou:', e);
        }
      }

      // 2) Gera board e aplica pins/rotas coloridos (substitui ids novamente)
      const initialBoard = await generateInitialBoard(formData);
      const diasRoteiro  = convertToDiaRoteiro(initialBoard, formData.pontos);

      setRoteiroBoard(diasRoteiro);
      setPontosDisponiveis([]);

      lastSigRef.current = boardSignature(diasRoteiro);
      await recomputeRoutes(diasRoteiro);
    } catch (e) {
      console.error('Erro ao preparar/desenhar rotas iniciais:', e);
    }
  }

  // ---------- Catálogo de bases ----------
  const toKey = _R.useCallback((p: PontoRoteiro) => (
    p.id ?? `${p.label}|${p.coordinates[0]},${p.coordinates[1]}`
  ), []);
  const baseCatalog = _R.useMemo<PontoRoteiro[]>(() => {
    const pontos = (roteiro?.pontos ?? []) as PontoRoteiro[];
    const pairs: [string, PontoRoteiro][] = pontos
      .filter((p): p is PontoRoteiro => !!p && typeof p === 'object' && p.tipo === 'base')
      .map((p): [string, PontoRoteiro] => [toKey(p), p]);
    return Array.from(new Map<string, PontoRoteiro>(pairs).values());
  }, [roteiro, toKey]);

  return (
    <main className="p-4 flex flex-col gap-4 relative">
      {typeof TT_GoBackButton === 'function' ? (
        <TT_GoBackButton
          title="TerraTripper"
          icon={TT_MdOutlineMap ?? (() => <span>📍</span>)}
          onGoBack={() => changeMenuOption(undefined)}
        />
      ) : (
        <div className="text-red-500 font-bold">Erro: GoBackButton não está disponível</div>
      )}

      <h2 className="text-xl font-bold">Planejador de Roteiro de Viagem</h2>

      <RoteiroForm onSubmit={handleSubmit} />

      {roteiro && (
        <>
          <RoteiroResumo roteiro={roteiro} directions={directions} />

          {!mostrarQuadro && (
            <div className="w-full mt-4">
              <button
                onClick={() => setMostrarQuadro(true)}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                style={{
                  ...styles.botaoPrincipal,
                  backgroundColor: hover ? '#1D4ED8' : styles.botaoPrincipal.backgroundColor,
                }}
              >
                Abrir Quadro de Planejamento
              </button>
            </div>
          )}

          {mostrarQuadro && (
            <div
              className="fixed bottom-0 z-40 bg-white border-t border-l border-gray-300 shadow-xl p-4"
              style={{ left: '380px', width: 'calc(100% - 380px)', height: '60vh', overflow: 'auto' }}
            >
              <TravelPlannerBoard
                roteiro={roteiroBoard}
                onUpdateRoteiro={setRoteiroBoard}
                pontosDisponiveis={pontosDisponiveis}
                baseCatalog={baseCatalog}
                onUpdateDisponiveis={setPontosDisponiveis}
                onRebuildRoutes={recomputeRoutes}
              />

              <div className="mt-4">
                <button onClick={() => setMostrarQuadro(false)} style={styles.botaoFechar}>
                  Fechar Quadro
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function TerraTripperPlugin() {
  return <TerraTripperPluginContent />;
}

const styles = {
  botaoPrincipal: {
    backgroundColor: '#2563EB',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    transition: 'background-color 0.2s ease-in-out',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    maxWidth: 'fit-content' as const,
  },
  botaoFechar: {
    backgroundColor: '#DC2626',
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
};
