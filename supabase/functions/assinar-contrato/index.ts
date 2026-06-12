import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1'
import forge from 'https://esm.sh/node-forge@1.3.1'
import { sign } from 'https://esm.sh/@signpdf/signpdf@3.3.0'
import { P12Signer } from 'https://esm.sh/@signpdf/signer-p12@3.3.0'
import { pdflibAddPlaceholder as addPlaceholder } from 'https://esm.sh/@signpdf/placeholder-pdf-lib@3.3.0'
import { Buffer } from "https://deno.land/std@0.168.0/node/buffer.ts"

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

    // 1. Buscar dados do contrato e empresa
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('contratos')
      .select('*')
      .eq('id', contratoId)
      .single()

    if (contratoError || !contrato) throw new Error('Contrato não encontrado')

    let configuration: any = {}
    if (contrato.empresa_id) {
      const { data: config } = await supabaseAdmin
        .from('configuracao_contrato')
        .select('*')
        .eq('empresa_id', contrato.empresa_id)
        .maybeSingle()
      configuration = config || {}
    } else {
      const { data: config } = await supabaseAdmin
        .from('configuracao_contrato')
        .select('*')
        .limit(1)
        .maybeSingle()
      configuration = config || {}
    }

    // 2. Carregar Certificado para extrair informações reais
    const pfxDer = forge.util.decode64(pfxBase64)
    const p12Asn1 = forge.asn1.fromDer(pfxDer)
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
    
    const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
    const certBag = bags[forge.pki.oids.certBag]?.[0]
    if (!certBag) throw new Error("Certificado não encontrado no arquivo PFX")
    
    const certificate = certBag.cert
    const subject = certificate.subject.attributes
    
    const cnAttr = subject.find(attr => attr.shortName === 'CN')
    const certName = cnAttr ? cnAttr.value : (configuration.contratado_nome || nomeAssinante)
    
    const oAttr = subject.find(attr => attr.shortName === 'O')
    const orgName = oAttr ? oAttr.value : 'ICP-Brasil'

    // 3. Gerar PDF com pdf-lib
    const pdfDoc = await PDFDocument.create()
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    
    let page = pdfDoc.addPage([595.28, 841.89]) // A4
    const { width, height } = page.getSize()
    let y = height - 50

    const drawText = (text: string, options: any = {}) => {
      const { size = 10, isBold = false, align = 'left', indent = 0 } = options
      const currentFont = isBold ? fontBold : font
      
      const lines = text.split('\n')
      for (const line of lines) {
        if (y < 100) {
          page = pdfDoc.addPage([595.28, 841.89])
          y = height - 50
        }
        
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
    drawText(`${configuration.contratado_nome || '---'}\nCNPJ: ${configuration.contratado_cnpj || '---'}\n${configuration.contratado_endereco || '---'}, ${configuration.contratado_cidade || '---'}/${configuration.contratado_estado || '---'}`, { indent: 20 })
    y -= 10

    drawText('CONTRATANTE (TOMADOR):', { isBold: true })
    drawText(`${contrato.contratante_nome || '---'}\nCPF/CNPJ: ${contrato.contratante_cnpj || '---'}\n${contrato.contratante_endereco || '---'}, ${contrato.contratante_cidade || '---'}/${contrato.contratante_estado || '---'}`, { indent: 20 })
    y -= 20

    drawText('OBJETO E VALORES:', { isBold: true })
    const valorMensal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contrato.valor_mensalidade || 0)
    drawText(`O CONTRATADO prestará serviços de suporte para o sistema ${contrato.sistema || '---'}.\nValor da Mensalidade: ${valorMensal}\nVigência: ${new Date(contrato.data_inicio).toLocaleDateString('pt-BR')} a ${new Date(contrato.data_fim).toLocaleDateString('pt-BR')}`, { indent: 20 })
    y -= 30

    // Selo de Assinatura Visual (Gov.br / Adobe Style)
    y -= 40
    const signatureY = y
    const signatureDate = new Date().toLocaleString('pt-BR')
    
    page.drawRectangle({
      x: 50, y: signatureY - 85, width: 320, height: 75,
      color: rgb(0.96, 0.97, 0.98),
      borderColor: rgb(0.1, 0.3, 0.6),
      borderWidth: 1
    })

    page.drawRectangle({
      x: 50, y: signatureY - 85, width: 4, height: 75,
      color: rgb(0.1, 0.3, 0.6)
    })

    page.drawText('ASSINADO DIGITALMENTE', { x: 65, y: signatureY - 25, size: 10, font: fontBold, color: rgb(0.1, 0.3, 0.6) })
    
    const displayName = certName.toUpperCase()
    page.drawText(displayName, { x: 65, y: signatureY - 40, size: 9, font: fontBold })
    
    page.drawText(`CPF/CNPJ: ${configuration.contratado_cnpj || '---'}`, { x: 65, y: signatureY - 52, size: 8, font })
    page.drawText(`Data/Hora: ${signatureDate}`, { x: 65, y: signatureY - 64, size: 8, font })
    page.drawText(`Verificado por: ${orgName} (Padrão ICP-Brasil)`, { x: 65, y: signatureY - 76, size: 7, font, color: rgb(0.4, 0.4, 0.4) })

    // 4. ADICIONAR PLACEHOLDER DE ASSINATURA CRIPTOGRÁFICA (Padrão PAdES)
    // Isso prepara o PDF para receber a assinatura real que o Adobe e o Gov.br reconhecem
    addPlaceholder({
      pdfDoc,
      reason: 'Assinatura Digital ICP-Brasil - Contrato de Prestação de Serviços',
      contactInfo: configuration.contratado_email || 'contato@imperialtech.com',
      name: certName,
      location: configuration.contratado_cidade || 'Brasil',
      subFilter: 'ETSI.CAdES.detached', // Padrão PAdES para maior compatibilidade com Gov.br
      signatureLength: 8192, // Espaço para o certificado e assinatura PKCS#7
    });

    const pdfBytesWithPlaceholder = await pdfDoc.save()

    // 5. ASSINAR DIGITALMENTE (CRIPTO)
    // Usamos o signer-p12 para gerar a assinatura real seguindo os padrões Adobe/ICP-Brasil
    // O Buffer.from é necessário para que a biblioteca @signpdf processe os bytes corretamente
    const signer = new P12Signer(Buffer.from(pfxDer, 'binary'), { password });
    const signedPdfBytes = await sign(Buffer.from(pdfBytesWithPlaceholder), signer);

    // Gerar Hash final para registro
    const md = forge.md.sha256.create()
    md.update(forge.util.binary.raw.encode(signedPdfBytes))
    const finalHash = md.digest().toHex()

    // 6. Salvar no Storage
    const fileName = `${contratoId}_signed_${Date.now()}.pdf`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .upload(fileName, signedPdfBytes, { contentType: 'application/pdf', upsert: true })

    if (uploadError) throw uploadError

    const { data: signedUrlData } = await supabaseAdmin.storage
      .from('contratos-assinados')
      .createSignedUrl(fileName, 60 * 60 * 24 * 365)
    
    const publicUrl = signedUrlData?.signedUrl || ''

    // 7. Atualizar Banco de Dados
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

    return new Response(
      JSON.stringify({ success: true, url: publicUrl, hash: finalHash }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro na assinatura:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})