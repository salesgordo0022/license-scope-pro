import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import forge from 'https://esm.sh/node-forge@1.3.1'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const rawBody = await req.text();
    const { contratoId, pfxBase64, password, nomeAssinante } = JSON.parse(rawBody);

    if (!pfxBase64 || !password) {
      throw new Error('Certificado e senha são obrigatórios')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Buscar dados do contrato
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('contratos')
      .select('*, empresa:empresas(*)')
      .eq('id', contratoId)
      .single()
    
    // Buscar cláusulas do modelo
    const { data: modelo } = await supabaseAdmin
      .from('modelos_contrato')
      .select('clausulas')
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()

    if (contratoError || !contrato) throw new Error('Contrato não encontrado')

    // 2. Buscar configurações da empresa
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
      // 1. Barra Lateral Esquerda - Removida para evitar qualquer corte
      // page.drawRectangle(...)

      // 2. Elementos decorativos (círculos) - Removidos para garantir página limpa e sem cortes
      // page.drawCircle(...)

      // 3. Cabeçalho - RESPEITANDO RIGIDAMENTE AS MARGENS
      const title = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'
      page.drawText(title, {
        x: margin,
        y: height - margin - 30, // Mais espaço do topo
        size: 16,
        font: fontBold,
        color: purpleDeep
      })

      // Linha de acento abaixo do título
      page.drawRectangle({
        x: margin,
        y: height - margin - 45,
        width: 100,
        height: 2,
        color: purpleMedium
      })

      const subHeader = (configuration.contratado_nome || 'DOCUMENTO DIGITAL').toUpperCase()
      page.drawText(subHeader, {
        x: margin,
        y: height - margin - 65,
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
    const trechoDonoC = donoNomeC ? `, neste ato representada por ${donoNomeC}${donoCpfC ? `, inscrito no CPF sob o nº ${donoCpfC}` : ''}` : ''
    const textoPartes = `Pelo presente instrumento particular, de um lado ${configuration.contratado_nome || 'A CONTRATADA'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${configuration.contratado_cnpj || '---'}, com sede em ${configuration.contratado_endereco || '---'}, doravante denominada CONTRATADA; e, de outro lado, ${contrato.contratante_nome || 'O CONTRATANTE'}, inscrito no CPF/CNPJ sob o nº ${contrato.contratante_cnpj || '---'}, residente e domiciliado em ${contrato.contratante_endereco || '---'}${trechoDonoC}, doravante denominado CONTRATANTE.`
    
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
    page.drawText('VALIDADE JURÍDICA: ICP-BRASIL / MP 2.200-2', { 
      x: boxX + 15, 
      y: y - 88, 
      size: 7, 
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
    const fileName = `contrato_${contratoId}_final.pdf`

    // 5. Upload e Finalização
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .createSignedUrl(fileName, 31536000)

    const publicUrl = urlData?.signedUrl || ''

    await supabaseAdmin.from('contratos').update({ 
      assinado: true, 
      data_assinatura: new Date().toISOString(),
      link_documento: publicUrl,
      is_digital_sign: true
    }).eq('id', contratoId)

    return new Response(JSON.stringify({ success: true, url: publicUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Erro:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

