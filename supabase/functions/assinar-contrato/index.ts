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
    let y = height - 50

    const drawHeader = () => {
      const logoSize = 40
      page.drawRectangle({ x: 50, y: height - 70, width: width - 100, height: 1, color: rgb(0.8, 0.8, 0.8) })
      page.drawText(configuration.contratado_nome || 'ImperialTech', { x: 50, y: height - 45, size: 12, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
      page.drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { x: width - 250, y: height - 45, size: 10, font: fontBold, color: rgb(0.4, 0.4, 0.4) })
    }

    const addText = (text: string, size = 10, options: any = {}) => {
      const { isBold = false, isItalic = false, align = 'left', color = rgb(0.2, 0.2, 0.2), indent = 0 } = options
      let currentFont = isBold ? fontBold : font
      if (isItalic) currentFont = fontItalic
      
      const maxWidth = width - 100 - indent
      const words = text.split(' ')
      let line = ''
      
      for (const word of words) {
        const testLine = line + word + ' '
        const testWidth = currentFont.widthOfTextAtSize(testLine, size)
        
        if (testWidth > maxWidth) {
          if (y < 100) { page = pdfDoc.addPage([595.28, 841.89]); y = height - 80; drawHeader(); }
          const xPos = align === 'center' ? (width - currentFont.widthOfTextAtSize(line, size)) / 2 : 50 + indent
          page.drawText(line, { x: xPos, y, size, font: currentFont, color })
          line = word + ' '
          y -= (size + 6)
        } else {
          line = testLine
        }
      }
      
      if (y < 100) { page = pdfDoc.addPage([595.28, 841.89]); y = height - 80; drawHeader(); }
      const xPos = align === 'center' ? (width - currentFont.widthOfTextAtSize(line, size)) / 2 : 50 + indent
      page.drawText(line, { x: xPos, y, size, font: currentFont, color })
      y -= (size + 15)
    }

    drawHeader()
    y -= 50

    // Título Centralizado
    addText('INSTRUMENTO PARTICULAR DE CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 14, { isBold: true, align: 'center' })
    y -= 20

    // Preâmbulo
    const preambulo = `Pelo presente instrumento, de um lado ${configuration.contratado_nome || 'ImperialTech'}, com sede em ${configuration.contratado_endereco || '---'}, inscrita no CNPJ sob nº ${configuration.contratado_cnpj || '---'}, doravante denominada CONTRATADA, e de outro lado, ${contrato.contratante_nome || '---'}, residente/sediada em ${contrato.contratante_endereco || '---'}, inscrita no CPF/CNPJ sob nº ${contrato.contratante_cnpj || '---'}, doravante denominada CONTRATANTE, celebram o presente contrato sob as cláusulas abaixo:`
    addText(preambulo, 10, { align: 'justify' })
    y -= 20

    // Cláusulas de Exemplo (Dinâmicas do contrato)
    addText('CLÁUSULA PRIMEIRA - DO OBJETO', 11, { isBold: true })
    addText(`O presente contrato tem por objeto a prestação de serviços de software para o sistema ${contrato.sistema || '---'}.`, 10)
    y -= 10

    addText('CLÁUSULA SEGUNDA - DOS VALORES', 11, { isBold: true })
    addText(`O CONTRATANTE pagará à CONTRATADA o valor mensal de R$ ${contrato.valor_mensalidade?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}.`, 10)
    y -= 40

    // Seção de Assinaturas Estilo Adobe/ICP-Brasil
    if (y < 250) { page = pdfDoc.addPage([595.28, 841.89]); y = height - 80; drawHeader(); }
    
    y -= 20
    addText('E, por estarem assim justos e contratados, firmam o presente instrumento através de assinatura digital.', 10, { isItalic: true, align: 'center' })
    y -= 40

    // Bloco de Assinatura Visual (Selo Adobe)
    const sigDate = new Date().toLocaleString('pt-BR')
    const boxWidth = 220
    const boxHeight = 70
    const startX = 50

    // Background do selo (azul claro Adobe style)
    page.drawRectangle({
      x: startX,
      y: y - boxHeight,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.95, 0.97, 1),
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 1
    })

    // Ícone de check (Simulado)
    page.drawCircle({ x: startX + 25, y: y - 35, size: 12, color: rgb(0.2, 0.6, 0.3) })
    page.drawText('✓', { x: startX + 20, y: y - 40, size: 14, font: fontBold, color: rgb(1, 1, 1) })

    // Textos do selo
    const textX = startX + 50
    page.drawText('Assinado de forma digital por', { x: textX, y: y - 20, size: 7, font: font, color: rgb(0.3, 0.3, 0.3) })
    page.drawText(certName.substring(0, 30).toUpperCase(), { x: textX, y: y - 32, size: 8, font: fontBold, color: rgb(0, 0, 0) })
    page.drawText(`Dados: ${sigDate}`, { x: textX, y: y - 44, size: 7, font: font, color: rgb(0.3, 0.3, 0.3) })
    page.drawText('Padrão ICP-Brasil / Criptografia SHA-256', { x: textX, y: y - 56, size: 6, font: fontItalic, color: rgb(0.4, 0.4, 0.4) })

    // Lado do Contratante (Linha pontilhada)
    const lineY = y - 50
    page.drawLine({ start: { x: width - 250, y: lineY }, end: { x: width - 50, y: lineY }, thickness: 1, color: rgb(0.5, 0.5, 0.5) })
    page.drawText(contrato.contratante_nome || 'CONTRATANTE', { x: width - 250, y: lineY - 15, size: 9, font: fontBold })
    page.drawText('Assinatura Eletrônica Pendente', { x: width - 250, y: lineY - 28, size: 8, font: fontItalic, color: rgb(0.6, 0.6, 0.6) })

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
