import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { TravelPlannerBoard } from './components/TravelPlannerBoard';
import { generateInitialBoard } from './components/generateInitialBoard';
import { convertToDiaRoteiro } from './components/convertToDiaRoteiro';

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
  const [hover, setHover] = React.useState(false); // para hover do botão

  async function handleSubmit(roteiro: any) {
  setRoteiro(roteiro);
  const { fetchDirectionsController } = window.PluginDependencies;

  try {
    const directions: InstanceType<typeof Direction>[] = [];

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
      directions.push(result);
    }

    setDirections(directions);

    // 🛠️ Aqui estava o problema:
    const initialBoard = await generateInitialBoard(roteiro);
    console.log('Board gerado:', initialBoard)
    const diasRoteiro = convertToDiaRoteiro(initialBoard);
    console.log('Dias convertidos:', diasRoteiro);
    setRoteiroBoard(diasRoteiro);

    const alocadosIds = diasRoteiro.flatMap((dia) => dia.pontos.map((p: any) => p.id));
    const disponiveis = roteiro.pontos.filter((p: any) => !alocadosIds.includes(p.id));
    setPontosDisponiveis(disponiveis);
  } catch (e) {
    console.error('Erro ao desenhar rota:', e);
  }
}


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

          {/* BOTÃO ABRIR – visível apenas se o quadro estiver fechado */}
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

          {/* DRAWER COM QUADRO E BOTÃO DE FECHAR */}
          {mostrarQuadro && (
            <div
              className="fixed bottom-0 z-40 bg-white border-t border-l border-gray-300 shadow-xl p-4"
              style={{
                left: '380px',
                width: 'calc(100% - 380px)',
                maxHeight: '60vh',
                overflowX: 'auto',
                overflowY: 'hidden',
              }}
            >
              <TravelPlannerBoard
                roteiro={roteiroBoard}
                onUpdateRoteiro={setRoteiroBoard}
                pontosDisponiveis={pontosDisponiveis}
                setPontosDisponiveis={setPontosDisponiveis}
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

// ⬇️ STYLES

const styles = {
  botaoPrincipal: {
    backgroundColor: '#2563EB', // azul-600
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    transition: 'background-color 0.2s ease-in-out',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    maxWidth: 'fit-content',
  },
  botaoFechar: {
    backgroundColor: '#DC2626', // vermelho-600
    color: 'white',
    padding: '0.5rem 1rem',
    fontWeight: 600,
    borderRadius: '0.5rem',
    border: 'none',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
};
