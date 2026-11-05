import { useState, type FormEvent } from "react";
import { baixarArquivo } from "../geracao/baixarArquivo";

const LIMITE_VOLUME = 100 * 1024 * 1024;

export function GeracaoPage() {
  const [csvs, setCsvs] = useState<readonly File[]>([]);
  const [base, setBase] = useState<File | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState("");
  const [erro, setErro] = useState("");

  const volume =
    csvs.reduce((soma, arquivo) => soma + arquivo.size, 0) + (base?.size ?? 0);

  async function converter(evento: FormEvent) {
    evento.preventDefault();
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
      baixarArquivo(
        "movimentacoes.parquet",
        resultado.bytes,
        "application/octet-stream",
      );
      setPronto(
        `Pronto. ${resultado.linhas.toLocaleString("pt-BR")} registros. O download de movimentacoes.parquet começou.`,
      );
    } catch (falha) {
      setErro(
        falha instanceof Error
          ? falha.message
          : "Não foi possível converter no navegador.",
      );
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>No navegador</h2>
        <p>
          Envie os CSVs e baixe o Parquet. Os arquivos ficam neste navegador. Um
          ou dois meses cabem bem. O ano inteiro, cerca de 400 MB, pode falhar.
        </p>
        <form onSubmit={(evento) => void converter(evento)}>
          <label className="field" htmlFor="csvs-anac">
            CSVs mensais
            <input
              id="csvs-anac"
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={ocupado}
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
              id="parquet-base"
              type="file"
              accept=".parquet,application/octet-stream"
              disabled={ocupado}
              onChange={(evento) => {
                setBase(evento.target.files?.[0] ?? null);
                setPronto("");
                setErro("");
              }}
            />
          </label>
          <p>
            Se enviar um Parquet, o CSV de um mês entra no lugar desse mês. Os
            outros meses do Parquet permanecem.
          </p>
          {volume > LIMITE_VOLUME ? (
            <p>Esse volume pode falhar no navegador.</p>
          ) : null}
          <div className="actions">
            <button type="submit" disabled={ocupado}>
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
