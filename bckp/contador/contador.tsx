const { React } = window.PluginDependencies;

export default function MeuPlugin() {
  const [count, setCount] = React.useState(0);
  const [ContadorButton, setContadorButton] = React.useState(null);

  React.useEffect(() => {
    import("http://localhost:4000/plugins/componente/components/ContadorButton.js").then((mod) => {
      setContadorButton(() => mod.default);
    });
  }, []);

  if (!ContadorButton) return <div>Carregando componente...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>Plugin funcionando!</h2>
      <ContadorButton count={count} onClick={() => setCount(count + 1)} />
    </div>
  );
}
