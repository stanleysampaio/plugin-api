// components/types.tsx

export type TipoPonto = "base" | "interesse";

// Representa um ponto no mapa com detalhes adicionais
export interface PontoRoteiro {
  id?: string; // ID opcional (pode ser usado em drag & drop)
  label: string;
  coordinates: [number, number];
  tipo: TipoPonto;
  tempo?: number; // Em minutos (apenas para pontos de interesse)
  fixo?: boolean;
}

// Representa a agenda de um único dia
export interface DiaRoteiro {
  data: string; // Exemplo: "quinta-feira, 01/05"
  pontos: PontoRoteiro[]; // Lista de pontos atribuídos a este dia
}

// Utilizado pelo board original (antes da conversão)
export interface BoardItem {
  id: string;
  pointIndex: number;
  label: string;
  time: number; // tempo de consumo em minutos
  type: TipoPonto;
}

// Estrutura da coluna usada no board inicial
export interface BoardColumn {
  id: string;
  label: string;
  items: BoardItem[];
}

// Dados do formulário principal
export interface Roteiro {
  dataIda: string;
  dataVolta: string;
  interesses: string;
  tempo: number;
  pontos: any[]; // pontos originais vindos do PluginMapInput (sem tipagem forte ainda)
}
