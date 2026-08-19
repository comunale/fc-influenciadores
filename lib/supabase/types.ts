export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      contract_templates: {
        Row: {
          id: string; versao: number; titulo: string; corpo: string
          ativo: boolean; created_at: string; created_by: string | null
        }
        Insert: {
          id?: string; versao: number; titulo: string; corpo: string
          ativo?: boolean; created_at?: string; created_by?: string | null
        }
        Update: {
          id?: string; versao?: number; titulo?: string; corpo?: string
          ativo?: boolean; created_at?: string; created_by?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          id: string; partnership_id: string; template_id: string | null
          template_versao: number | null; corpo: string; status: string
          imagem_meses: number; accepted_at: string | null
          accepted_ip: string | null; accepted_user_agent: string | null
          fee_a_restituir: number | null; created_at: string
        }
        Insert: {
          id?: string; partnership_id: string; template_id?: string | null
          template_versao?: number | null; corpo: string; status?: string
          imagem_meses?: number; accepted_at?: string | null
          accepted_ip?: string | null; accepted_user_agent?: string | null
          fee_a_restituir?: number | null; created_at?: string
        }
        Update: {
          id?: string; partnership_id?: string; template_id?: string | null
          template_versao?: number | null; corpo?: string; status?: string
          imagem_meses?: number; accepted_at?: string | null
          accepted_ip?: string | null; accepted_user_agent?: string | null
          fee_a_restituir?: number | null; created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: true
            referencedRelation: "partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_contract_data: {
        Row: {
          influencer_id: string; cpf: string | null; estado_civil: string | null
          endereco: string | null; cep: string | null; updated_at: string
        }
        Insert: {
          influencer_id: string; cpf?: string | null; estado_civil?: string | null
          endereco?: string | null; cep?: string | null; updated_at?: string
        }
        Update: {
          influencer_id?: string; cpf?: string | null; estado_civil?: string | null
          endereco?: string | null; cep?: string | null; updated_at?: string
        }
        Relationships: []
      }
      admin_profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          influencer_id: string | null
          name: string
          role: string
          store_name: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id: string
          influencer_id?: string | null
          name: string
          role?: string
          store_name?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          influencer_id?: string | null
          name?: string
          role?: string
          store_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_profiles_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          company_name: string
          contact_phone: string | null
          email_body: string
          email_subject: string
          id: number
          sender_email: string
          updated_at: string
          whatsapp_text: string
        }
        Insert: {
          company_name?: string
          contact_phone?: string | null
          email_body?: string
          email_subject?: string
          id?: number
          sender_email?: string
          updated_at?: string
          whatsapp_text?: string
        }
        Update: {
          company_name?: string
          contact_phone?: string | null
          email_body?: string
          email_subject?: string
          id?: number
          sender_email?: string
          updated_at?: string
          whatsapp_text?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          active: boolean
          coupon_description: string
          coupon_title: string
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          name: string
          updated_at: string
          validity_days: number
        }
        Insert: {
          active?: boolean
          coupon_description?: string
          coupon_title?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          name: string
          updated_at?: string
          validity_days?: number
        }
        Update: {
          active?: boolean
          coupon_description?: string
          coupon_title?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          name?: string
          updated_at?: string
          validity_days?: number
        }
        Relationships: []
      }
      coupons: {
        Row: {
          campaign_id: string
          coupon_number: string
          created_at: string
          customer_cpf: string
          customer_email: string
          customer_name: string
          customer_phone: string
          expires_at: string
          id: string
          influencer_id: string
          status: string
          used_at: string | null
          used_by_admin: string | null
          verified: boolean
          verified_at: string | null
          verified_by: string | null
          paid: boolean
          paid_at: string | null
          paid_by: string | null
          invoice_number: string | null
          seller_id: string | null
          partnership_id: string | null
          discount_type: string | null
          discount_value: number | null
          commission_per_sale: number | null
        }
        Insert: {
          campaign_id: string
          coupon_number: string
          created_at?: string
          customer_cpf: string
          customer_email: string
          customer_name: string
          customer_phone: string
          expires_at: string
          id?: string
          influencer_id: string
          status?: string
          used_at?: string | null
          used_by_admin?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          invoice_number?: string | null
          seller_id?: string | null
          partnership_id?: string | null
          discount_type?: string | null
          discount_value?: number | null
          commission_per_sale?: number | null
        }
        Update: {
          campaign_id?: string
          coupon_number?: string
          created_at?: string
          customer_cpf?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          expires_at?: string
          id?: string
          influencer_id?: string
          status?: string
          used_at?: string | null
          used_by_admin?: string | null
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
          paid?: boolean
          paid_at?: string | null
          paid_by?: string | null
          invoice_number?: string | null
          seller_id?: string | null
          partnership_id?: string | null
          discount_type?: string | null
          discount_value?: number | null
          commission_per_sale?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupons_partnership_id_fkey"
            columns: ["partnership_id"]
            isOneToOne: false
            referencedRelation: "partnerships"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_payment_info: {
        Row: {
          influencer_id: string
          payment_method: string | null
          pix_key: string | null
          bank_name: string | null
          bank_agency: string | null
          bank_account: string | null
          payment_document: string | null
          payment_notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          influencer_id: string
          payment_method?: string | null
          pix_key?: string | null
          bank_name?: string | null
          bank_agency?: string | null
          bank_account?: string | null
          payment_document?: string | null
          payment_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          influencer_id?: string
          payment_method?: string | null
          pix_key?: string | null
          bank_name?: string | null
          bank_agency?: string | null
          bank_account?: string | null
          payment_document?: string | null
          payment_notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      influencers: {
        Row: {
          active: boolean
          campaign_id: string
          coupon_code: string
          created_at: string
          id: string
          instagram_handle: string
          name: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          coupon_code: string
          created_at?: string
          id?: string
          instagram_handle: string
          name: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          coupon_code?: string
          created_at?: string
          id?: string
          instagram_handle?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      partnerships: {
        Row: {
          id: string
          influencer_id: string
          campaign_id: string | null
          status: string
          starts_at: string
          ends_at: string | null
          fee_amount: number
          fee_timing: string
          commission_per_sale: number
          commission_starts_at: number
          commission_counts_from: string
          payment_schedule: string
          portal_visible: boolean
          contract_required: boolean
          contract_accepted_at: string | null
          discount_type: string
          discount_value: number
          validity_days: number
          coupon_title: string | null
          coupon_description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          influencer_id: string
          campaign_id?: string | null
          status?: string
          starts_at?: string
          ends_at?: string | null
          fee_amount?: number
          fee_timing?: string
          commission_per_sale?: number
          commission_starts_at?: number
          commission_counts_from?: string
          payment_schedule?: string
          portal_visible?: boolean
          contract_required?: boolean
          contract_accepted_at?: string | null
          discount_type: string
          discount_value: number
          validity_days: number
          coupon_title?: string | null
          coupon_description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          influencer_id?: string
          campaign_id?: string | null
          status?: string
          starts_at?: string
          ends_at?: string | null
          fee_amount?: number
          fee_timing?: string
          commission_per_sale?: number
          commission_starts_at?: number
          commission_counts_from?: string
          payment_schedule?: string
          portal_visible?: boolean
          contract_required?: boolean
          contract_accepted_at?: string | null
          discount_type?: string
          discount_value?: number
          validity_days?: number
          coupon_title?: string | null
          coupon_description?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnerships_influencer_id_fkey"
            columns: ["influencer_id"]
            isOneToOne: false
            referencedRelation: "influencers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnerships_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      sellers: {
        Row: {
          id: string
          name: string
          store_name: string
          active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          store_name: string
          active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          store_name?: string
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      portal_meu_contrato: {
        Args: Record<string, never>
        Returns: {
          id: string; corpo: string; status: string
          accepted_at: string | null; falta_dados: boolean
        }[]
      }
      portal_meus_dados: {
        Args: Record<string, never>
        Returns: {
          cpf: string | null; estado_civil: string | null
          endereco: string | null; cep: string | null
        }[]
      }
      portal_salvar_meus_dados: {
        Args: { p_cpf: string; p_estado_civil: string; p_endereco: string; p_cep: string }
        Returns: undefined
      }
      portal_aceitar_contrato: {
        Args: { p_ip: string; p_agent: string }
        Returns: undefined
      }
      registrar_descumprimento: {
        Args: { p_contrato: string }
        Returns: undefined
      }
      portal_vendas: {
        Args: Record<string, never>
        Returns: {
          id: string; partnership_id: string | null; created_at: string
          verified: boolean; paid: boolean; commission_per_sale: number | null
          primeiro_nome: string
        }[]
      }
      check_rate_limit: {
        Args: {
          p_key: string
          p_max: number
          p_window_sec: number
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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

// Aliases de conveniência
export type Campaign = Database['public']['Tables']['campaigns']['Row']
export type Influencer = Database['public']['Tables']['influencers']['Row']
export type Coupon = Database['public']['Tables']['coupons']['Row']
export type AdminProfile = Database['public']['Tables']['admin_profiles']['Row']

export type CouponStatus = 'pending' | 'used' | 'expired' | 'cancelled'
