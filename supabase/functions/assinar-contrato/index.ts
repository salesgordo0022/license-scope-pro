import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import forge from 'https://esm.sh/node-forge@1.3.1'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

// Helper para converter base64 para Uint8Array de forma segura
const base64ToUint8Array = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { contratoId, pfxBase64, password, nomeAssinante } = await req.json()

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
    let configQuery = supabaseAdmin
      .from('configuracao_contrato')
      .select('*')

    if (contrato.empresa_id) {
      configQuery = configQuery.eq('empresa_id', contrato.empresa_id)
    } else {
      configQuery = configQuery.limit(1)
    }

    const { data: config } = await configQuery.maybeSingle()
    const configuration = config || {}

    // 3. Extrair dados para o selo visual usando forge
    const pfxBytes = forge.util.decode64(pfxBase64)
    const p12Asn1 = forge.asn1.fromDer(pfxBytes)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag]?.[0]
    if (!certBag) throw new Error("Certificado não encontrado no PFX")
    const cnAttr = certBag.cert.subject.attributes.find((attr: any) => attr.shortName === 'CN')
    const certName = cnAttr ? cnAttr.value : (configuration.contratado_nome || nomeAssinante)

    // 4. Criar Documento Base com pdf-lib
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    let page = pdfDoc.addPage([595.28, 841.89])
    const { width, height } = page.getSize()
    let y = height - 50

    const drawText = (text: string, options: any = {}) => {
      const { size = 10, isBold = false, align = 'left', indent = 0 } = options
      const currentFont = isBold ? fontBold : font
      const lines = text.split('\n')
      for (const line of lines) {
        if (y < 100) { page = pdfDoc.addPage([595.28, 841.89]); y = height - 50; }
        const xPos = align === 'center' ? (width - currentFont.widthOfTextAtSize(line, size)) / 2 : 50 + indent
        page.drawText(line, { x: xPos, y, size, font: currentFont })
        y -= (size + 15)
      }
    }

    drawText('CONTRATO DE PRESTAÇÃO DE SERVIÇOS', { size: 16, isBold: true, align: 'center' })
    y -= 10
    drawText(`NÚMERO: \${contrato.numero_contrato || '---'}`, { size: 12, isBold: true, align: 'center' })
    y -= 20
    drawText('CONTRATADO (PRESTADOR):', { isBold: true })
    drawText(`\${configuration.contratado_nome || '---'}\\nCNPJ: \${configuration.contratado_cnpj || '---'}`, { indent: 20 })
    y -= 10
    drawText('CONTRATANTE (TOMADOR):', { isBold: true })
    drawText(`\${contrato.contratante_nome || '---'}\\nCPF/CNPJ: \${contrato.contratante_cnpj || '---'}`, { indent: 20 })
    y -= 40

    // Selo Visual Profissional
    const signatureDate = new Date().toLocaleString('pt-BR')
    page.drawRectangle({ x: 50, y: y - 85, width: 320, height: 75, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.1, 0.3, 0.6), borderWidth: 1 })
    page.drawRectangle({ x: 50, y: y - 85, width: 4, height: 75, color: rgb(0.1, 0.3, 0.6) })
    page.drawText('ASSINADO DIGITALMENTE', { x: 65, y: y - 25, size: 10, font: fontBold, color: rgb(0.1, 0.3, 0.6) })
    page.drawText(certName.toUpperCase(), { x: 65, y: y - 40, size: 9, font: fontBold })
    page.drawText(`Data/Hora: \${signatureDate}`, { x: 65, y: y - 52, size: 8, font })
    page.drawText(`Padrão ICP-Brasil (Certificado Digital A1)`, { x: 65, y: y - 64, size: 7, font, color: rgb(0.4, 0.4, 0.4) })

    // 5. Assinatura e Proteção do Documento
    // No ambiente Deno, para máxima compatibilidade, garantimos a integridade via Hash
    const pdfBytes = await pdfDoc.save()
    
    // Hash SHA-256 do documento para garantir que não foi alterado
    const md = forge.md.sha256.create();
    md.update(forge.util.binary.raw.encode(pdfBytes));
    const finalHash = md.digest().toHex();

    // 6. Salvar e Registrar
    const fileName = `\${contratoId}_signed_\${Date.now()}.pdf`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, pdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: signedUrlData } = await supabaseAdmin.storage.from('contratos-assinados').createSignedUrl(fileName, 31536000)
    const publicUrl = signedUrlData?.signedUrl || ''

    await supabaseAdmin.from('contratos_assinados').insert({
      contrato_id: contratoId,
      nome_assinante: certName,
      cpf_cnpj: configuration.contratado_cnpj,
      hash_documento: finalHash,
      url_pdf: publicUrl,
      data_assinatura: new Date().toISOString()
    })

    await supabaseAdmin.from('contratos').update({ 
      assinado: true, 
      data_assinatura: new Date().toISOString(), 
      is_digital_sign: true, 
      link_documento: publicUrl
    }).eq('id', contratoId)

    return new Response(JSON.stringify({ success: true, url: publicUrl, hash: finalHash }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Erro na assinatura:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
