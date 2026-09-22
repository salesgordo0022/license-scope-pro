// Leitura de boletos em PDF no navegador (pdf.js). A interpretação do texto
// fica em ./boletoParse para poder ser testada fora do browser.
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export * from "./boletoParse";

/**
 * Extrai a camada de texto de um PDF de boleto (no máximo 5 páginas).
 *
 * `isEvalSupported: false` desliga o uso de `eval` pelo pdf.js: os arquivos
 * vêm de upload do usuário e um PDF malicioso não deve conseguir executar
 * código no navegador de quem abre.
 *
 * Boletos escaneados não têm camada de texto e devolvem string vazia — quem
 * chama trata isso caindo para a identificação pelo nome do arquivo.
 */
export async function extrairTextoPdf(file: Blob): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
  const partes: string[] = [];
  const maxPaginas = Math.min(doc.numPages, 5);
  for (let i = 1; i <= maxPaginas; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let linha = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      linha += item.str;
      if (item.hasEOL) {
        partes.push(linha.trim());
        linha = "";
      } else {
        linha += " ";
      }
    }
    if (linha.trim()) partes.push(linha.trim());
  }
  await doc.destroy();
  return partes.join("\n");
}
