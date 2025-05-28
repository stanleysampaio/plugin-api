// =============================
// 📦 Template de Plugin (TSX)
// =============================

const {
  React,
  useMenu,
  GoBackButton,
  SimpleButton,
  ReactIcons
} = window.PluginDependencies;

const { BiSmile } = ReactIcons.Bi;

export default function MeuPlugin() {
  const [count, setCount] = React.useState(0);
  const { changeMenuOption } = useMenu();

  return (
    <main className="w-full p-4">
      <GoBackButton title="Meu Plugin" icon={BiSmile} onGoBack={() => changeMenuOption(undefined)} />

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <BiSmile /> Plugin funcionando!
      </h2>

      <p className="mb-2">Contador: {count}</p>

      <SimpleButton
        className="bg-blue-500 hover:bg-blue-700 text-white"
        onClick={() => setCount(count + 1)}
      >
        Clique aqui
      </SimpleButton>
    </main>
  );
}
