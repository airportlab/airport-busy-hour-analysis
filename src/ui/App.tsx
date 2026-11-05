import { useState } from "react";
import "./app.css";

const CAPACITY_REPO = "https://github.com/airportlab/airport-capacity";
const CC0_DEED_URL =
  "https://creativecommons.org/publicdomain/zero/1.0/deed.pt_BR";
const OFL_LICENSE_URL =
  "https://github.com/IBM/plex/blob/master/LICENSE.txt";

const UNOFFICIAL_NOTICE =
  "Ferramenta não oficial. Não substitui o PEA, a ANAC nem um estudo assinado.";

type Section = "estudo" | "metodos" | "parquet" | "sobre";

const TABS: readonly { id: Exclude<Section, "sobre">; label: string }[] = [
  { id: "estudo", label: "Estudo" },
  { id: "metodos", label: "Métodos" },
  { id: "parquet", label: "Parquet" },
];

const METHODS: readonly { title: string; text: string }[] = [
  {
    title: "30ª hora-relógio",
    text: "Hora cheia do calendário, ranqueada no período. É a hora que o projeto de capacidade aeroportuária grava no componente.",
  },
  {
    title: "1ª hora",
    text: "A hora cheia mais carregada do mesmo período. É o topo da curva.",
  },
  {
    title: "Hora móvel",
    text: "Janela de 60 minutos que pode começar em qualquer instante, não só na hora cheia.",
  },
  {
    title: "Fluxos separados",
    text: "Cada fluxo — origem, destino e conexão — com a sua própria 30ª hora.",
  },
  {
    title: "Dia médio do mês-pico",
    text: "Hora cheia mais alta do dia médio do mês de maior movimento.",
  },
  {
    title: "Fator sobre o anual",
    text: "Passageiros do período multiplicados por um fator de hora-pico.",
  },
];

const PARQUET_COLUMNS: readonly { name: string; text: string }[] = [
  { name: "DT_CALCO", text: "Data do calço." },
  { name: "HH_CALCO", text: "Hora do calço." },
  { name: "QT_PAX_LOCAL", text: "Passageiros locais do movimento." },
  {
    name: "QT_PAX_CONEXAO_DOMESTICO",
    text: "Passageiros em conexão doméstica.",
  },
  {
    name: "QT_PAX_CONEXAO_INTERNACIONAL",
    text: "Passageiros em conexão internacional.",
  },
  {
    name: "NR_AEROPORTO_REFERENCIA",
    text: "ICAO do aeroporto de referência, como SBSG ou SBGR.",
  },
  { name: "NR_MOVIMENTO_TIPO", text: "D para embarque e P para chegada." },
  { name: "NR_NATUREZA", text: "D para doméstico e I para internacional." },
  {
    name: "NR_BOX",
    text: "Posição. Entra quando a hora é filtrada por box.",
  },
  {
    name: "NR_TERMINAL",
    text: "Terminal. Entra quando a hora é filtrada por terminal.",
  },
];

export function App() {
  const [section, setSection] = useState<Section>("estudo");
  const viewingAbout = section === "sobre";

  return (
    <main>
      <div className="page">
        <header className={viewingAbout ? "hero hero-about" : "hero"}>
          <div className="kicker kicker-row">
            {viewingAbout ? (
              <button
                type="button"
                className="kicker-home"
                onClick={() => setSection("estudo")}
              >
                Hora-pico de projeto
              </button>
            ) : (
              <span>Hora-pico de projeto</span>
            )}
            <button
              type="button"
              className="linkish kicker-about"
              aria-current={viewingAbout ? "page" : undefined}
              onClick={() => setSection("sobre")}
            >
              Sobre
            </button>
          </div>
          {viewingAbout ? null : (
            <>
              <h1>Estudo da demanda da hora-pico</h1>
              <p className="lede">
                Continuação do estudo de capacidade aeroportuária. A hora usada
                lá é a 30ª hora-relógio.
              </p>
              <p className="lede">{UNOFFICIAL_NOTICE}</p>
            </>
          )}
        </header>

        {viewingAbout ? (
          <AboutPage onBack={() => setSection("estudo")} />
        ) : (
          <>
            <nav className="tabs" aria-label="Seções do estudo">
              <div className="tabs-pinned">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={section === tab.id ? "tab active" : "tab"}
                    aria-current={section === tab.id ? "page" : undefined}
                    onClick={() => setSection(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
            {section === "estudo" ? <EstudoPage /> : null}
            {section === "metodos" ? <MetodosPage /> : null}
            {section === "parquet" ? <ParquetPage /> : null}
          </>
        )}
      </div>
    </main>
  );
}

function EstudoPage() {
  return (
    <div className="stack">
      <section className="panel">
        <h2>O que é este site</h2>
        <p>
          Este site estuda a demanda da hora-pico e acompanha o{" "}
          <a href={CAPACITY_REPO}>projeto de capacidade aeroportuária</a>. O
          cálculo dos métodos ainda não está nesta página.
        </p>
        <p>
          Lá, um arquivo <code>.parquet</code> de movimentação entra na aba DHP.
          O período são os últimos 12 meses completos do aeroporto. A hora
          gravada no componente é a 30ª hora-relógio.
        </p>
      </section>
    </div>
  );
}

function MetodosPage() {
  return (
    <div className="stack">
      <section className="panel">
        <h2>Métodos</h2>
        <p>
          Os nomes abaixo são o mapa do estudo. Nesta etapa nenhum deles é
          calculado.
        </p>
        <ul>
          {METHODS.map((method) => (
            <li key={method.title}>
              <strong>{method.title}.</strong> {method.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ParquetPage() {
  return (
    <div className="stack">
      <section className="panel">
        <h2>Arquivo de movimentação</h2>
        <p>
          O outro projeto lê o arquivo como <code>movimentacoes.parquet</code>.
          As colunas abaixo são as que ele espera. A geração do arquivo ainda
          não está neste site.
        </p>
        <ul>
          {PARQUET_COLUMNS.map((column) => (
            <li key={column.name}>
              <code>{column.name}</code> — {column.text}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <div className="about-page">
      <header className="about-intro">
        <h1>Sobre</h1>
      </header>
      <section className="panel">
        <h2>Continuação</h2>
        <p>
          Este site estuda a hora-pico usada em{" "}
          <a href={CAPACITY_REPO}>capacidade aeroportuária</a>.
        </p>
        <p>{UNOFFICIAL_NOTICE}</p>
      </section>
      <section className="panel">
        <h2>Licença</h2>
        <p>
          O software deste repositório está sob{" "}
          <a href={CC0_DEED_URL}>CC0 1.0</a>. As fontes IBM Plex Sans e IBM Plex
          Serif permanecem sob a{" "}
          <a href={OFL_LICENSE_URL}>SIL Open Font License 1.1</a>.
        </p>
        <p>
          O software é oferecido como está, sem garantia de adequação a um fim
          específico.
        </p>
      </section>
      <div className="actions about-back">
        <button type="button" className="ghost" onClick={onBack}>
          Voltar ao estudo
        </button>
      </div>
    </div>
  );
}
