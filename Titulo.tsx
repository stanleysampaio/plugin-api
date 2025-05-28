const { React } = window.PluginDependencies;

export function Titulo({ texto }: { texto: string }) {
  return <h2 className="text-xl font-bold">{texto}</h2>;
}
