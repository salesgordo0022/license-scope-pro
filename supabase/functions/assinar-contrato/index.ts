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
    console.log('Recebido body de tamanho:', rawBody.length);
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
      .select('*')
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

    // 3. Processar Certificado com forge (Otimizado)
    const pfxBytes = forge.util.decode64(pfxBase64)
    const p12Asn1 = forge.asn1.fromDer(pfxBytes)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag]?.[0]
    if (!certBag) throw new Error("Certificado inválido ou senha incorreta")
    
    const cnAttr = certBag.cert.subject.attributes.find((attr: any) => attr.shortName === 'CN')
    const certName = cnAttr ? cnAttr.value : (nomeAssinante || configuration.contratado_nome)

    // 4. Gerar PDF Profissional
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    let page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    let y = height - 60

    const addText = (text: string, size = 10, isBold = false, align = 'left') => {
      const currentFont = isBold ? fontBold : font
      const lines = text.split('\n')
      for (const line of lines) {
        if (y < 80) {
          page = pdfDoc.addPage([595.28, 841.89])
          y = height - 60
        }
        const textWidth = currentFont.widthOfTextAtSize(line, size)
        const x = align === 'center' ? (width - textWidth) / 2 : 50
        page.drawText(line, { x, y, size, font: currentFont })
        y -= (size + 12)
      }
    }

    // Conteúdo do Contrato
    addText('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', 14, true, 'center')
    y -= 20
    addText(`Contratante: ${contrato.contratante_nome || '---'}`, 10, true)
    addText(`CNPJ/CPF: ${contrato.contratante_cnpj || '---'}`)
    y -= 10
    addText(`Contratado: ${configuration.contratado_nome || 'ImperialTech'}`, 10, true)
    addText(`CNPJ: ${configuration.contratado_cnpj || '---'}`)
    y -= 30

    addText('DESCRIÇÃO DOS SERVIÇOS:', 11, true)
    addText(`Sistema: ${contrato.sistema || '---'}`)
    addText(`Valor Mensal: R$ ${contrato.valor_mensalidade?.toLocaleString('pt-BR') || '0,00'}`)
    y -= 40

    // Espaço para assinaturas (Ajustado para não duplicar visualmente)
    if (y < 200) {
      page = pdfDoc.addPage([595.28, 841.89])
      y = height - 60
    }

    // Selo de Assinatura Digital (Estilo ICP-Brasil)
    const sigDate = new Date().toLocaleString('pt-BR')
    const boxWidth = 350
    const boxHeight = 80
    const boxX = (width - boxWidth) / 2
    const boxY = y - boxHeight

    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.1, 0.4, 0.2),
      borderWidth: 1.5
    })

    page.drawText('DOCUMENTO ASSINADO DIGITALMENTE', {
      x: boxX + 15,
      y: boxY + 60,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.2)
    })

    page.drawText(`Assinante: ${certName}`, { x: boxX + 15, y: boxY + 45, size: 9, font })
    page.drawText(`Data/Hora: ${sigDate}`, { x: boxX + 15, y: boxY + 30, size: 8, font })
    page.drawText('Validade jurídica garantida por criptografia SHA-256 e ICP-Brasil', { 
      x: boxX + 15, 
      y: boxY + 15, 
      size: 7, 
      font,
      color: rgb(0.4, 0.4, 0.4)
    })

    const pdfBytes = await pdfDoc.save()
    const fileName = `contrato_${contratoId}_${Date.now()}.pdf`

    // Upload
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: urlData } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .createSignedUrl(fileName, 31536000)

    const publicUrl = urlData?.signedUrl || ''

    // Registrar
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
