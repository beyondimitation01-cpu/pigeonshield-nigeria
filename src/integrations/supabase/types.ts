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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          commission_pct: number
          id: number
        }
        Insert: {
          commission_pct?: number
          id?: number
        }
        Update: {
          commission_pct?: number
          id?: number
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
          created_at: string
          from_id: string
          id: string
          listing_id: string | null
          to_id: string
        }
        Insert: {
          body: string
          created_at?: string
          from_id: string
          id?: string
          listing_id?: string | null
          to_id: string
        }
        Update: {
          body?: string
          created_at?: string
          from_id?: string
          id?: string
          listing_id?: string | null
          to_id?: string
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
      profiles: {
        Row: {
          account_number: string
          bank_name: string
          created_at: string
          home_state: string
          id: string
          is_banned: boolean
          is_online: boolean
          phone_number: string
          public_handle: string
          real_name: string
        }
        Insert: {
          account_number?: string
          bank_name?: string
          created_at?: string
          home_state?: string
          id: string
          is_banned?: boolean
          is_online?: boolean
          phone_number?: string
          public_handle: string
          real_name?: string
        }
        Update: {
          account_number?: string
          bank_name?: string
          created_at?: string
          home_state?: string
          id?: string
          is_banned?: boolean
          is_online?: boolean
          phone_number?: string
          public_handle?: string
          real_name?: string
        }
        Relationships: []
      }
      transaction_passcodes: {
        Row: {
          buyer_id: string
          passcode: string
          transaction_id: string
        }
        Insert: {
          buyer_id: string
          passcode: string
          transaction_id: string
        }
        Update: {
          buyer_id?: string
          passcode?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_passcodes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
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
          proof_file_name: string | null
          status: string
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
          proof_file_name?: string | null
          status?: string
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
          proof_file_name?: string | null
          status?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
