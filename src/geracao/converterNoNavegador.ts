import * as duckdb from "@duckdb/duckdb-wasm";
import ehWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import ehWasm from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import mvpWasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";

const SERVICOS = ["J", "S", "Q", "G", "B", "R", "C", "L"] as const;
const COLUNAS = [
  "NR_AEROPORTO_REFERENCIA",
  "NR_MOVIMENTO_TIPO",
  "NR_SERVICE_TYPE",
  "NR_NATUREZA",
  "DT_CALCO",
  "HH_CALCO",
  "NR_BOX",
  "NR_TERMINAL",
  "QT_PAX_LOCAL",
  "QT_PAX_CONEXAO_DOMESTICO",
  "QT_PAX_CONEXAO_INTERNACIONAL",
] as const;
const ORDEM = [
  "NR_AEROPORTO_REFERENCIA",
  "DT_CALCO",
  "HH_CALCO",
  "NR_MOVIMENTO_TIPO",
  "NR_SERVICE_TYPE",
  "NR_NATUREZA",
  "NR_BOX",
  "NR_TERMINAL",
  "QT_PAX_LOCAL",
  "QT_PAX_CONEXAO_DOMESTICO",
  "QT_PAX_CONEXAO_INTERNACIONAL",
] as const;
const TEXTO = new Set<string>([
  "NR_AEROPORTO_REFERENCIA",
  "NR_MOVIMENTO_TIPO",
  "NR_SERVICE_TYPE",
  "NR_NATUREZA",
  "NR_BOX",
  "NR_TERMINAL",
]);
const PAX = [
  "QT_PAX_LOCAL",
  "QT_PAX_CONEXAO_DOMESTICO",
  "QT_PAX_CONEXAO_INTERNACIONAL",
] as const;
const TIPOS: readonly [string, string][] = [
  ["NR_AEROPORTO_REFERENCIA", "VARCHAR"],
  ["NR_MOVIMENTO_TIPO", "VARCHAR"],
  ["NR_SERVICE_TYPE", "VARCHAR"],
  ["NR_NATUREZA", "VARCHAR"],
  ["DT_CALCO", "DATE"],
  ["HH_CALCO", "TIME"],
  ["NR_BOX", "VARCHAR"],
  ["NR_TERMINAL", "VARCHAR"],
  ["QT_PAX_LOCAL", "BIGINT"],
  ["QT_PAX_CONEXAO_DOMESTICO", "BIGINT"],
  ["QT_PAX_CONEXAO_INTERNACIONAL", "BIGINT"],
];
const OPCOES_CSV = `
delim = ';',
header = true,
skip = 1,
all_varchar = true,
union_by_name = true,
null_padding = true
`;
const BASE = "base.parquet";
const SAIDA = "saida.parquet";
const PACOTES: duckdb.DuckDBBundles = {
  mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
  eh: { mainModule: ehWasm, mainWorker: ehWorker },
};

export type ResultadoNavegador = {
  bytes: Uint8Array;
  linhas: number;
};

class ConversaoErro extends Error {}

type CsvRegistrado = {
  chave: string;
  arquivo: File;
  nomeRegistro: string;
};

type Linha = Record<string, unknown>;

function ident(nome: string): string {
  return `"${nome.replaceAll('"', '""')}"`;
}

