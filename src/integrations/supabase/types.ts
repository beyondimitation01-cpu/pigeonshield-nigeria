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
      app_feedback: {
        Row: {
          category: string
          contact: string
          created_at: string
          id: string
          message: string
          name: string
          rating: number
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string
          contact?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
          rating?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          contact?: string
          created_at?: string
          id?: string
          message?: string
          name?: string
          rating?: number
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          commission_pct: number
          id: number
          whatsapp_alert_number: string
        }
        Insert: {
          commission_pct?: number
          id?: number
          whatsapp_alert_number?: string
        }
        Update: {
          commission_pct?: number
          id?: number
          whatsapp_alert_number?: string
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          participant_a: string
          participant_b: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_a: string
          participant_b: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_a?: string
          participant_b?: string
          updated_at?: string
        }
        Relationships: []
      }
      listings: {
        Row: {
          batch_quantity: number
          breed_type: string
          breeder_handle: string
          breeder_id: string | null
          category_type: string
          commission_override: number | null
          creation_timestamp: string
          custom_bird_name: string
          description: string
          expiry_date: string
          gender: string
          id: string
          images: string[]
          is_active: boolean
          is_featured: boolean
          is_mock: boolean
          is_verified_seller: boolean
          pedigree_json: Json | null
          price_ngn: number
          state: string
          vaccinated: boolean
        }
        Insert: {
          batch_quantity?: number
          breed_type: string
          breeder_handle: string
          breeder_id?: string | null
          category_type: string
          commission_override?: number | null
          creation_timestamp?: string
          custom_bird_name: string
          description?: string
          expiry_date?: string
          gender: string
          id?: string
          images?: string[]
          is_active?: boolean
          is_featured?: boolean
          is_mock?: boolean
          is_verified_seller?: boolean
          pedigree_json?: Json | null
          price_ngn: number
          state: string
          vaccinated?: boolean
        }
        Update: {
          batch_quantity?: number
          breed_type?: string
          breeder_handle?: string
          breeder_id?: string | null
          category_type?: string
          commission_override?: number | null
          creation_timestamp?: string
          custom_bird_name?: string
          description?: string
          expiry_date?: string
          gender?: string
          id?: string
          images?: string[]
          is_active?: boolean
          is_featured?: boolean
          is_mock?: boolean
          is_verified_seller?: boolean
          pedigree_json?: Json | null
          price_ngn?: number
          state?: string
          vaccinated?: boolean
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          from_id: string
          id: string
          listing_id: string | null
          read_at: string | null
          to_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          from_id: string
          id?: string
          listing_id?: string | null
          read_at?: string | null
          to_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          from_id?: string
          id?: string
          listing_id?: string | null
          read_at?: string | null
          to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          listing_id: string | null
          message_id: string
          read_at: string | null
          recipient_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          listing_id?: string | null
          message_id: string
          read_at?: string | null
          recipient_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          listing_id?: string | null
          message_id?: string
          read_at?: string | null
          recipient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_number: string
          avatar_url: string
          bank_name: string
          created_at: string
          email: string
          escrow_paused: boolean
          home_state: string
          id: string
          is_banned: boolean
          is_frozen: boolean
          is_online: boolean
          is_verified_seller: boolean
          loft_name: string
          phone_number: string
          public_handle: string
          real_name: string
          referral_code: string
        }
        Insert: {
          account_number?: string
          avatar_url?: string
          bank_name?: string
          created_at?: string
          email?: string
          escrow_paused?: boolean
          home_state?: string
          id: string
          is_banned?: boolean
          is_frozen?: boolean
          is_online?: boolean
          is_verified_seller?: boolean
          loft_name?: string
          phone_number?: string
          public_handle: string
          real_name?: string
          referral_code?: string
        }
        Update: {
          account_number?: string
          avatar_url?: string
          bank_name?: string
          created_at?: string
          email?: string
          escrow_paused?: boolean
          home_state?: string
          id?: string
          is_banned?: boolean
          is_frozen?: boolean
          is_online?: boolean
          is_verified_seller?: boolean
          loft_name?: string
          phone_number?: string
          public_handle?: string
          real_name?: string
          referral_code?: string
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string
          full_name: string
          id: string
          is_online: boolean
          is_verified_seller: boolean
          loft_name: string
          phone_number: string
          public_handle: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string
          full_name?: string
          id: string
          is_online?: boolean
          is_verified_seller?: boolean
          loft_name?: string
          phone_number?: string
          public_handle?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string
          full_name?: string
          id?: string
          is_online?: boolean
          is_verified_seller?: boolean
          loft_name?: string
          phone_number?: string
          public_handle?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          credits: number
          id: string
          referral_code: string
          referred_id: string
          referrer_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credits?: number
          id?: string
          referral_code: string
          referred_id: string
          referrer_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          referral_code?: string
          referred_id?: string
          referrer_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_naira: number
          auto_release_at: string
          breeder_id: string | null
          buyer_id: string
          calculated_commission: number
          created_at: string
          delivery_marked_at: string
          dispute_status: string
          driver_phone: string | null
          id: string
          listing_id: string | null
          listing_name: string
          payment_reference: string | null
          proof_file_name: string | null
          receipt_uploaded_at: string | null
          receipt_url: string | null
          status: string
          verification_pin: string | null
          waybill_image_url: string | null
        }
        Insert: {
          amount_naira: number
          auto_release_at?: string
          breeder_id?: string | null
          buyer_id: string
          calculated_commission?: number
          created_at?: string
          delivery_marked_at?: string
          dispute_status?: string
          driver_phone?: string | null
          id?: string
          listing_id?: string | null
          listing_name: string
          payment_reference?: string | null
          proof_file_name?: string | null
          receipt_uploaded_at?: string | null
          receipt_url?: string | null
          status?: string
          verification_pin?: string | null
          waybill_image_url?: string | null
        }
        Update: {
          amount_naira?: number
          auto_release_at?: string
          breeder_id?: string | null
          buyer_id?: string
          calculated_commission?: number
          created_at?: string
          delivery_marked_at?: string
          dispute_status?: string
          driver_phone?: string | null
          id?: string
          listing_id?: string | null
          listing_name?: string
          payment_reference?: string | null
          proof_file_name?: string | null
          receipt_uploaded_at?: string | null
          receipt_url?: string | null
          status?: string
          verification_pin?: string | null
          waybill_image_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      chat_threads: {
        Row: {
          last_message_at: string | null
          listing_id: string | null
          message_count: number | null
          participant_a: string | null
          participant_b: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_credit_totals: {
        Row: {
          referred_count: number | null
          referrer_id: string | null
          total_credits: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      verify_admin_passphrase: {
        Args: { passphrase: string }
        Returns: boolean
      }
      dispatch_transaction: {
        Args: { _transaction_id: string }
        Returns: string
      }
      get_visible_handover_pins: {
        Args: Record<PropertyKey, never>
        Returns: { transaction_id: string; verification_pin: string }[]
      }
      confirm_receipt_and_reveal_pin: {
        Args: { _transaction_id: string }
        Returns: string
      }
      force_mark_delivered: {
        Args: { _transaction_id: string }
        Returns: undefined
      }
      get_or_create_conversation: {
        Args: { _other_id: string }
        Returns: string
      }
      get_seller_phone: { Args: { _seller_id: string }; Returns: string }
      mark_conversation_read: {
        Args: { _conversation_id: string }
        Returns: undefined
      }
      mark_messages_read: {
        Args: { _listing_id: string; _other_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { _notification_id: string }
        Returns: undefined
      }
      sanitize_text: { Args: { value: string }; Returns: string }
      send_message: {
        Args: {
          _body: string
          _conversation_id: string
          _listing_id: string
          _to_id: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
