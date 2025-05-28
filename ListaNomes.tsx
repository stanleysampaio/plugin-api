const { React } = window.PluginDependencies;

export function ListaNomes({ nomes }: { nomes: string[] }) {
  if (!nomes.length) return <p className="text-gray-500">Nenhum nome salvo ainda.</p>;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Nomes salvos:</h3>
      <ul className="list-disc list-inside">
        {nomes.map((nome, i) => (
          <li key={i} className="text-gray-700">{nome}</li>
        ))}
      </ul>
    </div>
  );
}
