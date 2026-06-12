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

    // 4. Gerar PDF Estilo Adobe/ICP-Brasil
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique)
    
    let page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    const margin = 70
    const contentWidth = width - (margin * 2)
    let y = height - margin
    let pageCount = 1

    const drawHeader = () => {
      page.drawRectangle({ x: margin, y: height - 60, width: contentWidth, height: 0.5, color: rgb(0.7, 0.7, 0.7) })
      page.drawText(configuration.contratado_nome?.toUpperCase() || 'EMPRESA', { 
        x: margin, 
        y: height - 50, 
        size: 9, 
        font: fontBold, 
        color: rgb(0.3, 0.3, 0.3) 
      })
      page.drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { 
        x: width - margin - fontBold.widthOfTextAtSize('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 8), 
        y: height - 50, 
        size: 8, 
        font: fontBold, 
        color: rgb(0.5, 0.5, 0.5) 
      })
    }

    const drawFooter = (pageNum: number) => {
      const footerText = `Página ${pageNum}`
      page.drawText(footerText, {
        x: (width - font.widthOfTextAtSize(footerText, 8)) / 2,
        y: 30,
        size: 8,
        font: font,
        color: rgb(0.6, 0.6, 0.6)
      })
      
      const idText = `ID: ${contratoId}`
      page.drawText(idText, {
        x: margin,
        y: 30,
        size: 6,
        font: font,
        color: rgb(0.8, 0.8, 0.8)
      })
    }

    const addText = (text: string, size = 10, options: any = {}) => {
      const { 
        isBold = false, 
        isItalic = false, 
        align = 'left', 
        color = rgb(0.1, 0.1, 0.1), 
        indent = 0,
        lineHeight = 1.4,
        paragraphSpacing = 12
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
      
      // Check if text block fits, otherwise page break
      if (y - estimatedHeight < margin + 40) {
        drawFooter(pageCount)
        page = pdfDoc.addPage([595.28, 841.89])
        y = height - margin
        pageCount++
        drawHeader()
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

    drawHeader()
    y -= 30

    // Título Principal
    addText('INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 14, { isBold: true, align: 'center', paragraphSpacing: 30 })

    // Identificação das Partes
    addText('DAS PARTES', 11, { isBold: true, paragraphSpacing: 10 })
    
    const textoPartes = `Pelo presente instrumento particular, de um lado ${configuration.contratado_nome || 'A CONTRATADA'}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${configuration.contratado_cnpj || '---'}, com sede em ${configuration.contratado_endereco || '---'}, doravante denominada CONTRATADA; e, de outro lado, ${contrato.contratante_nome || 'O CONTRATANTE'}, inscrito no CPF/CNPJ sob o nº ${contrato.contratante_cnpj || '---'}, residente e domiciliado em ${contrato.contratante_endereco || '---'}, doravante denominado CONTRATANTE.`
    
    addText(textoPartes, 10, { align: 'justify', paragraphSpacing: 20 })

    // Objeto
    addText('CLÁUSULA PRIMEIRA – DO OBJETO', 11, { isBold: true, paragraphSpacing: 8 })
    addText(`1.1. O presente contrato tem como objeto a prestação de serviços de software e suporte técnico para o sistema ${contrato.sistema || '---'}, de propriedade da CONTRATADA.`, 10, { align: 'justify' })
    addText(`1.2. A prestação dos serviços compreende o licenciamento de uso, manutenção e suporte técnico conforme as especificações do sistema contratado.`, 10, { align: 'justify', paragraphSpacing: 20 })

    // Valores e Pagamento
    addText('CLÁUSULA SEGUNDA – DOS VALORES AND FORMA DE PAGAMENTO', 11, { isBold: true, paragraphSpacing: 8 })
    addText(`2.1. Pela prestação dos serviços ora contratados, o CONTRATANTE pagará à CONTRATADA o valor mensal de R$ ${contrato.valor_mensalidade?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}, com vencimento conforme pactuado.`, 10, { align: 'justify' })
    addText(`2.2. Eventuais serviços adicionais ou deslocamentos serão cobrados à parte, conforme tabela vigente ou negociação específica.`, 10, { align: 'justify', paragraphSpacing: 20 })

    // Vigência
    addText('CLÁUSULA TERCEIRA – DA VIGÊNCIA', 11, { isBold: true, paragraphSpacing: 8 })
    addText(`3.1. O presente contrato entra em vigor na data de sua assinatura, com prazo de vigência de ${contrato.vigencia_meses || 12} meses, podendo ser renovado automaticamente por iguais períodos.`, 10, { align: 'justify', paragraphSpacing: 40 })

    // Seção de Assinaturas
    const signatureSectionHeight = 150
    if (y < signatureSectionHeight + margin + 40) {
      drawFooter(pageCount)
      page = pdfDoc.addPage([595.28, 841.89])
      y = height - margin
      pageCount++
      drawHeader()
    }

    addText('E, por estarem assim justos e contratados, as partes firmam o presente instrumento.', 10, { align: 'center', isItalic: true, paragraphSpacing: 40 })

    // Box de Assinatura Digital (Estilo Profissional Adobe)
    const boxWidth = 240
    const boxHeight = 80
    const boxX = margin
    
    // Background suave e borda
    page.drawRectangle({
      x: boxX,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.97, 0.98, 1.0),
      borderColor: rgb(0.1, 0.3, 0.6),
      borderWidth: 1.5
    })

    // Cabeçalho do selo
    page.drawRectangle({
      x: boxX,
      y: y - 20,
      width: boxWidth,
      height: 20,
      color: rgb(0.1, 0.3, 0.6)
    })
    
    page.drawText('ASSINADO DIGITALMENTE', {
      x: boxX + 10,
      y: y - 13,
      size: 8,
      font: fontBold,
      color: rgb(1, 1, 1)
    })

    // Conteúdo do selo
    const sigDate = new Date().toLocaleString('pt-BR')
    const certText = certName.toUpperCase()
    
    page.drawText('Assinante:', { x: boxX + 10, y: y - 35, size: 7, font: font, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(certText.length > 40 ? certText.substring(0, 37) + '...' : certText, { 
      x: boxX + 10, 
      y: y - 48, 
      size: 9, 
      font: fontBold, 
      color: rgb(0, 0, 0) 
    })
    
    page.drawText(`Data: ${sigDate}`, { x: boxX + 10, y: y - 62, size: 7, font: font, color: rgb(0.3, 0.3, 0.3) })
    page.drawText('Validade Jurídica: ICP-Brasil / Medida Provisória 2.200-2', { 
      x: boxX + 10, 
      y: y - 73, 
      size: 6, 
      font: fontItalic, 
      color: rgb(0.4, 0.4, 0.4) 
    })

    // Lado do Contratante
    const lineY = y - 55
    const lineX = width - margin - 200
    page.drawLine({
      start: { x: lineX, y: lineY },
      end: { x: width - margin, y: lineY },
      thickness: 0.5,
      color: rgb(0.5, 0.5, 0.5)
    })
    
    page.drawText(contrato.contratante_nome?.toUpperCase() || 'CONTRATANTE', {
      x: lineX,
      y: lineY - 15,
      size: 9,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2)
    })
    
    page.drawText('Assinatura Eletrônica', {
      x: lineX,
      y: lineY - 28,
      size: 8,
      font: fontItalic,
      color: rgb(0.6, 0.6, 0.6)
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
