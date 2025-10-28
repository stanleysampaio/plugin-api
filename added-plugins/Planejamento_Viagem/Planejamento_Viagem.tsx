// Planejamento_Viagem.tsx
import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { TravelPlannerBoard } from './components/TravelPlannerBoard';
import { generateInitialBoard } from './components/generateInitialBoard';
import { convertToDiaRoteiro } from './components/convertToDiaRoteiro';
import type { PontoRoteiro } from './components/types';

const {
  React,
  GoBackButton,
  ReactIcons,
  useMenu,
  Direction,
} = window.PluginDependencies;

const directionService = window.PluginDependencies.directionService;
const { MdOutlineMap } = ReactIcons?.md ?? {};

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

/** Tipo do “vetor de viagens” que vamos logar (debug/validação) */
type ViagemLeg = {
  from: string;
  to: string;
  distance?: number; // metros (se summary vier)
  duration?: number; // segundos (se summary vier)
};
type ViagensDia = {
  dayIndex: number;
  date?: string;
  colorIndex: number;
  color: number[];
  legs: ViagemLeg[];
};

function TerraTripperPluginContent() {
  const { changeMenuOption } = useMenu();
  const [roteiro, setRoteiro] = React.useState<any>(null);
  const [directions, setDirections] = React.useState<InstanceType<typeof Direction>[]>([]);
  const [roteiroBoard, setRoteiroBoard] = React.useState<any[]>([]);
  const [pontosDisponiveis, setPontosDisponiveis] = React.useState<any[]>([]);
  const [mostrarQuadro, setMostrarQuadro] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  // ---------- Helpers de sincronização ----------
  const recomputeLockRef = React.useRef(false);
  const queuedBoardRef = React.useRef<any[] | null>(null);
  const lastSigRef = React.useRef<string>('');
  const tokenRef = React.useRef(0);

  function boardSignature(board: any[]): string {
    const segs = board.map(d => {
      const ids = (d.pontos || []).map((p: any) => p?.id).filter(Boolean);
      const pairs: string[] = [];
      for (let i = 0; i < ids.length - 1; i++) pairs.push(`${ids[i]}->${ids[i + 1]}`);
      return pairs.join('|');
    });
    return segs.join('||');
  }

  async function clearAllRoutes(prevDirections: InstanceType<typeof Direction>[]) {
    try {
      let cleared = false;
      if (directionService?.clear)        { await directionService.clear(); cleared = true; }
      if (directionService?.clearSource)  { await directionService.clearSource(); cleared = true; }
      if (directionService?.reset)        { await directionService.reset(); cleared = true; }
      if (directionService?.removeAll)    { await directionService.removeAll(); cleared = true; }
      if (!cleared && prevDirections?.length && directionService?.removeDirection) {
        for (const d of prevDirections) await directionService.removeDirection(d.id);
      }
    } catch (e) {
      console.warn('Não foi possível limpar rotas antigas:', e);
    }
  }

  /** ----------------- Recompute de rotas (coloridas por dia) ----------------- **/
  const recomputeRoutes = React.useCallback(async (novoBoard: any[]) => {
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
      await clearAllRoutes(directions);
      setDirections([]);

      const { fetchDirectionsController } = window.PluginDependencies;
      const novas: InstanceType<typeof Direction>[] = [];

      const viagensPorDia: ViagensDia[] = [];

      for (let dayIndex = 0; dayIndex < novoBoard.length; dayIndex++) {
        const dia = novoBoard[dayIndex];
        const pts = (dia?.pontos || []) as Array<{
          id: string;
          label: string;
          coordinates: [number, number];
        }>;

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

            // === APLICAR COR DO DIA E INDEX ===
            const props: any = result?.geojson?.properties ?? {};
            props.color = color;            // <- number[] conforme seu type DirectionProperties
            props.colorIndex = colorIndex;  // <- qual cor do dia usamos
            props.query = {
              origin,
              destination,
              preference: 'recommended',
              options: {
                avoidBorders: 'none',
                avoidFeatures: { highways: false, tollways: false, ferries: false },
              },
            };
            (result as any).geojson.properties = props;

            if (myToken !== tokenRef.current) return;

            await directionService.addDirection(result);
            novas.push(result);

            // preencher vetor de viagens (debug/validação)
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

        viagensPorDia.push({
          dayIndex,
          date: dia?.data,
          colorIndex,
          color,
          legs,
        });
      }

      // ---------- LOG do vetor de viagens por dia ----------
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

  /** ----------------- Submit inicial ----------------- **/
  async function handleSubmit(roteiro: any) {
    setRoteiro(roteiro);

    try {
      // 1) Monta o board inicial (dias) a partir do formulário
      const initialBoard = await generateInitialBoard(roteiro);
      const diasRoteiro = convertToDiaRoteiro(initialBoard, roteiro.pontos);

      setRoteiroBoard(diasRoteiro);
      setPontosDisponiveis([]);

      // 2) Guarda assinatura inicial e já desenha rotas coloridas por dia
      lastSigRef.current = boardSignature(diasRoteiro);
      await recomputeRoutes(diasRoteiro);
    } catch (e) {
      console.error('Erro ao preparar/desenhar rotas iniciais:', e);
    }
  }

  // ---------- Catálogo de bases (tipado) ----------
  const toKey = React.useCallback((p: PontoRoteiro) => {
    return p.id ?? `${p.label}|${p.coordinates[0]},${p.coordinates[1]}`;
  }, []);

  const baseCatalog = React.useMemo<PontoRoteiro[]>(() => {
    const pontos = (roteiro?.pontos ?? []) as PontoRoteiro[];

    const pairs: [string, PontoRoteiro][] = pontos
      .filter((p): p is PontoRoteiro => !!p && typeof p === 'object' && p.tipo === 'base')
      .map((p): [string, PontoRoteiro] => [toKey(p), p]);

    return Array.from(new Map<string, PontoRoteiro>(pairs).values());
  }, [roteiro, toKey]);

  return (
    <main className="p-4 flex flex-col gap-4 relative">
      {typeof GoBackButton === 'function' ? (
        <GoBackButton
          title="TerraTripper"
          icon={MdOutlineMap ?? (() => <span>📍</span>)}
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
              style={{
                left: '380px',
                width: 'calc(100% - 380px)',
                height: '60vh',
                overflow: 'auto',
              }}
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
                <button
                  onClick={() => setMostrarQuadro(false)}
                  style={styles.botaoFechar}
                >
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
