const { React, SimpleButton } = window.PluginDependencies;
import { Titulo } from "./components/Titulo";
import { ListaNomes } from "./components/ListaNomes";

export default function MeuPlugin() {
  const [nome, setNome] = React.useState('');
  const [nomesSalvos, setNomesSalvos] = React.useState<string[]>([]);

  const salvarNome = () => {
    if (nome.trim() === '') return;
    setNomesSalvos([...nomesSalvos, nome]);
    setNome('');
  };

  return (
    <main className="w-full p-4 flex flex-col gap-4">
      <Titulo texto="Cadastrar Nome" />

      <input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Digite um nome"
        className="border border-gray-300 rounded px-3 py-2"
      />

      <SimpleButton
        onClick={salvarNome}
        className="bg-blue-500 hover:bg-blue-700 text-white"
      >
        Salvar
      </SimpleButton>

      <ListaNomes nomes={nomesSalvos} />
    </main>
  );
}
