import { useEffect, useRef, useState, type FormEvent } from "react";
import { baixarArquivo } from "../geracao/baixarArquivo";
import {
  apagarParquetLocal,
  gravarParquetLocal,
  lerParquetLocal,
} from "../geracao/parquetLocal";

const LIMITE_VOLUME = 100 * 1024 * 1024;
const NOME_PARQUET = "movimentacoes.parquet";

function arquivoGerado(bytes: Uint8Array): File {
  const copia = bytes.slice();
  return new File([copia.buffer], NOME_PARQUET, {
    type: "application/octet-stream",
  });
}

export function GeracaoPage() {
  const [csvs, setCsvs] = useState<readonly File[]>([]);
  const [base, setBase] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [lendo, setLendo] = useState(true);
  const [pronto, setPronto] = useState("");
  const [erro, setErro] = useState("");
  const [chaveCsv, setChaveCsv] = useState(0);
  const [chaveBase, setChaveBase] = useState(0);
  const leituraVencida = useRef(false);
  const epoca = useRef(0);
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let ativo = true;
    void lerParquetLocal()
      .then((guardado) => {
        if (!ativo || leituraVencida.current || guardado == null) return;
        setBase(
          new File([guardado.blob], guardado.nome, {
            type: "application/octet-stream",
          }),
        );
      })
      .catch(() => {
        if (!ativo || leituraVencida.current) return;
        setErro("Não foi possível ler o Parquet guardado neste navegador.");
      })
      .finally(() => {
        if (ativo) setLendo(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  function enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    const proxima = fila.current.then(tarefa, tarefa);
    fila.current = proxima.then(
      () => undefined,
      () => undefined,
    );
    return proxima;
  }

  function reservarGravacao(): number {
    leituraVencida.current = true;
    epoca.current += 1;
    return epoca.current;
  }

  async function converter(evento: FormEvent) {
    evento.preventDefault();
    const marcaNoInicio = epoca.current;
    leituraVencida.current = true;
    setPronto("");
    setErro("");
    if (csvs.length === 0) {
      setErro("Informe ao menos um CSV.");
      return;
    }
    setOcupado(true);
    try {
      const { converterNoNavegador } = await import(
        "../geracao/converterNoNavegador"
      );
      const resultado = await converterNoNavegador(csvs, base);
      if (epoca.current !== marcaNoInicio) return;
      const marca = reservarGravacao();
      const arquivo = arquivoGerado(resultado.bytes);
      baixarArquivo(NOME_PARQUET, resultado.bytes, "application/octet-stream");
      const guardou = await enfileirar(async () => {
        if (epoca.current !== marca) return true;
        try {
          await gravarParquetLocal({
            nome: arquivo.name,
            blob: arquivo,
            linhas: resultado.linhas,
          });
          return true;
        } catch {
          return false;
        }
      });
      if (epoca.current !== marca) return;
      setBase(arquivo);
      setCsvs([]);
      setChaveCsv((valor) => valor + 1);
      setChaveBase((valor) => valor + 1);
      const registros = resultado.linhas.toLocaleString("pt-BR");
      setPronto(
        guardou
          ? `Pronto. ${registros} registros. O download de ${NOME_PARQUET} começou. Ele continua carregado neste navegador.`
          : `Pronto. ${registros} registros. O download de ${NOME_PARQUET} começou. Não foi possível guardá-lo para a próxima visita.`,
      );
    } catch (falha) {
      if (epoca.current !== marcaNoInicio) return;
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível converter no navegador.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function escolherBase(arquivo: File) {
    const marca = reservarGravacao();
    setPronto("");
    setErro("");
    setBase(arquivo);
    const guardou = await enfileirar(async () => {
      if (epoca.current !== marca) return true;
      try {
        await gravarParquetLocal({
          nome: arquivo.name,
          blob: arquivo,
          linhas: null,
        });
        return true;
      } catch {
        return false;
      }
    });
    if (epoca.current !== marca || guardou) return;
    setErro(
      "O arquivo entrou nesta visita, mas não foi possível guardá-lo para a próxima.",
    );
  }

  async function remover() {
    const marca = reservarGravacao();
    setPronto("");
    setErro("");
    setBase(null);
    setChaveBase((valor) => valor + 1);
    try {
      await enfileirar(async () => {
        if (epoca.current !== marca) return;
        await apagarParquetLocal();
      });
    } catch {
      if (epoca.current !== marca) return;
      setErro("Não foi possível remover o Parquet guardado neste navegador.");
    }
  }

  const volume =
    csvs.reduce((soma, arquivo) => soma + arquivo.size, 0) + (base?.size ?? 0);
  const travado = ocupado || lendo;

  return (
    <div className="stack">
      <section className="panel">
        <h2>No navegador</h2>
        <p>
          Envie os CSVs e baixe o Parquet. O arquivo gerado continua carregado
          neste navegador. Um ou dois meses cabem bem. O ano inteiro, cerca de
          400 MB, pode falhar.
        </p>
        <form onSubmit={(evento) => void converter(evento)}>
          <label className="field" htmlFor="csvs-anac">
            CSVs mensais
            <input
              key={chaveCsv}
              id="csvs-anac"
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={travado}
              onChange={(evento) => {
                setCsvs(Array.from(evento.target.files ?? []));
                setPronto("");
                setErro("");
              }}
            />
          </label>
          {csvs.length > 0 ? (
            <p>{csvs.map((arquivo) => arquivo.name).join(", ")}</p>
          ) : null}
          <label className="field" htmlFor="parquet-base">
            Parquet já gerado, opcional
            <input
              key={chaveBase}
              id="parquet-base"
              type="file"
              accept=".parquet,application/octet-stream"
              disabled={travado}
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0];
                if (arquivo == null) return;
                void escolherBase(arquivo);
              }}
            />
          </label>
          {base ? (
            <p>
              Carregado neste navegador: {base.name}.{" "}
              <button
                type="button"
                className="linkish"
                onClick={() => void remover()}
              >
                Remover
              </button>
            </p>
          ) : null}
          <p>
            Se enviar um Parquet, o CSV de um mês entra no lugar desse mês. Os
            outros meses do Parquet permanecem.
          </p>
          {volume > LIMITE_VOLUME ? (
            <p>Esse volume pode falhar no navegador.</p>
          ) : null}
          <div className="actions">
            <button type="submit" disabled={travado}>
              {ocupado ? "Convertendo…" : "Converter e baixar"}
            </button>
          </div>
          {pronto ? (
            <p className="status" role="status">
              {pronto}
            </p>
          ) : null}
          {erro ? (
            <p className="erro" role="alert">
              {erro}
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
