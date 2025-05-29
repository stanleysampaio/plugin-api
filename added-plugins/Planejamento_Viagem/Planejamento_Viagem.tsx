import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';
import { RoteiroAgenda } from './components/RoteiroAgenda';
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
  const [roteiroBoard, setRoteiroBoard] = React.useState<any[]>([]); // DiaRoteiro[]
  const [pontosDisponiveis, setPontosDisponiveis] = React.useState<any[]>([]);

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

      const initialBoard = generateInitialBoard(roteiro);
      const diasRoteiro = convertToDiaRoteiro(initialBoard);
      setRoteiroBoard(diasRoteiro);

      // calcular pontos ainda não alocados
      const alocadosIds = diasRoteiro.flatMap((dia) => dia.pontos.map((p: any) => p.id));
      const disponiveis = roteiro.pontos.filter((p: any) => !alocadosIds.includes(p.id));
      setPontosDisponiveis(disponiveis);
    } catch (e) {
      console.error('Erro ao desenhar rota:', e);
    }
  }

  return (
    <main className="p-4 flex flex-col gap-4">
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
          <RoteiroAgenda dataIda={roteiro.dataIda} dataVolta={roteiro.dataVolta} />
          <TravelPlannerBoard
            roteiro={roteiroBoard}
            onUpdateRoteiro={setRoteiroBoard}
            pontosDisponiveis={pontosDisponiveis}
            setPontosDisponiveis={setPontosDisponiveis}
          />
        </>
      )}
    </main>
  );
}

export default function TerraTripperPlugin() {
  return <TerraTripperPluginContent />;
}
