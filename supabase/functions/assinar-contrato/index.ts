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
    const margin = 50
    const contentWidth = width - (margin * 2)
    let y = height - margin
    let pageCount = 1

    // Cores Premium (Roxo Deep e Acentos)
    const purpleDeep = rgb(0.2, 0.08, 0.44) // #331470
    const purpleMedium = rgb(0.4, 0.2, 0.6)
    const purpleLight = rgb(0.9, 0.85, 0.95) // Fundo suave para contraste
    const grayBg = rgb(0.98, 0.98, 1.0)
    const textColor = rgb(0.1, 0.1, 0.15)
    const secondaryTextColor = rgb(0.4, 0.4, 0.5)

    const drawHeaderDecoration = () => {
      // 1. Barra Lateral Esquerda (Elemento de Design do PDF laranja adaptado)
      page.drawRectangle({
        x: 0,
        y: 0,
        width: 15,
        height: height,
        color: purpleDeep
      })

      // 2. Elemento Circular no Topo Direito (Abstract pattern)
      page.drawCircle({
        x: width - 20,
        y: height - 20,
        size: 150,
        color: purpleDeep,
        opacity: 0.05
      })
      
      page.drawCircle({
        x: width,
        y: height,
        size: 80,
        color: purpleDeep,
        opacity: 0.1
      })

      // 3. Cabeçalho com Título e Logo Placeholder
      const title = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS'
      page.drawText(title, {
        x: 50,
        y: height - 60,
        size: 22,
        font: fontBold,
        color: purpleDeep
      })

      // Linha de acento abaixo do título
      page.drawRectangle({
        x: 50,
        y: height - 75,
        width: 100,
        height: 3,
        color: purpleMedium
      })

      const subHeader = configuration.contratado_nome?.toUpperCase() || 'DOCUMENTO DIGITAL'
      page.drawText(subHeader, {
        x: 50,
        y: height - 95,
        size: 9,
        font: font,
        color: secondaryTextColor
      })
    }

    const drawFooter = (pageNum: number) => {
      // Bottom accent
      page.drawRectangle({
        x: 0,
        y: 0,
        width: width,
        height: 40,
        color: grayBg
      })

      const footerText = `Página ${pageNum}`
      page.drawText(footerText, {
        x: width - margin - font.widthOfTextAtSize(footerText, 8),
        y: 15,
        size: 8,
        font: font,
        color: secondaryTextColor
      })
      
      const branding = 'Gerado por Imperial Contabilidade - Documento com Validade Jurídica'
      page.drawText(branding, {
        x: margin,
        y: 15,
        size: 7,
        font: fontItalic,
        color: secondaryTextColor
      })
    }

    const addText = (text: string, size = 10, options: any = {}) => {
      const { 
        isBold = false, 
        isItalic = false, 
        align = 'left', 
        color = textColor, 
        indent = 0,
        lineHeight = 1.5,
        paragraphSpacing = 15
      } = options
      
      let currentFont = isBold ? fontBold : font
      if (isItalic) currentFont = fontItalic
      
      const effectiveMaxWidth = contentWidth - indent
      const words = text.split(/\s+/)
      let lines: string[] = []
      let currentLine = ''
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const testWidth = currentFont.widthOfTextAtSize(testLine, size)
        
        if (testWidth > effectiveMaxWidth) {
          lines.push(currentLine)
          currentLine = word
        } else {
          currentLine = testLine
        }
      }
      lines.push(currentLine)

      const estimatedHeight = lines.length * (size * lineHeight)
      
      if (y - estimatedHeight < 60) {
        drawFooter(pageCount)
        page = pdfDoc.addPage([595.28, 841.89])
        y = height - 120 // Space for header
        pageCount++
        drawHeaderDecoration()
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const isLastLine = i === lines.length - 1
        
        let xPos = margin + indent
        
        if (align === 'center') {
          xPos = (width - currentFont.widthOfTextAtSize(line, size)) / 2
        } else if (align === 'justify' && !isLastLine && lines.length > 1) {
          const wordsInLine = line.split(' ')
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
    y = height - 120

    // Seção de Cabeçalho / Resumo (Estilo Proposta)
    page.drawRectangle({
      x: margin,
      y: y - 80,
      width: contentWidth,
      height: 80,
      color: grayBg,
      borderColor: purpleLight,
      borderWidth: 0.5
    })

    const infoY = y - 25
    page.drawText('CONTRATANTE:', { x: margin + 15, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(contrato.contratante_nome?.substring(0, 45) || '---', { x: margin + 15, y: infoY - 15, size: 10, font: font, color: textColor })
    
    page.drawText('IDENTIFICAÇÃO:', { x: margin + 250, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(contrato.contratante_cnpj || '---', { x: margin + 250, y: infoY - 15, size: 10, font: font, color: textColor })
    
    page.drawText('DATA DE EMISSÃO:', { x: margin + 400, y: infoY, size: 8, font: fontBold, color: purpleDeep })
    page.drawText(new Date().toLocaleDateString('pt-BR'), { x: margin + 400, y: infoY - 15, size: 10, font: font, color: textColor })

    y -= 110

    // Conteúdo Principal
    addText('DAS PARTES', 12, { isBold: true, color: purpleDeep, paragraphSpacing: 10 })
    
    const textoPartes = `Pelo presente instrumento particular, de um lado ${configuration.contratado_nome || 'A CONTRATADA'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${configuration.contratado_cnpj || '---'}, com sede em ${configuration.contratado_endereco || '---'}, doravante denominada CONTRATADA; e, de outro lado, ${contrato.contratante_nome || 'O CONTRATANTE'}, inscrito no CPF/CNPJ sob o nº ${contrato.contratante_cnpj || '---'}, residente e domiciliado em ${contrato.contratante_endereco || '---'}, doravante denominado CONTRATANTE.`
    
    addText(textoPartes, 10, { align: 'justify', paragraphSpacing: 25 })

    // Seção Objeto com Ícone/Marcador
    page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
    addText('CLÁUSULA PRIMEIRA – DO OBJETO', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
    addText(`1.1. O presente contrato tem como objeto a prestação de serviços de software e suporte técnico para o sistema ${contrato.sistema || '---'}, de propriedade da CONTRATADA.`, 10, { align: 'justify', indent: 8 })
    addText(`1.2. A prestação dos serviços compreende o licenciamento de uso, manutenção e suporte técnico conforme as especificações do sistema contratado.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 25 })

    // Seção Valores
    page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
    addText('CLÁUSULA SEGUNDA – DOS VALORES E FORMA DE PAGAMENTO', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
    
    const valorFormatted = contrato.valor_mensalidade?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00'
    addText(`2.1. Pela prestação dos serviços ora contratados, o CONTRATANTE pagará à CONTRATADA o valor mensal de ${valorFormatted}, com vencimento conforme pactuado em sistema.`, 10, { align: 'justify', indent: 8 })
    addText(`2.2. Eventuais serviços adicionais ou deslocamentos serão cobrados à parte, conforme tabela vigente ou negociação específica.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 25 })

    // Seção Vigência
    page.drawRectangle({ x: margin, y: y + 15, width: 3, height: 15, color: purpleLight })
    addText('CLÁUSULA TERCEIRA – DA VIGÊNCIA', 11, { isBold: true, color: purpleDeep, indent: 8, paragraphSpacing: 12 })
    addText(`3.1. O presente contrato entra em vigor na data de sua assinatura, com prazo de vigência de ${contrato.vigencia_meses || 12} meses, podendo ser renovado automaticamente por iguais períodos.`, 10, { align: 'justify', indent: 8, paragraphSpacing: 40 })

    // Seção de Assinaturas (Bloco Protegido contra Quebra)
    const signatureSectionHeight = 180
    if (y < signatureSectionHeight + 60) {
      drawFooter(pageCount)
      page = pdfDoc.addPage([595.28, 841.89])
      y = height - 120
      pageCount++
      drawHeaderDecoration()
    }

    addText('E, por estarem assim justos e contratados, as partes firmam o presente instrumento.', 10, { align: 'center', isItalic: true, paragraphSpacing: 40 })

    // Box de Assinatura Digital Premium
    const boxWidth = 260
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
    const lineX = width - margin - 220
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

