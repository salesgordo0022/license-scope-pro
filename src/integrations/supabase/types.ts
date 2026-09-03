export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cliente_modulos: {
        Row: {
          cliente_id: string
          created_at: string | null
          id: string
          modulo_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          id?: string
          modulo_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          id?: string
          modulo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_modulos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_modulos_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          cpf_dono: string | null
          created_at: string | null
          data_entrada: string | null
          desconto_percentual: number | null
          email: string | null
          empresa_id: string | null
          endereco: string | null
          estado: string | null
          grupo_id: string | null
          id: string
          nome_dono: string | null
          nome_empresa: string
          observacoes: string | null
          regime_tributario: string | null
          segmento: string | null
          status: Database["public"]["Enums"]["status_type"] | null
          telefone: string | null
          valor_implantacao: number | null
          valor_mensalidade: number | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          cpf_dono?: string | null
          created_at?: string | null
          data_entrada?: string | null
          desconto_percentual?: number | null
          email?: string | null
          empresa_id?: string | null
          endereco?: string | null
          estado?: string | null
          grupo_id?: string | null
          id?: string
          nome_dono?: string | null
          nome_empresa: string
          observacoes?: string | null
          regime_tributario?: string | null
          segmento?: string | null
          status?: Database["public"]["Enums"]["status_type"] | null
          telefone?: string | null
          valor_implantacao?: number | null
          valor_mensalidade?: number | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          cpf_dono?: string | null
          created_at?: string | null
          data_entrada?: string | null
          desconto_percentual?: number | null
          email?: string | null
          empresa_id?: string | null
          endereco?: string | null
          estado?: string | null
          grupo_id?: string | null
          id?: string
          nome_dono?: string | null
          nome_empresa?: string
          observacoes?: string | null
          regime_tributario?: string | null
          segmento?: string | null
          status?: Database["public"]["Enums"]["status_type"] | null
          telefone?: string | null
          valor_implantacao?: number | null
          valor_mensalidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracao_contrato: {
        Row: {
          clausulas_adicionais: string | null
          contratado_cidade: string | null
          contratado_cnpj: string | null
          contratado_email: string | null
          contratado_endereco: string | null
          contratado_estado: string | null
          contratado_nome: string | null
          contratado_telefone: string | null
          created_at: string
          empresa_id: string | null
          foro_comarca: string | null
          horario_atendimento: string | null
          id: string
          indice_reajuste: string | null
          logo_url: string | null
          mostrar_marca_dagua: boolean
          prazo_aviso_rescisao: number | null
          updated_at: string
        }
        Insert: {
          clausulas_adicionais?: string | null
          contratado_cidade?: string | null
          contratado_cnpj?: string | null
          contratado_email?: string | null
          contratado_endereco?: string | null
          contratado_estado?: string | null
          contratado_nome?: string | null
          contratado_telefone?: string | null
          created_at?: string
          empresa_id?: string | null
          foro_comarca?: string | null
          horario_atendimento?: string | null
          id?: string
          indice_reajuste?: string | null
          logo_url?: string | null
          mostrar_marca_dagua?: boolean
          prazo_aviso_rescisao?: number | null
          updated_at?: string
        }
        Update: {
          clausulas_adicionais?: string | null
          contratado_cidade?: string | null
          contratado_cnpj?: string | null
          contratado_email?: string | null
          contratado_endereco?: string | null
          contratado_estado?: string | null
          contratado_nome?: string | null
          contratado_telefone?: string | null
          created_at?: string
          empresa_id?: string | null
          foro_comarca?: string | null
          horario_atendimento?: string | null
          id?: string
          indice_reajuste?: string | null
          logo_url?: string | null
          mostrar_marca_dagua?: boolean
          prazo_aviso_rescisao?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuracao_contrato_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          assinado: boolean | null
          cliente_id: string
          contratante_cidade: string | null
          contratante_cnpj: string | null
          contratante_cpf_dono: string | null
          contratante_endereco: string | null
          contratante_estado: string | null
          contratante_nome: string | null
          contratante_nome_dono: string | null
          created_at: string
          data_assinatura: string | null
          data_fim: string | null
          data_inicio: string
          empresa_id: string | null
          id: string
          is_digital_sign: boolean | null
          link_documento: string | null
          numero_contrato: string | null
          observacoes: string | null
          quantidade_licencas: number | null
          sistema: string | null
          status: string
          updated_at: string
          valor_km_deslocamento: number | null
          valor_mensalidade: number | null
          valor_software: number | null
          vigencia_meses: number | null
        }
        Insert: {
          assinado?: boolean | null
          cliente_id: string
          contratante_cidade?: string | null
          contratante_cnpj?: string | null
          contratante_cpf_dono?: string | null
          contratante_endereco?: string | null
          contratante_estado?: string | null
          contratante_nome?: string | null
          contratante_nome_dono?: string | null
          created_at?: string
          data_assinatura?: string | null
          data_fim?: string | null
          data_inicio?: string
          empresa_id?: string | null
          id?: string
          is_digital_sign?: boolean | null
          link_documento?: string | null
          numero_contrato?: string | null
          observacoes?: string | null
          quantidade_licencas?: number | null
          sistema?: string | null
          status?: string
          updated_at?: string
          valor_km_deslocamento?: number | null
          valor_mensalidade?: number | null
          valor_software?: number | null
          vigencia_meses?: number | null
        }
        Update: {
          assinado?: boolean | null
          cliente_id?: string
          contratante_cidade?: string | null
          contratante_cnpj?: string | null
          contratante_cpf_dono?: string | null
          contratante_endereco?: string | null
          contratante_estado?: string | null
          contratante_nome?: string | null
          contratante_nome_dono?: string | null
          created_at?: string
          data_assinatura?: string | null
          data_fim?: string | null
          data_inicio?: string
          empresa_id?: string | null
          id?: string
          is_digital_sign?: boolean | null
          link_documento?: string | null
          numero_contrato?: string | null
          observacoes?: string | null
          quantidade_licencas?: number | null
          sistema?: string | null
          status?: string
          updated_at?: string
          valor_km_deslocamento?: number | null
          valor_mensalidade?: number | null
          valor_software?: number | null
          vigencia_meses?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos_assinados: {
        Row: {
          contrato_id: string
          cpf_cnpj: string
          created_at: string | null
          data_assinatura: string | null
          hash_documento: string
          id: string
          nome_assinante: string
          url_pdf: string
        }
        Insert: {
          contrato_id: string
          cpf_cnpj: string
          created_at?: string | null
          data_assinatura?: string | null
          hash_documento: string
          id?: string
          nome_assinante: string
          url_pdf: string
        }
        Update: {
          contrato_id?: string
          cpf_cnpj?: string
          created_at?: string | null
          data_assinatura?: string | null
          hash_documento?: string
          id?: string
          nome_assinante?: string
          url_pdf?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_assinados_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          created_at: string | null
          id: string
          nome: string
          plano_id: string | null
          status: Database["public"]["Enums"]["status_type"] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome: string
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_type"] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string
          plano_id?: string | null
          status?: Database["public"]["Enums"]["status_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "empresas_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_clientes: {
        Row: {
          cor: string | null
          created_at: string
          descricao: string | null
          empresa_id: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          cor?: string | null
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_empresa"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      implantacao_checklist: {
        Row: {
          concluido: boolean | null
          created_at: string
          descricao: string
          id: string
          implantacao_id: string
          ordem: number | null
        }
        Insert: {
          concluido?: boolean | null
          created_at?: string
          descricao: string
          id?: string
          implantacao_id: string
          ordem?: number | null
        }
        Update: {
          concluido?: boolean | null
          created_at?: string
          descricao?: string
          id?: string
          implantacao_id?: string
          ordem?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "implantacao_checklist_implantacao_id_fkey"
            columns: ["implantacao_id"]
            isOneToOne: false
            referencedRelation: "implantacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      implantacao_comentarios: {
        Row: {
          created_at: string
          id: string
          implantacao_id: string
          texto: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          implantacao_id: string
          texto: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          implantacao_id?: string
          texto?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "implantacao_comentarios_implantacao_id_fkey"
            columns: ["implantacao_id"]
            isOneToOne: false
            referencedRelation: "implantacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacao_comentarios_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      implantacao_historico: {
        Row: {
          acao: string
          created_at: string
          id: string
          implantacao_id: string
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          id?: string
          implantacao_id: string
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          id?: string
          implantacao_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "implantacao_historico_implantacao_id_fkey"
            columns: ["implantacao_id"]
            isOneToOne: false
            referencedRelation: "implantacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacao_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      implantacoes: {
        Row: {
          cliente_id: string
          created_at: string
          data_meta: string | null
          data_prazo: string | null
          descricao: string | null
          empresa_id: string | null
          id: string
          prioridade: string
          progresso: number | null
          responsavel_id: string | null
          status: string
          titulo: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          data_meta?: string | null
          data_prazo?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          prioridade?: string
          progresso?: number | null
          responsavel_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          data_meta?: string | null
          data_prazo?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          prioridade?: string
          progresso?: number | null
          responsavel_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "implantacoes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "implantacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "usuario_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      licencas: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_inicio: string | null
          data_pagamento_sistema: string | null
          dia_vencimento: number | null
          empresa_id: string | null
          id: string
          modelo_cobranca: string
          quantidade: number | null
          status: Database["public"]["Enums"]["status_type"] | null
          tipo: string
          validade: string | null
          valor_custo: number | null
          valor_venda: number | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_inicio?: string | null
          data_pagamento_sistema?: string | null
          dia_vencimento?: number | null
          empresa_id?: string | null
          id?: string
          modelo_cobranca?: string
          quantidade?: number | null
          status?: Database["public"]["Enums"]["status_type"] | null
          tipo: string
          validade?: string | null
          valor_custo?: number | null
          valor_venda?: number | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_inicio?: string | null
          data_pagamento_sistema?: string | null
          dia_vencimento?: number | null
          empresa_id?: string | null
          id?: string
          modelo_cobranca?: string
          quantidade?: number | null
          status?: Database["public"]["Enums"]["status_type"] | null
          tipo?: string
          validade?: string | null
          valor_custo?: number | null
          valor_venda?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licencas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licencas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_enviadas: {
        Row: {
          cliente_id: string | null
          created_at: string
          empresa_id: string | null
          erro: string | null
          id: string
          mensagem: string
          status: string
          telefone: string
          tipo: string
          usuario_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string | null
          erro?: string | null
          id?: string
          mensagem: string
          status?: string
          telefone: string
          tipo?: string
          usuario_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string | null
          erro?: string | null
          id?: string
          mensagem?: string
          status?: string
          telefone?: string
          tipo?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      metas_vendas: {
        Row: {
          cliente_cnpj: string | null
          cliente_contato: string | null
          cliente_id: string | null
          cliente_nome: string | null
          created_at: string
          data_fim: string
          data_inicio: string
          descricao: string | null
          empresa_id: string | null
          id: string
          status: string
          tipo: string
          titulo: string
          updated_at: string
          valor_atual: number
          valor_meta: number
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_contato?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          data_fim: string
          data_inicio?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          status?: string
          tipo?: string
          titulo: string
          updated_at?: string
          valor_atual?: number
          valor_meta?: number
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_contato?: string | null
          cliente_id?: string | null
          cliente_nome?: string | null
          created_at?: string
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          status?: string
          tipo?: string
          titulo?: string
          updated_at?: string
          valor_atual?: number
          valor_meta?: number
        }
        Relationships: [
          {
            foreignKeyName: "metas_vendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_contrato: {
        Row: {
          ativo: boolean | null
          clausulas: Json
          created_at: string
          descricao: string | null
          empresa_id: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean | null
          clausulas?: Json
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean | null
          clausulas?: Json
          created_at?: string
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_contrato_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      modulos: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          cliente_id: string
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string
          desconto: number | null
          empresa_id: string | null
          id: string
          metodo_pagamento: string | null
          observacoes: string | null
          referencia_ano: number | null
          referencia_mes: number | null
          status: string
          tipo: string
          valor: number
          valor_final: number
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          desconto?: number | null
          empresa_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          referencia_ano?: number | null
          referencia_mes?: number | null
          status?: string
          tipo: string
          valor: number
          valor_final: number
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          desconto?: number | null
          empresa_id?: string | null
          id?: string
          metodo_pagamento?: string | null
          observacoes?: string | null
          referencia_ano?: number | null
          referencia_mes?: number | null
          status?: string
          tipo?: string
          valor?: number
          valor_final?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines_vendas: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          empresa_id: string | null
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_vendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      planos: {
        Row: {
          created_at: string | null
          id: string
          limite_clientes: number
          limite_usuarios: number
          nome: string
          preco: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          limite_clientes?: number
          limite_usuarios?: number
          nome: string
          preco?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          limite_clientes?: number
          limite_usuarios?: number
          nome?: string
          preco?: number
        }
        Relationships: []
      }
      revendas: {
        Row: {
          anotacoes: Json
          cliente_id: string
          created_at: string | null
          data_proxima_acao: string | null
          data_venda: string | null
          empresa_id: string | null
          id: string
          observacoes: string | null
          origem: string | null
          pipeline_id: string | null
          proxima_acao: string | null
          revendedor_id: string | null
          sistema: string | null
          status_venda: string
          tags: string[] | null
          temperatura: string | null
          valor_estimado: number | null
          valores_detalhados: Json
        }
        Insert: {
          anotacoes?: Json
          cliente_id: string
          created_at?: string | null
          data_proxima_acao?: string | null
          data_venda?: string | null
          empresa_id?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          pipeline_id?: string | null
          proxima_acao?: string | null
          revendedor_id?: string | null
          sistema?: string | null
          status_venda?: string
          tags?: string[] | null
          temperatura?: string | null
          valor_estimado?: number | null
          valores_detalhados?: Json
        }
        Update: {
          anotacoes?: Json
          cliente_id?: string
          created_at?: string | null
          data_proxima_acao?: string | null
          data_venda?: string | null
          empresa_id?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          pipeline_id?: string | null
          proxima_acao?: string | null
          revendedor_id?: string | null
          sistema?: string | null
          status_venda?: string
          tags?: string[] | null
          temperatura?: string | null
          valor_estimado?: number | null
          valores_detalhados?: Json
        }
        Relationships: [
          {
            foreignKeyName: "revendas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revendas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revendas_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines_vendas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revendas_revendedor_id_fkey"
            columns: ["revendedor_id"]
            isOneToOne: false
            referencedRelation: "usuario_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      segmentos: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      sistemas: {
        Row: {
          ativo: boolean | null
          cor: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tabela_precos: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          ordem: number | null
          recursos: string[] | null
          valor_implantacao: number
          valor_mensalidade: number
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number | null
          recursos?: string[] | null
          valor_implantacao?: number
          valor_mensalidade?: number
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          recursos?: string[] | null
          valor_implantacao?: number
          valor_mensalidade?: number
        }
        Relationships: []
      }
      usuario_perfil: {
        Row: {
          created_at: string | null
          email: string | null
          empresa_id: string | null
          id: string
          nome: string | null
          tipo: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string | null
          tipo?: Database["public"]["Enums"]["user_role"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          empresa_id?: string | null
          id?: string
          nome?: string | null
          tipo?: Database["public"]["Enums"]["user_role"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_perfil_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_empresa_id: { Args: never; Returns: string }
      get_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_admin_or_super: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      status_type: "ativo" | "inativo" | "pendente" | "vencido"
      user_role: "super_admin" | "admin" | "revendedor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      status_type: ["ativo", "inativo", "pendente", "vencido"],
      user_role: ["super_admin", "admin", "revendedor"],
    },
  },
} as const
