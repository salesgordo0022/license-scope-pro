import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDF, P12Signer } from 'https://esm.sh/@libpdf/core@0.3.6'
import forge from 'https://esm.sh/node-forge@1.3.1'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { data: config } = await supabaseAdmin
      .from('configuracao_contrato')
      .select('*')
      .eq('empresa_id', contrato.empresa_id)
      .maybeSingle()
    const configuration = config || {}

    // 3. Extrair dados para o selo visual usando forge (mais confiável para extração)
    const pfxBytes = forge.util.decode64(pfxBase64)
    const p12Asn1 = forge.asn1.fromDer(pfxBytes)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag]?.[0]
    if (!certBag) throw new Error("Certificado não encontrado no PFX")
    const cnAttr = certBag.cert.subject.attributes.find((attr: any) => attr.shortName === 'CN')
    const certName = cnAttr ? cnAttr.value : (configuration.contratado_nome || nomeAssinante)

    // 4. Criar Documento Base com pdf-lib (Para o conteúdo e selo visual)
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
    drawText(`NÚMERO: ${contrato.numero_contrato || '---'}`, { size: 12, isBold: true, align: 'center' })
    y -= 20
    drawText('CONTRATADO (PRESTADOR):', { isBold: true })
    drawText(`${configuration.contratado_nome || '---'}\nCNPJ: ${configuration.contratado_cnpj || '---'}`, { indent: 20 })
    y -= 10
    drawText('CONTRATANTE (TOMADOR):', { isBold: true })
    drawText(`${contrato.contratante_nome || '---'}\nCPF/CNPJ: ${contrato.contratante_cnpj || '---'}`, { indent: 20 })
    y -= 40

    // Selo Visual Profissional
    const signatureDate = new Date().toLocaleString('pt-BR')
    page.drawRectangle({ x: 50, y: y - 85, width: 320, height: 75, color: rgb(0.96, 0.97, 0.98), borderColor: rgb(0.1, 0.3, 0.6), borderWidth: 1 })
    page.drawRectangle({ x: 50, y: y - 85, width: 4, height: 75, color: rgb(0.1, 0.3, 0.6) })
    page.drawText('ASSINADO DIGITALMENTE', { x: 65, y: y - 25, size: 10, font: fontBold, color: rgb(0.1, 0.3, 0.6) })
    page.drawText(certName.toUpperCase(), { x: 65, y: y - 40, size: 9, font: fontBold })
    page.drawText(`Data/Hora: ${signatureDate}`, { x: 65, y: y - 52, size: 8, font })
    page.drawText(`Padrão ICP-Brasil (Autenticidade Adobe Acrobat)`, { x: 65, y: y - 64, size: 7, font, color: rgb(0.4, 0.4, 0.4) })

    const pdfBaseBytes = await pdfDoc.save()

    // 5. Assinatura Criptográfica PAdES com @libpdf/core (Padrão Adobe/Gov.br)
    const signer = await P12Signer.create(new Uint8Array(pfxBytes), password);
    const pdfLibpdf = await PDF.load(pdfBaseBytes);
    
    // Assina o PDF (isso gera uma assinatura invisível porém válida criptograficamente para o Adobe/Gov.br)
    const signedPdfBytes = await pdfLibpdf.sign({ 
      signer,
      reason: 'Assinatura Digital ICP-Brasil',
      contactInfo: configuration.contratado_email || 'contato@imperialtech.com',
      location: configuration.contratado_cidade || 'Brasil'
    });

    // 6. Salvar e Registrar
    const fileName = `${contratoId}_signed_${Date.now()}.pdf`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, signedPdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: signedUrlData } = await supabaseAdmin.storage.from('contratos-assinados').createSignedUrl(fileName, 31536000)
    const publicUrl = signedUrlData?.signedUrl || ''

    // Hash final para auditoria
    const md = forge.md.sha256.create(); md.update(forge.util.binary.raw.encode(signedPdfBytes));
    const finalHash = md.digest().toHex();

    await supabaseAdmin.from('contratos_assinados').insert({
      contrato_id: contratoId, nome_assinante: certName, cpf_cnpj: configuration.contratado_cnpj,
      hash_documento: finalHash, url_pdf: publicUrl, data_assinatura: new Date().toISOString()
    })

    await supabaseAdmin.from('contratos').update({ 
      assinado: true, data_assinatura: new Date().toISOString(), is_digital_sign: true, link_documento: publicUrl
    }).eq('id', contratoId)

    return new Response(JSON.stringify({ success: true, url: publicUrl, hash: finalHash }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('Erro na assinatura:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})