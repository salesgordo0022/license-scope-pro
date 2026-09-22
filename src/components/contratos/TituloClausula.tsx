/**
 * Título padronizado de cláusula do contrato.
 *
 * Antes cada cláusula tinha o seu próprio estilo: a primeira usava um selo
 * numerado roxo e as nove seguintes eram texto preto com um filete cinza. O
 * documento parecia meio desenhado. Centralizar aqui garante que uma cláusula
 * nova nasça igual às outras — e que ajustar o visual seja mexer num lugar só.
 *
 * O `numero` é texto (não número) porque vai impresso com zero à esquerda:
 * "01", "02"… "10".
 */
export function TituloClausula({ numero, titulo }: { numero: string; titulo: string }) {
  return (
    <h2
      className="mb-4 flex items-center gap-3"
      // `break-after: avoid` impede que a quebra de página caia entre o título
      // e o primeiro parágrafo da cláusula — um título órfão no pé da folha é
      // o tipo de detalhe que faz o contrato impresso parecer amador.
      style={{ breakAfter: 'avoid', pageBreakAfter: 'avoid' }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white"
        style={{ background: '#331470' }}
      >
        {numero}
      </span>
      <span
        className="text-[10.5pt] font-bold uppercase leading-tight"
        style={{ color: '#331470', letterSpacing: '0.02em' }}
      >
        {titulo}
      </span>
      {/* Filete que ocupa o espaço restante da linha, para o título não ficar
          solto no meio do branco. */}
      <span className="h-px flex-1" style={{ background: '#33147026' }} />
    </h2>
  );
}

export default TituloClausula;