function sqlTexto(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

function numero(valor: unknown): number {
  if (typeof valor === "bigint") return Number(valor);
  if (typeof valor === "number") return valor;
  if (valor == null) return 0;
  return Number(valor);
}

function texto(valor: unknown): string {
  return valor == null ? "" : String(valor);
}

function tipoCanonico(tipo: string): string {
  const nome = tipo.toUpperCase();
  if (nome === "STRING" || nome.startsWith("VARCHAR")) return "VARCHAR";
  if (nome.startsWith("TIME")) return "TIME";
  if (nome.startsWith("DATE")) return "DATE";
  if (nome === "BIGINT" || nome === "INT64") return "BIGINT";
  return nome;
}

function mesDoNome(nome: string): string {
  const tronco = nome.replace(/\.[^.]+$/, "");
  const digitos = tronco.replace(/\D/g, "");
  if (digitos.length < 6) {
    throw new ConversaoErro(`O nome ${nome} não traz o mês YYYYMM.`);
  }
  const valor = digitos.slice(-6);
  const ano = Number(valor.slice(0, 4));
  const mes = Number(valor.slice(4));
  if (!(ano >= 2000 && ano <= 2100 && mes >= 1 && mes <= 12)) {
    throw new ConversaoErro(`O nome ${nome} não traz o mês YYYYMM.`);
  }
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}`;
}

function limites(chave: string): [string, string] {
  const ano = Number(chave.slice(0, 4));
  const mes = Number(chave.slice(5));
  const fimAno = mes === 12 ? ano + 1 : ano;
  const fimMes = mes === 12 ? 1 : mes + 1;
  const fim = `${String(fimAno).padStart(4, "0")}-${String(fimMes).padStart(2, "0")}-01`;
  return [`${chave}-01`, fim];
}

function agrupar(csvs: readonly File[]): CsvRegistrado[] {
  if (csvs.length === 0) {
    throw new ConversaoErro("Informe ao menos um CSV.");
  }
  const vistos = new Map<string, string>();
  return csvs.map((arquivo, indice) => {
    const chave = mesDoNome(arquivo.name);
    const anterior = vistos.get(chave);
    if (anterior) {
      throw new ConversaoErro(
        `Dois CSVs reivindicam ${chave}: ${anterior} e ${arquivo.name}.`,
      );
    }
    vistos.set(chave, arquivo.name);
    return { chave, arquivo, nomeRegistro: `csv_${indice}.csv` };
  });
}

function expressoesCsv(): string {
  return COLUNAS.map((coluna) => {
    const citada = ident(coluna);
    if (TEXTO.has(coluna)) return `TRIM(${citada}) AS ${citada}`;
    if (coluna === "DT_CALCO") {
      return `TRY_CAST(NULLIF(TRIM(${citada}), '') AS DATE) AS ${citada}`;
    }
    if (coluna === "HH_CALCO") {
      return `TRY_CAST(NULLIF(TRIM(${citada}), '') AS TIME) AS ${citada}`;
    }
    return `TRY_CAST(NULLIF(TRIM(${citada}), '') AS BIGINT) AS ${citada}`;
  }).join(", ");
}

function expressoesBase(): string {
  return COLUNAS.map((coluna) => {
    const citada = ident(coluna);
    if (TEXTO.has(coluna)) return `CAST(${citada} AS VARCHAR) AS ${citada}`;
    if (coluna === "DT_CALCO") return `CAST(${citada} AS DATE) AS ${citada}`;
    if (coluna === "HH_CALCO") return `CAST(${citada} AS TIME) AS ${citada}`;
    return `CAST(${citada} AS BIGINT) AS ${citada}`;
  }).join(", ");
}

function servicosSql(): string {
  return SERVICOS.map((servico) => sqlTexto(servico)).join(", ");
}

function leituraCsv(nomeRegistro: string): string {
  return `read_csv(${sqlTexto(nomeRegistro)}, ${OPCOES_CSV})`;
}

function sqlDoCsv(nomeRegistro: string): string {
  return `
    SELECT ${expressoesCsv()}
    FROM ${leituraCsv(nomeRegistro)}
    WHERE TRIM(${ident("NR_SERVICE_TYPE")}) IN (${servicosSql()})
  `;
}

function sqlDaBase(meses: readonly string[]): string {
  const lista = meses.map((mes) => sqlTexto(mes)).join(", ");
  return `
    SELECT ${expressoesBase()}
    FROM read_parquet(${sqlTexto(BASE)})
    WHERE strftime(CAST(${ident("DT_CALCO")} AS DATE), '%Y-%m') NOT IN (${lista})
  `;
}

function sqlGravacao(uniao: string): string {
  const colunas = COLUNAS.map((coluna) => ident(coluna)).join(", ");
  const ordem = ORDEM.map((coluna) => `${ident(coluna)} NULLS LAST`).join(", ");
  return `
    SELECT ${colunas}
    FROM (${uniao}) AS uniao
    ORDER BY ${ordem}
  `;
}

async function consultar(
  conn: duckdb.AsyncDuckDBConnection,
  sql: string,
): Promise<Linha[]> {
  const tabela = await conn.query(sql);
  return tabela.toArray() as Linha[];
}

async function colunasDe(
  conn: duckdb.AsyncDuckDBConnection,
  consulta: string,
): Promise<Set<string>> {
  const linhas = await consultar(
    conn,
    `SELECT column_name FROM (DESCRIBE ${consulta})`,
  );
  return new Set(
    linhas.map((linha) => texto(linha.column_name ?? linha.name)),
  );
}

function exigirColunas(presentes: Set<string>, origem: string): void {
  const faltantes = COLUNAS.filter((coluna) => !presentes.has(coluna));
  if (faltantes.length > 0) {
    throw new ConversaoErro(
      `Colunas não encontradas em ${origem}: ${faltantes.join(", ")}.`,
    );
  }
}

async function validarCsv(
  conn: duckdb.AsyncDuckDBConnection,
  entrada: CsvRegistrado,
): Promise<void> {
  exigirColunas(
    await colunasDe(conn, `SELECT * FROM ${leituraCsv(entrada.nomeRegistro)}`),
    entrada.arquivo.name,
  );
  const [inicio, fim] = limites(entrada.chave);
  const pax = PAX.map(
    (coluna) => `
      COUNT(*) FILTER (
        WHERE ${ident(coluna)} IS NOT NULL
          AND TRIM(${ident(coluna)}) <> ''
          AND TRY_CAST(TRIM(${ident(coluna)}) AS BIGINT) IS NULL
      ) AS ${ident(`invalido_${coluna}`)}
    `,
  ).join(", ");
  const [linha] = await consultar(
    conn,
    `
      SELECT
        COUNT(*) AS total,
        COUNT(TRY_CAST(NULLIF(TRIM(${ident("DT_CALCO")}), '') AS DATE)) AS datas,
        COUNT(TRY_CAST(NULLIF(TRIM(${ident("HH_CALCO")}), '') AS TIME)) AS horas,
        COUNT(*) FILTER (
          WHERE TRY_CAST(NULLIF(TRIM(${ident("DT_CALCO")}), '') AS DATE) IS NULL
             OR TRY_CAST(NULLIF(TRIM(${ident("DT_CALCO")}), '') AS DATE) < DATE '${inicio}'
             OR TRY_CAST(NULLIF(TRIM(${ident("DT_CALCO")}), '') AS DATE) >= DATE '${fim}'
        ) AS fora,
        ${pax}
      FROM ${leituraCsv(entrada.nomeRegistro)}
      WHERE TRIM(${ident("NR_SERVICE_TYPE")}) IN (${servicosSql()})
    `,
  );
  const total = numero(linha?.total);
  if (total === 0) {
    throw new ConversaoErro(
      `O filtro não encontrou registros em ${entrada.arquivo.name}. O Parquet não foi gerado.`,
    );
  }
  if (numero(linha?.datas) !== total || numero(linha?.horas) !== total) {
    throw new ConversaoErro(
      `Há datas ou horas inválidas em ${entrada.arquivo.name}. O Parquet não foi gerado.`,
    );
  }
  if (numero(linha?.fora) > 0) {
    throw new ConversaoErro(
      `Há linhas de ${entrada.arquivo.name} fora de ${entrada.chave}. O Parquet não foi gerado.`,
    );
  }
  const quebrados = PAX.filter(
    (coluna) => numero(linha?.[`invalido_${coluna}`]) > 0,
  );
  if (quebrados.length > 0) {
    throw new ConversaoErro(
      `Há passageiros que não convertem para inteiro em ${entrada.arquivo.name}: ${quebrados.join(", ")}. O Parquet não foi gerado.`,
    );
  }
}

async function validarBase(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  exigirColunas(
    await colunasDe(conn, `SELECT * FROM read_parquet(${sqlTexto(BASE)})`),
    "o Parquet enviado",
  );
  const [linha] = await consultar(
    conn,
    `
      SELECT COUNT(*) AS invalidos
      FROM read_parquet(${sqlTexto(BASE)})
      WHERE TRY_CAST(${ident("DT_CALCO")} AS DATE) IS NULL
         OR TRY_CAST(${ident("HH_CALCO")} AS TIME) IS NULL
    `,
  );
  if (numero(linha?.invalidos) > 0) {
    throw new ConversaoErro(
      "O Parquet enviado tem datas ou horas inválidas. O arquivo não foi gerado.",
    );
  }
}

async function mesesMantidos(
  conn: duckdb.AsyncDuckDBConnection,
  meses: readonly string[],
): Promise<Set<string>> {
  const lista = meses.map((mes) => sqlTexto(mes)).join(", ");
  const linhas = await consultar(
    conn,
    `
      SELECT DISTINCT strftime(CAST(${ident("DT_CALCO")} AS DATE), '%Y-%m') AS mes
      FROM read_parquet(${sqlTexto(BASE)})
      WHERE strftime(CAST(${ident("DT_CALCO")} AS DATE), '%Y-%m') NOT IN (${lista})
    `,
  );
  return new Set(
    linhas.map((linha) => texto(linha.mes)).filter((mes) => mes !== ""),
  );
}

async function abrir(): Promise<duckdb.AsyncDuckDB> {
  const pacote = await duckdb.selectBundle(PACOTES);
  if (!pacote.mainWorker) {
    throw new ConversaoErro("Não foi possível iniciar o DuckDB no navegador.");
  }
  const worker = new Worker(pacote.mainWorker);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(pacote.mainModule);
    return db;
  } catch (erro) {
    await db.terminate().catch(() => undefined);
    throw erro;
  }
}

async function ajustar(conn: duckdb.AsyncDuckDBConnection): Promise<void> {
  for (const comando of [
    "SET threads = 1",
    "SET preserve_insertion_order = true",
    "SET TimeZone = 'UTC'",
  ]) {
    try {
      await conn.query(comando);
    } catch {
      // O bundle sem memória compartilhada já trabalha com uma thread.
    }
  }
}

async function gravar(
  db: duckdb.AsyncDuckDB,
  conn: duckdb.AsyncDuckDBConnection,
  selecao: string,
): Promise<void> {
  const cheio = `
    FORMAT PARQUET,
    COMPRESSION ZSTD,
    COMPRESSION_LEVEL 15,
    ROW_GROUP_SIZE 122880
  `;
  const simples = "FORMAT PARQUET, COMPRESSION ZSTD";
  try {
    await conn.query(`COPY (${selecao}) TO ${sqlTexto(SAIDA)} (${cheio})`);
  } catch {
    await db.dropFile(SAIDA).catch(() => undefined);
    await conn.query(`COPY (${selecao}) TO ${sqlTexto(SAIDA)} (${simples})`);
  }
}

async function conferir(
  conn: duckdb.AsyncDuckDBConnection,
  linhasEsperadas: number,
  mesesEsperados: Set<string>,
): Promise<void> {
  const [contagem] = await consultar(
    conn,
    `SELECT COUNT(*) AS total FROM read_parquet(${sqlTexto(SAIDA)})`,
  );
  if (numero(contagem?.total) !== linhasEsperadas) {
    throw new ConversaoErro(
      `Contagem divergente: esperadas=${linhasEsperadas}, Parquet=${numero(contagem?.total)}.`,
    );
  }
  const esquema = await consultar(
    conn,
    `DESCRIBE SELECT * FROM read_parquet(${sqlTexto(SAIDA)})`,
  );
  const obtidos = esquema.map(
    (linha) =>
      [
        texto(linha.column_name ?? linha.name),
        tipoCanonico(texto(linha.column_type ?? linha.type)),
      ] as const,
  );
  const esperado = TIPOS.map(([nome, tipo]) => [nome, tipo] as const);
  if (
    obtidos.length !== esperado.length ||
    obtidos.some(
      ([nome, tipo], indice) =>
        nome !== esperado[indice]?.[0] || tipo !== esperado[indice]?.[1],
    )
  ) {
    throw new ConversaoErro(`Schema inesperado: ${JSON.stringify(obtidos)}.`);
  }
  const grupos = await consultar(
    conn,
    `
      SELECT strftime(${ident("DT_CALCO")}, '%Y-%m') AS mes
      FROM read_parquet(${sqlTexto(SAIDA)})
      GROUP BY 1
    `,
  );
  const meses = new Set(grupos.map((linha) => texto(linha.mes)));
  if (
    meses.size !== mesesEsperados.size ||
    [...mesesEsperados].some((mes) => !meses.has(mes))
  ) {
    throw new ConversaoErro(
      `Os meses do Parquet não fecham com as entradas: ${[...mesesEsperados].sort().join(", ")}.`,
    );
  }
}

function falha(erro: unknown): ConversaoErro {
  if (erro instanceof ConversaoErro) return erro;
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  return new ConversaoErro(`Não foi possível converter no navegador. ${detalhe}`);
}

export async function converterNoNavegador(
  csvs: readonly File[],
  base: File | null,
): Promise<ResultadoNavegador> {
  const entradas = agrupar(csvs);
  let db: duckdb.AsyncDuckDB | null = null;
  try {
    db = await abrir();
    const conn = await db.connect();
    await ajustar(conn);
    for (const entrada of entradas) {
      const buffer = new Uint8Array(await entrada.arquivo.arrayBuffer());
      await db.registerFileBuffer(entrada.nomeRegistro, buffer);
      await validarCsv(conn, entrada);
    }
    const mesesCsv = entradas.map((entrada) => entrada.chave);
    let mantidos = new Set<string>();
    if (base) {
      await db.registerFileBuffer(BASE, new Uint8Array(await base.arrayBuffer()));
      await validarBase(conn);
      mantidos = await mesesMantidos(conn, mesesCsv);
    }
    const partes = entradas.map(
      (entrada) => `SELECT * FROM (${sqlDoCsv(entrada.nomeRegistro)}) AS lote`,
    );
    if (base) partes.push(`SELECT * FROM (${sqlDaBase(mesesCsv)}) AS base_mantida`);
    const uniao = partes.join(" UNION ALL ");
    const [previa] = await consultar(
      conn,
      `SELECT COUNT(*) AS total FROM (${uniao}) AS previa`,
    );
    const linhas = numero(previa?.total);
    if (linhas === 0) {
      throw new ConversaoErro(
        "O filtro não encontrou registros. O Parquet não foi gerado.",
      );
    }
    await gravar(db, conn, sqlGravacao(uniao));
    await conferir(conn, linhas, new Set([...mesesCsv, ...mantidos]));
    await db.flushFiles();
    const bytes = await db.copyFileToBuffer(SAIDA);
    return { bytes: bytes.slice(), linhas };
  } catch (erro) {
    throw falha(erro);
  } finally {
    if (db) await db.terminate().catch(() => undefined);
  }
}
