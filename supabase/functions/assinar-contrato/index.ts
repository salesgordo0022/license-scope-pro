import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import forge from 'https://esm.sh/node-forge@1.3.1'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import { autenticar, clientAdmin, ehAdmin, json, respostaPreflight } from '../_shared/auth.ts'

/**
 * Gera o PDF final de um contrato e o marca como assinado.
 *
 * A função usa a service role (ignora RLS) para ler o contrato e gravar o PDF
 * no bucket privado `contratos-assinados`. Por causa disso ela precisa checar
 * autorização por conta própria — é exatamente o que faltava antes: a versão
 * original não lia o header `Authorization`, então qualquer pessoa na internet
 * conseguia enviar um `contratoId` qualquer e ler/assinar contratos de qualquer
 * empresa.
 *
 * Regras aplicadas agora, nesta ordem:
 *  1. exige JWT válido;
 *  2. exige perfil admin ou super_admin;
 *  3. exige que o contrato pertença à empresa do usuário (super_admin escapa).
 *
 * ATENÇÃO (pendência de produto, não corrigida aqui): o PDF gerado NÃO recebe
 * assinatura criptográfica. O certificado .pfx é aberto apenas para extrair o
 * Common Name do titular e imprimi-lo no rodapé. Para valer como assinatura
 * digital ICP-Brasil o PDF precisa ser assinado no padrão PAdES/CAdES.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return respostaPreflight(req)

  try {
    // --- 1. Autenticação -------------------------------------------------
    const { auth, erro } = await autenticar(req)
    if (erro) return erro
    if (!ehAdmin(auth)) {
      return json(req, { success: false, error: 'Sem permissão para assinar contratos' }, 403)
    }

    const { contratoId, pfxBase64, password, nomeAssinante } = await req.json()

    if (!contratoId || typeof contratoId !== 'string') {
      return json(req, { success: false, error: 'contratoId é obrigatório' }, 400)
    }
    if (!pfxBase64 || !password) {
      return json(req, { success: false, error: 'Certificado e senha são obrigatórios' }, 400)
    }
    // O .pfx viaja em base64 no corpo da requisição; um limite evita que um
    // upload gigante consuma memória/CPU da function.
    if (typeof pfxBase64 !== 'string' || pfxBase64.length > 4 * 1024 * 1024) {
      return json(req, { success: false, error: 'Certificado inválido ou grande demais' }, 400)
    }

    const supabaseAdmin = clientAdmin()

    // --- 2. Carrega o contrato e confere a posse --------------------------
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('contratos')
      .select('*, empresa:empresas(*)')
      .eq('id', contratoId)
      .single()

    // Mensagem genérica de propósito: distinguir "não existe" de "não é seu"
    // deixaria enumerar IDs de contrato de outras empresas.
    if (contratoError || !contrato) {
      return json(req, { success: false, error: 'Contrato não encontrado' }, 404)
    }
    if (auth.tipo !== 'super_admin' && contrato.empresa_id !== auth.empresaId) {
      return json(req, { success: false, error: 'Contrato não encontrado' }, 404)
    }

    // --- 2b. Cláusulas que vão para o PDF --------------------------------
    //
    // Ordem de prioridade, e o motivo de cada passo:
    //
    //  1. `clausulas_snapshot` — se o contrato já foi assinado uma vez, o texto
    //     está congelado ali. Regerar o PDF tem que produzir o MESMO documento.
    //  2. `modelo_id` — o modelo que o usuário escolheu no formulário. Era o
    //     furo principal: a função pegava "o primeiro modelo ativo", então o
    //     PDF assinado podia sair com cláusulas diferentes das que apareceram
    //     na tela de revisão. Documento assinado divergente do revisado.
    //  3. Só se o contrato não tiver modelo definido, cai no modelo ativo da
    //     empresa — e nunca no de outra empresa.
    let clausulas: unknown = null

    if (Array.isArray(contrato.clausulas_snapshot) && contrato.clausulas_snapshot.length > 0) {
      clausulas = contrato.clausulas_snapshot
    } else if (contrato.modelo_id) {
      const { data: escolhido } = await supabaseAdmin
        .from('modelos_contrato')
        .select('clausulas, empresa_id')
        .eq('id', contrato.modelo_id)
        .maybeSingle()

      // Confere a posse: um modelo_id apontando para outra empresa (dado
      // antigo ou requisição adulterada) não pode vazar cláusulas alheias.
      const doTenant =
        !escolhido?.empresa_id || escolhido.empresa_id === contrato.empresa_id
      if (escolhido && doTenant) clausulas = escolhido.clausulas
    }

    if (!clausulas) {
      const filtroModelo = supabaseAdmin
        .from('modelos_contrato')
        .select('clausulas')
        .eq('ativo', true)
      const { data: padrao } = await (
        contrato.empresa_id
          ? filtroModelo.or(`empresa_id.eq.${contrato.empresa_id},empresa_id.is.null`)
          : filtroModelo.is('empresa_id', null)
      )
        .order('empresa_id', { nullsFirst: false })
        .limit(1)
        .maybeSingle()
      clausulas = padrao?.clausulas ?? null
    }

    const modelo = clausulas ? { clausulas } : null

    // Configurações visuais/cadastrais usadas no cabeçalho e rodapé do PDF.
    const { data: config } = await supabaseAdmin
      .from('configuracao_contrato')
      .select('*')
      .eq('empresa_id', contrato.empresa_id || '')
      .maybeSingle()

    const configuration = config || {}

    // 3. Processar Certificado com forge
    const pfxBytes = forge.util.decode64(pfxBase64)
    const p12Asn1 = forge.asn1.fromDer(pfxBytes)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag]?.[0]
    if (!certBag) throw new Error("Certificado inválido ou senha incorreta")
    
    const cnAttr = certBag.cert.subject.attributes.find((attr: any) => attr.shortName === 'CN')
    const certName = cnAttr ? cnAttr.value : (nomeAssinante || configuration.contratado_nome)

    // 4. Gerar PDF Estilo Moderno Premium (Adobe-like + Custom Design)
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
    
    // --- Logo da empresa no PDF ------------------------------------------
    //
    // O PDF assinado saía SEM logo nenhum: a função nunca chegou a embutir a
    // imagem, mesmo com `configuracao_contrato.logo_url` preenchido.
    //
    // A URL vem do banco, então é tratada como não confiável: só http(s), e
    // qualquer falha (host fora do ar, arquivo corrompido, formato exótico) é
    // engolida — um logo quebrado não pode impedir a emissão do contrato.
    let logoEmbutido: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null
    const logoUrl = String(configuration.logo_url || '')
    if (/^https?:\/\//i.test(logoUrl)) {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const resp = await fetch(logoUrl, { signal: ctrl.signal })
        clearTimeout(timer)

        if (resp.ok) {
          const bytes = new Uint8Array(await resp.arrayBuffer())
          // Teto de 5 MB: a imagem vai inteira para dentro do PDF.
          if (bytes.byteLength > 0 && bytes.byteLength <= 5 * 1024 * 1024) {
            const tipo = (resp.headers.get('content-type') || '').toLowerCase()
            logoEmbutido = tipo.includes('jpeg') || tipo.includes('jpg')
              ? await pdfDoc.embedJpg(bytes)
              : await pdfDoc.embedPng(bytes)
          }
        }
      } catch (e) {
        console.warn('[assinar-contrato] logo não pôde ser carregado:', e)
      }
    }

    let page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    // Reduzindo drasticamente as margens e ajustando o cálculo de largura útil
    const margin = 50 
    const footerHeight = 80 
    const contentWidth = width - (margin * 2)
    let y = height - margin

    let pageCount = 1
    const valorFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contrato.valor_mensalidade || 0)

    // Cores Premium
    const purpleDeep = rgb(0.2, 0.08, 0.44)
    const purpleMedium = rgb(0.4, 0.2, 0.6)
    const purpleLight = rgb(0.9, 0.85, 0.95)
    const grayBg = rgb(0.98, 0.98, 1.0)
    const textColor = rgb(0.1, 0.1, 0.15)
    const secondaryTextColor = rgb(0.4, 0.4, 0.5)

    const drawHeaderDecoration = () => {
      // Barra lateral fina na cor da marca — o mesmo detalhe que a
      // visualização em tela já tinha e o PDF não. Fica bem dentro da margem
      // para não correr risco de corte na impressão.
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 10,
        height,
        color: purpleDeep,
      })

      // Logo, quando a empresa tem uma configurada. É desenhado à esquerda, e o
      // título desce para não colidir. Se não houver logo, o título ocupa o
      // topo normalmente.
      const alturaLogo = logoEmbutido ? 34 : 0
      if (logoEmbutido) {
        const escala = alturaLogo / logoEmbutido.height
        page.drawImage(logoEmbutido, {
          x: margin,
          y: height - margin - alturaLogo,
          width: logoEmbutido.width * escala,
          height: alturaLogo,
        })
      }

      const topoTitulo = height - margin - alturaLogo - (logoEmbutido ? 26 : 30)

      const title = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'
      page.drawText(title, {
        x: margin,
        y: topoTitulo,
        size: 16,
        font: fontBold,
        color: purpleDeep
      })

      // Linha de acento abaixo do título
      page.drawRectangle({
        x: margin,
        y: topoTitulo - 15,
        width: 100,
        height: 2,
        color: purpleMedium
      })

      const subHeader = (configuration.contratado_nome || 'DOCUMENTO DIGITAL').toUpperCase()
      page.drawText(subHeader, {
        x: margin,
        y: topoTitulo - 35,
        size: 9,
        font: font,
        color: secondaryTextColor
      })
    }

    const drawFooter = (pageNum: number) => {
      // Background do rodapé - Posicionado de forma segura
      page.drawRectangle({
        x: margin,
        y: 30,
        width: contentWidth,
        height: 25,
        color: grayBg
      })

      const footerText = `Página ${pageNum}`
      page.drawText(footerText, {
        x: width - margin - font.widthOfTextAtSize(footerText, 8),
        y: 38,
        size: 8,
        font: font,
        color: secondaryTextColor
      })
      
      const branding = 'Gerado por Imperial Contabilidade - Documento com Validade Jurídica'
      page.drawText(branding, {
        x: margin + 10,
        y: 38,
        size: 7,
        font: fontItalic,
        color: secondaryTextColor
      })
    }

    const addText = (text: string, size = 10, options: any = {}) => {
      if (!text) return;
      const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const paragraphs = normalizedText.split('\n');
      
      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          y -= (size * 0.6); 
          continue;
        }
        processParagraph(paragraph, size, options);
      }
    }

    const processParagraph = (text: string, size = 10, options: any = {}) => {
      const { 
        isBold = false, 
        isItalic = false, 
        align = 'left', 
        color = textColor, 
        indent = 0,
        lineHeight = 1.3,
        paragraphSpacing = 8
      } = options
      
      let currentFont = isBold ? fontBold : font
      if (isItalic) currentFont = fontItalic
      
      const effectiveMaxWidth = contentWidth - indent - 5 // Buffer mínimo
      
      // Improved word wrapping for long strings without spaces
      const wrapText = (txt: string, maxWidth: number) => {
        const words = txt.split(/\s+/)
        let lines: string[] = []
        let currentLine = ''
        
        for (const word of words) {
          const testLine = currentLine ? `${currentLine} ${word}` : word
          const testWidth = currentFont.widthOfTextAtSize(testLine, size)
          
          if (testWidth > maxWidth) {
            // Handle extremely long words (like long URLs or hashes)
            if (currentFont.widthOfTextAtSize(word, size) > maxWidth) {
              if (currentLine) lines.push(currentLine)
              
              let remainingWord = word
              while (currentFont.widthOfTextAtSize(remainingWord, size) > maxWidth) {
                let charCount = 1
                while (currentFont.widthOfTextAtSize(remainingWord.substring(0, charCount + 1), size) <= maxWidth) {
                  charCount++
                }
                lines.push(remainingWord.substring(0, charCount))
                remainingWord = remainingWord.substring(charCount)
              }
              currentLine = remainingWord
            } else {
              lines.push(currentLine)
              currentLine = word
            }
          } else {
            currentLine = testLine
          }
        }
        if (currentLine) lines.push(currentLine)
        return lines
      }

      const lines = wrapText(text, effectiveMaxWidth)

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        
        if (y - (size * lineHeight) < footerHeight) {
          drawFooter(pageCount)
          page = pdfDoc.addPage([595.28, 841.89])
          pageCount++
          drawHeaderDecoration()
          y = height - margin - 140
        }

        const isLastLine = i === lines.length - 1
        let xPos = margin + indent
        
        if (align === 'center') {
          xPos = margin + indent + (effectiveMaxWidth - currentFont.widthOfTextAtSize(line, size)) / 2
        } else if (align === 'justify' && !isLastLine && lines.length > 1) {
          const wordsInLine = line.trim().split(/\s+/)
          if (wordsInLine.length > 1) {
            const lineTextNoSpaces = wordsInLine.join('')
            const textWidth = currentFont.widthOfTextAtSize(lineTextNoSpaces, size)
            const totalSpaceWidth = effectiveMaxWidth - textWidth
            const wordSpacing = totalSpaceWidth / (wordsInLine.length - 1)
            
            let currentX = xPos
            for (let j = 0; j < wordsInLine.length; j++) {
              page.drawText(wordsInLine[j], { x: currentX, y, size, font: currentFont, color })
              currentX += currentFont.widthOfTextAtSize(wordsInLine[j], size) + wordSpacing
            }
            y -= (size * lineHeight)
            continue
          }
        }
        
        page.drawText(line, { x: xPos, y, size, font: currentFont, color })
        y -= (size * lineHeight)
      }
      
      y -= paragraphSpacing
    }

    drawHeaderDecoration()
    y = height - margin - 140 // Espaço após o cabeçalho inicial


    // Seção de Cabeçalho / Resumo (Estilo Proposta - Tabela limpa)
    page.drawRectangle({
      x: margin,
      y: y - 70,
      width: contentWidth,
      height: 70,
      color: purpleLight,
      opacity: 0.3
    })

    const col1 = margin + 15
    const col2 = margin + (contentWidth * 0.45)
    const col3 = margin + (contentWidth * 0.75)
    const infoY = y - 25

    page.drawText('CONTRATANTE', { x: col1, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(contrato.contratante_nome?.substring(0, 40) || '---', { x: col1, y: infoY - 15, size: 10, font: font, color: textColor })
    
    page.drawText('CNPJ/CPF', { x: col2, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(contrato.contratante_cnpj || '---', { x: col2, y: infoY - 15, size: 10, font: font, color: textColor })
    
    page.drawText('EMISSÃO', { x: col3, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(new Date().toLocaleDateString('pt-BR'), { x: col3, y: infoY - 15, size: 10, font: font, color: textColor })

    y -= 100

    // Conteúdo Principal
    addText('DAS PARTES', 12, { isBold: true, color: purpleDeep, paragraphSpacing: 10 })
    
    const donoNomeC = (contrato as any).contratante_nome_dono || ''
    const donoCpfC = (contrato as any).contratante_cpf_dono || ''
    const textoPartes = `Pelo presente instrumento particular, de um lado ${configuration.contratado_nome || 'A CONTRATADA'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${configuration.contratado_cnpj || '---'}, com sede em ${configuration.contratado_endereco || '---'}, doravante denominada CONTRATADA; e, de outro lado, ${donoNomeC || 'O CONTRATANTE'}, inscrito no CPF sob o nº ${donoCpfC || '---'}, representante da empresa ${contrato.contratante_nome || '---'}, com sede em ${contrato.contratante_endereco || '---'}, doravante denominado CONTRATANTE.`
    
    addText(textoPartes, 10, { align: 'justify', paragraphSpacing: 25 })

    // Seção Dinâmica de Cláusulas do Modelo
    if (modelo && Array.isArray(modelo.clausulas)) {
      for (const clausula of modelo.clausulas) {
        // Garantir que o título e pelo menos o início do parágrafo caibam na página
        if (y < footerHeight + 40) { 
          drawFooter(pageCount)
          page = pdfDoc.addPage([595.28, 841.89])
          pageCount++
          drawHeaderDecoration()
          y = height - margin - 140

        }



        page.drawRectangle({ x: margin, y: y - 10, width: 3, height: 15, color: purpleMedium })
        addText(clausula.titulo.toUpperCase(), 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 10 }) // Reduzido paragraphSpacing para 10
        
        // Substituir variáveis no conteúdo
        let conteudo = clausula.conteudo || ''
        conteudo = conteudo.replace(/{{sistema}}/g, contrato.sistema || '---')
        conteudo = conteudo.replace(/{{valor_mensalidade}}/g, valorFormatted)
        conteudo = conteudo.replace(/{{vigencia_meses}}/g, contrato.vigencia_meses?.toString() || '12')
        conteudo = conteudo.replace(/{{contratante_nome}}/g, contrato.contratante_nome || '---')
        conteudo = conteudo.replace(/{{contratante_cnpj}}/g, contrato.contratante_cnpj || '---')
        conteudo = conteudo.replace(/{{data_inicio}}/g, new Date(contrato.data_inicio).toLocaleDateString('pt-BR'))
        conteudo = conteudo.replace(/{{data_fim}}/g, contrato.data_fim ? new Date(contrato.data_fim).toLocaleDateString('pt-BR') : '---')
        
        addText(conteudo, 10, { align: 'justify', indent: 8, paragraphSpacing: 25 })
      }
    } else {
      // Fallback para cláusulas padrão se não houver modelo
      page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
      addText('CLÁUSULA PRIMEIRA – DO OBJETO', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
      addText(`1.1. O presente contrato tem como objeto a prestação de serviços de software e suporte técnico para o sistema ${contrato.sistema || '---'}, de propriedade da CONTRATADA.`, 10, { align: 'justify', indent: 8 })
      addText(`1.2. A prestação dos serviços compreende o licenciamento de uso, manutenção e suporte técnico conforme as especificações do sistema contratado.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 25 })

      // Seção Valores
      page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
      addText('CLÁUSULA SEGUNDA – DOS VALORES E FORMA DE PAGAMENTO', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
      
      addText(`2.1. Pela prestação dos serviços ora contratados, o CONTRATANTE pagará à CONTRATADA o valor mensal de ${valorFormatted}, com vencimento conforme pactuado em sistema.`, 10, { align: 'justify', indent: 8 })
      addText(`2.2. Eventuais serviços adicionais ou deslocamentos serão cobrados à parte, conforme tabela vigente ou negociação específica.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 25 })

      // Seção Vigência
      page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
      addText('CLÁUSULA TERCEIRA – DA VIGÊNCIA', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
      addText(`3.1. O presente contrato entra em vigor na data de sua assinatura, com prazo de vigência de ${contrato.vigencia_meses || 12} meses, podendo ser renovado automaticamente por iguais períodos.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 40 })
    }

    // Seção de Assinaturas (Bloco Protegido contra Quebra)
    const signatureSectionHeight = 180
    if (y < footerHeight + signatureSectionHeight) { 
      drawFooter(pageCount)
      page = pdfDoc.addPage([595.28, 841.89])
      y = height - margin - 140
      pageCount++

      drawHeaderDecoration()
    }


    addText('E, por estarem assim justos e contratados, as partes firmam o presente instrumento.', 10, { align: 'center', isItalic: true, paragraphSpacing: 40 })

    // Box de Assinatura Digital Premium
    const boxWidth = 240 // Reduzido
    const boxHeight = 100
    const boxX = margin
    
    // Sombra suave / Background
    page.drawRectangle({
      x: boxX,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: grayBg,
      borderColor: purpleDeep,
      borderWidth: 1
    })

    // Header do Selo de Assinatura
    page.drawRectangle({
      x: boxX,
      y: y - 25,
      width: boxWidth,
      height: 25,
      color: purpleDeep
    })
    
    page.drawText('✓ ASSINADO DIGITALMENTE', {
      x: boxX + 15,
      y: y - 17,
      size: 9,
      font: fontBold,
      color: rgb(1, 1, 1)
    })

    const sigDate = new Date().toLocaleString('pt-BR')
    const certText = certName.toUpperCase()
    
    page.drawText('ASSINANTE:', { x: boxX + 15, y: y - 40, size: 7, font: font, color: secondaryTextColor })
    page.drawText(certText.length > 35 ? certText.substring(0, 32) + '...' : certText, { 
      x: boxX + 15, 
      y: y - 55, 
      size: 10, 
      font: fontBold, 
      color: textColor 
    })
    
    page.drawText(`DATA: ${sigDate}`, { x: boxX + 15, y: y - 72, size: 7, font: font, color: secondaryTextColor })
    // O texto anterior aqui era "VALIDADE JURÍDICA: ICP-BRASIL / MP 2.200-2".
    // Isso era falso: o PDF não recebe assinatura criptográfica nenhuma — o
    // certificado só é aberto para ler o nome do titular. Afirmar conformidade
    // com a MP 2.200-2 num documento que não a tem é um risco jurídico real,
    // então o rótulo passou a descrever o que de fato acontece.
    page.drawText('ASSINATURA ELETRÔNICA SIMPLES — TITULAR IDENTIFICADO POR CERTIFICADO', {
      x: boxX + 15,
      y: y - 88,
      size: 6,
      font: fontBold,
      color: purpleLight
    })

    // Lado do Contratante
    const lineY = y - 60
    const sigLineWidth = 160 // Reduzido
    const lineX = width - margin - sigLineWidth
    page.drawLine({
      start: { x: lineX, y: lineY },
      end: { x: width - margin, y: lineY },
      thickness: 1,
      color: purpleLight
    })
    
    page.drawText(contrato.contratante_nome?.toUpperCase() || 'CONTRATANTE', {
      x: lineX,
      y: lineY - 15,
      size: 9,
      font: fontBold,
      color: textColor
    })
    
    page.drawText('ASSINATURA ELETRÔNICA', {
      x: lineX,
      y: lineY - 28,
      size: 8,
      font: font,
      color: secondaryTextColor
    })

    drawFooter(pageCount)

    const pdfBytes = await pdfDoc.save()
    // O arquivo fica na pasta da empresa para que a policy de Storage consiga
    // isolar por tenant (antes ia na raiz do bucket, sem como separar).
    const fileName = `${contrato.empresa_id}/contrato_${contratoId}_final.pdf`

    // --- 5. Upload e finalização -----------------------------------------
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    // URL assinada de 7 dias. Antes era de 1 ano (31536000s) e ficava salva em
    // `contratos.link_documento`: quem conseguisse ler a linha (ou um backup,
    // ou um log) tinha acesso ao PDF por 12 meses, sem passar por autenticação.
    const VALIDADE_LINK_SEGUNDOS = 60 * 60 * 24 * 7
    const { data: urlData } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .createSignedUrl(fileName, VALIDADE_LINK_SEGUNDOS)

    const signedUrl = urlData?.signedUrl || ''

    // Persistimos o CAMINHO no bucket, não a URL temporária. O frontend gera
    // uma URL assinada curta na hora de abrir o PDF. `link_documento` fica
    // intocado porque é um campo livre onde o usuário cola links externos
    // (Google Drive etc.) — sobrescrevê-lo apagava o dado dele.
    //
    // `clausulas_snapshot` congela o texto assinado. Sem isso, editar o modelo
    // depois reescreveria o conteúdo de todos os contratos já assinados que
    // apontam para ele. Só é gravado na PRIMEIRA assinatura: o trigger
    // `contrato_assinado_imutavel` recusa qualquer alteração posterior.
    const atualizacao: Record<string, unknown> = {
      assinado: true,
      data_assinatura: new Date().toISOString(),
      documento_path: fileName,
      is_digital_sign: true,
    }
    if (!contrato.assinado && clausulas) {
      atualizacao.clausulas_snapshot = clausulas
      atualizacao.snapshot_gerado_em = new Date().toISOString()
    }

    const { error: updateError } = await supabaseAdmin
      .from('contratos')
      .update(atualizacao)
      .eq('id', contratoId)

    // O trigger de imutabilidade pode recusar a gravação (ex.: tentativa de
    // reassinar um contrato já fechado). Avisar é melhor que devolver sucesso
    // com o banco inalterado.
    if (updateError) {
      console.error('[assinar-contrato] update recusado:', updateError)
      return json(req, { success: false, error: updateError.message }, 409)
    }

    return json(req, { success: true, url: signedUrl, path: fileName })

  } catch (error) {
    // Log completo fica no servidor; o cliente recebe mensagem genérica para
    // não vazar detalhes internos (nomes de tabela, stack, erro do Storage).
    console.error('[assinar-contrato] erro:', error)
    return json(req, { success: false, error: 'Falha ao gerar o contrato assinado' }, 500)
  }
})

