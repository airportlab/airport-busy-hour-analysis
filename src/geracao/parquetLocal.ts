const BANCO = "hora-pico";
const LOJA = "arquivos";
const CHAVE = "movimentacoes";

export type ParquetGuardado = {
  nome: string;
  blob: Blob;
  linhas: number | null;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(BANCO, 1);
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains(LOJA)) {
        banco.createObjectStore(LOJA);
      }
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => {
      reject(
        pedido.error ?? new Error("Não foi possível abrir o armazenamento local."),
      );
    };
  });
}

function executar<T>(
  modo: IDBTransactionMode,
  operar: (loja: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return abrir().then(
    (banco) =>
      new Promise<T>((resolve, reject) => {
        const transacao = banco.transaction(LOJA, modo);
        const pedido = operar(transacao.objectStore(LOJA));
        let concluido = false;
        const falhar = (erro: DOMException | null) => {
          if (concluido) return;
          concluido = true;
          banco.close();
          reject(
            erro ?? new Error("Não foi possível acessar o armazenamento local."),
          );
        };
        pedido.onsuccess = () => {
          if (concluido) return;
          concluido = true;
          resolve(pedido.result);
        };
        pedido.onerror = (evento) => {
          evento.preventDefault();
          falhar(pedido.error);
        };
        transacao.onabort = () => falhar(transacao.error);
        transacao.oncomplete = () => banco.close();
      }),
  );
}

function guardado(valor: unknown): ParquetGuardado | null {
  if (valor == null || typeof valor !== "object") return null;
  const item = valor as Partial<ParquetGuardado>;
  if (typeof item.nome !== "string" || !(item.blob instanceof Blob)) return null;
  if (item.linhas != null && typeof item.linhas !== "number") return null;
  return {
    nome: item.nome,
    blob: item.blob,
    linhas: item.linhas ?? null,
  };
}

export function lerParquetLocal(): Promise<ParquetGuardado | null> {
  return executar("readonly", (loja) => loja.get(CHAVE)).then(guardado);
}

export function gravarParquetLocal(registro: ParquetGuardado): Promise<void> {
  return executar("readwrite", (loja) => loja.put(registro, CHAVE)).then(
    () => undefined,
  );
}

export function apagarParquetLocal(): Promise<void> {
  return executar("readwrite", (loja) => loja.delete(CHAVE)).then(
    () => undefined,
  );
}
