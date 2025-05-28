interface ContadorButtonProps {
  count: number;
  onClick: () => void;
}

export default function ContadorButton({ count, onClick }: ContadorButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        backgroundColor: "#3498db",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        marginTop: "12px",
        cursor: "pointer",
      }}
    >
      Contador: {count}
    </button>
  );
}
