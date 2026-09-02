// Leitura de boletos em PDF no navegador (pdf.js). A interpretação do texto
// fica em ./boletoParse para poder ser testada fora do browser.
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export * from "./boletoParse";

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
