import { RoteiroForm } from './components/RoteiroForm';
import { RoteiroResumo } from './components/RoteiroResumo';

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
  const [roteiro, setRoteiro] = React.useState(null);
  const [directions, setDirections] = React.useState<InstanceType<typeof Direction>[]>([]);

  async function handleSubmit(roteiro: any) {
  setRoteiro(roteiro);
  const { fetchDirectionsController } = window.PluginDependencies;
  const directionService = window.PluginDependencies.directionService;

  try {
    const directions: InstanceType<typeof Direction>[] = [];

    for (let i = 0; i < roteiro.pontos.length - 1; i++) {
      const origin = roteiro.pontos[i];
      const destination = roteiro.pontos[i + 1];

      const result = await fetchDirectionsController.execute({
        origin,
        destination,
        profile: "driving-car", // pode ajustar se houver outra variável
        preference: "recommended",
        options: {
          avoidBorders: "none",
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
  } catch (e) {
    console.error("Erro ao desenhar rota:", e);
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
      {roteiro && <RoteiroResumo roteiro={roteiro} directions={directions} />}
    </main>
  );
}

export default function TerraTripperPlugin() {
  return <TerraTripperPluginContent />;
}
