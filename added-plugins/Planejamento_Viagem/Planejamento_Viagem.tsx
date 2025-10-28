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

function TerraTripperPluginContent() {
  const { changeMenuOption } = useMenu();
  const [roteiro, setRoteiro] = React.useState<any>(null);
  const [directions, setDirections] = React.useState<InstanceType<typeof Direction>[]>([]);
  const [roteiroBoard, setRoteiroBoard] = React.useState<any[]>([]);
  const [pontosDisponiveis, setPontosDisponiveis] = React.useState<any[]>([]);
  const [mostrarQuadro, setMostrarQuadro] = React.useState(false);
  const [hover, setHover] = React.useState(false);

  // ---------- Helpers de sincronização ----------
  const recomputeLockRef = React.useRef(false);              // impede concorrência
  const queuedBoardRef = React.useRef<any[] | null>(null);   // guarda último pedido
  const lastSigRef = React.useRef<string>('');               // assinatura do board atual
  const tokenRef = React.useRef(0);                          // invalida respostas antigas

  function boardSignature(board: any[]): string {
    // Assinatura com pares (id->id) por dia; ignora dados irrelevantes
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
      if (directionService?.clear) { await directionService.clear(); cleared = true; }
      if (directionService?.clearSource) { await directionService.clearSource(); cleared = true; }
      if (directionService?.reset) { await directionService.reset(); cleared = true; }
      if (directionService?.removeAll) { await directionService.removeAll(); cleared = true; }
      if (!cleared && prevDirections?.length && directionService?.removeDirection) {
        for (const d of prevDirections) await directionService.removeDirection(d.id);
      }
    } catch (e) {
      console.warn('Não foi possível limpar rotas antigas:', e);
    }
  }

  // ---------- Recompute com lock + última requisição vence ----------
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
      // 1) limpa rotas atuais
      await clearAllRoutes(directions);
      setDirections([]);

      // 2) cria novas rotas SEQUENCIALMENTE
      const { fetchDirectionsController } = window.PluginDependencies;
      const novas: InstanceType<typeof Direction>[] = [];

      for (const dia of novoBoard) {
        const pts = (dia?.pontos || []) as Array<{
          id: string;
          label: string;
          coordinates: [number, number];
        }>;

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

            if (myToken !== tokenRef.current) return;

            await directionService.addDirection(result);
            novas.push(result);
          } catch (e) {
            console.warn('Falha ao calcular um trecho:', e);
          }
        }
      }

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

  // ---------- Submit inicial ----------
  async function handleSubmit(roteiro: any) {
    setRoteiro(roteiro);
    const { fetchDirectionsController } = window.PluginDependencies;

    try {
      const dirs: InstanceType<typeof Direction>[] = [];

      for (let i = 0; i < roteiro.pontos.length - 1; i++) {
        const origin = roteiro.pontos[i];
        const destination = roteiro.pontos[i + 1];

        const result = await fetchDirectionsController.execute({
          origin,
          destination,
          profile: 'driving-car',
          preference: 'recommended',
          options: {
            avoidBorders: 'none',
            avoidFeatures: {
              highways: false,
              tollways: false,
              ferries: false,
            },
          },
        });

        await directionService.addDirection(result);
        dirs.push(result);
      }

      setDirections(dirs);

      // Monta o board e zera a coluna de "recolocar"
      const initialBoard = await generateInitialBoard(roteiro);
      const diasRoteiro = convertToDiaRoteiro(initialBoard, roteiro.pontos);
      setRoteiroBoard(diasRoteiro);
      setPontosDisponiveis([]);

      // guarda assinatura inicial
      lastSigRef.current = boardSignature(diasRoteiro);
    } catch (e) {
      console.error('Erro ao desenhar rota:', e);
    }
  }

  // ---------- Catálogo de bases (tipado) ----------
  const toKey = React.useCallback((p: PontoRoteiro) => {
    // se houver id, usa; senão, usa chave composta estável
    return p.id ?? `${p.label}|${p.coordinates[0]},${p.coordinates[1]}`;
  }, []);

  const baseCatalog = React.useMemo<PontoRoteiro[]>(() => {
    const pontos = (roteiro?.pontos ?? []) as PontoRoteiro[];

    const pairs: [string, PontoRoteiro][] = pontos
      .filter((p): p is PontoRoteiro => !!p && typeof p === 'object' && p.tipo === 'base')
      .map((p): [string, PontoRoteiro] => [toKey(p), p]); // <- tupla tipada

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
                height: '60vh',       // altura fixa pro FC gerir o scroll interno
                overflow: 'auto',   // deixa o FC controlar o scroll Y
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
