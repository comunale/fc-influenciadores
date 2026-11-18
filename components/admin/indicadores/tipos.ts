/** Uma linha da tela /admin/indicadores, já com os números somados. */
export type IndicadorNaTela = {
  id: string
  nome: string
  /** Só dígitos, como está no banco. A tela formata. */
  cpf: string
  telefone: string
  codigo: string
  /** Nulo = sem teto, que é como o cadastro nasce. */
  tetoUsos: number | null
  ativo: boolean
  encerradoEm: string | null
  criadoEm: string
  aceiteComunicacoes: boolean
  cliques: number
  /** De resumoDoIndicador: cupons gerados. */
  cupons: number
  /** Cupons vivos (pendentes + usados): é o que o teto limita. */
  naFila: number
  /** Vendas feitas. */
  usos: number
  /** Vendas com NF conferida — é o que vira prêmio. */
  premiados: number
  /** Conferidas e AINDA NAO pagas, em reais. */
  aReceber: number
  /** Premios que o Cesar ja pagou, em reais. */
  jaPremiado: number
}
