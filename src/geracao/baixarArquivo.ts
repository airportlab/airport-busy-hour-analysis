export function baixarArquivo(
  nome: string,
  conteudo: string | Uint8Array,
  tipo: string,
): void {
  const blob =
    typeof conteudo === "string"
      ? new Blob([conteudo], { type: tipo })
      : new Blob([conteudo.slice().buffer], { type: tipo });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
