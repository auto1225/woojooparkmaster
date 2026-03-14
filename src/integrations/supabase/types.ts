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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          module: string
          target_id: string | null
          target_name: string | null
          target_type: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          module: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          module?: string
          target_id?: string | null
          target_name?: string | null
          target_type?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          category: string | null
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          module: string
          ref_id: string
          ref_type: string
          thumbnail_path: string | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module: string
          ref_id: string
          ref_type: string
          thumbnail_path?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module?: string
          ref_id?: string
          ref_type?: string
          thumbnail_path?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      code_master: {
        Row: {
          code: string
          created_at: string | null
          extra: Json | null
          group_code: string
          id: string
          is_active: boolean | null
          name_en: string | null
          name_ko: string
          parent_code: string | null
          sort_order: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          extra?: Json | null
          group_code: string
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_ko: string
          parent_code?: string | null
          sort_order?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          extra?: Json | null
          group_code?: string
          id?: string
          is_active?: boolean | null
          name_en?: string | null
          name_ko?: string
          parent_code?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      module_licenses: {
        Row: {
          activated_at: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          license_key: string | null
          license_type: string
          max_users: number | null
          module_code: string
          module_name: string
          starts_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          license_key?: string | null
          license_type?: string
          max_users?: number | null
          module_code: string
          module_name: string
          starts_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          license_key?: string | null
          license_type?: string
          max_users?: number | null
          module_code?: string
          module_name?: string
          starts_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string | null
          module: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          module: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string | null
          module?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_lots: {
        Row: {
          address_jibun: string | null
          address_road: string | null
          area_sqm: number | null
          code: string
          compact_spaces: number | null
          control_system_linked: boolean | null
          created_at: string | null
          created_by: string | null
          disabled_spaces: number | null
          ev_spaces: number | null
          fee_policy: Json | null
          floor_detail: Json | null
          floors: number | null
          has_cctv: boolean | null
          has_display_board: boolean | null
          has_gate: boolean | null
          has_kiosk: boolean | null
          has_lpr: boolean | null
          has_sensor: boolean | null
          id: string
          latitude: number | null
          longitude: number | null
          lot_type: Database["public"]["Enums"]["lot_type_enum"]
          name: string
          network_type: string | null
          notes: string | null
          operating_hours: Json | null
          operator_name: string | null
          operator_type: Database["public"]["Enums"]["operator_enum"]
          other_spaces: number | null
          portal_linked: boolean | null
          power_status: Database["public"]["Enums"]["power_enum"] | null
          pregnant_spaces: number | null
          status: Database["public"]["Enums"]["lot_status_enum"] | null
          surface_type: Database["public"]["Enums"]["surface_enum"] | null
          total_spaces: number | null
          updated_at: string | null
        }
        Insert: {
          address_jibun?: string | null
          address_road?: string | null
          area_sqm?: number | null
          code: string
          compact_spaces?: number | null
          control_system_linked?: boolean | null
          created_at?: string | null
          created_by?: string | null
          disabled_spaces?: number | null
          ev_spaces?: number | null
          fee_policy?: Json | null
          floor_detail?: Json | null
          floors?: number | null
          has_cctv?: boolean | null
          has_display_board?: boolean | null
          has_gate?: boolean | null
          has_kiosk?: boolean | null
          has_lpr?: boolean | null
          has_sensor?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          lot_type?: Database["public"]["Enums"]["lot_type_enum"]
          name: string
          network_type?: string | null
          notes?: string | null
          operating_hours?: Json | null
          operator_name?: string | null
          operator_type?: Database["public"]["Enums"]["operator_enum"]
          other_spaces?: number | null
          portal_linked?: boolean | null
          power_status?: Database["public"]["Enums"]["power_enum"] | null
          pregnant_spaces?: number | null
          status?: Database["public"]["Enums"]["lot_status_enum"] | null
          surface_type?: Database["public"]["Enums"]["surface_enum"] | null
          total_spaces?: number | null
          updated_at?: string | null
        }
        Update: {
          address_jibun?: string | null
          address_road?: string | null
          area_sqm?: number | null
          code?: string
          compact_spaces?: number | null
          control_system_linked?: boolean | null
          created_at?: string | null
          created_by?: string | null
          disabled_spaces?: number | null
          ev_spaces?: number | null
          fee_policy?: Json | null
          floor_detail?: Json | null
          floors?: number | null
          has_cctv?: boolean | null
          has_display_board?: boolean | null
          has_gate?: boolean | null
          has_kiosk?: boolean | null
          has_lpr?: boolean | null
          has_sensor?: boolean | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          lot_type?: Database["public"]["Enums"]["lot_type_enum"]
          name?: string
          network_type?: string | null
          notes?: string | null
          operating_hours?: Json | null
          operator_name?: string | null
          operator_type?: Database["public"]["Enums"]["operator_enum"]
          other_spaces?: number | null
          portal_linked?: boolean | null
          power_status?: Database["public"]["Enums"]["power_enum"] | null
          pregnant_spaces?: number | null
          status?: Database["public"]["Enums"]["lot_status_enum"] | null
          surface_type?: Database["public"]["Enums"]["surface_enum"] | null
          total_spaces?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parking_lots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parking_spaces: {
        Row: {
          created_at: string | null
          floor: number | null
          has_sensor: boolean | null
          id: string
          lot_id: string
          sensor_id: string | null
          space_number: string | null
          space_type: Database["public"]["Enums"]["space_type_enum"] | null
          status: string | null
          zone: string | null
        }
        Insert: {
          created_at?: string | null
          floor?: number | null
          has_sensor?: boolean | null
          id?: string
          lot_id: string
          sensor_id?: string | null
          space_number?: string | null
          space_type?: Database["public"]["Enums"]["space_type_enum"] | null
          status?: string | null
          zone?: string | null
        }
        Update: {
          created_at?: string | null
          floor?: number | null
          has_sensor?: boolean | null
          id?: string
          lot_id?: string
          sensor_id?: string | null
          space_number?: string | null
          space_type?: Database["public"]["Enums"]["space_type_enum"] | null
          status?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parking_spaces_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          department: string | null
          email: string
          employee_number: string | null
          id: string
          is_active: boolean | null
          last_login_at: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["role_type"]
          team: Database["public"]["Enums"]["team_type"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          email: string
          employee_number?: string | null
          id: string
          is_active?: boolean | null
          last_login_at?: string | null
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["role_type"]
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          department?: string | null
          email?: string
          employee_number?: string | null
          id?: string
          is_active?: boolean | null
          last_login_at?: string | null
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["role_type"]
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string | null
        }
        Relationships: []
      }
      system_config: {
        Row: {
          config_key: string
          config_value: string
          description: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: string
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: string
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["role_type"]
      }
    }
    Enums: {
      lot_status_enum: "active" | "inactive" | "construction" | "closed"
      lot_type_enum:
        | "offstreet"
        | "onstreet"
        | "multilevel"
        | "vacant_lot"
        | "underground"
      operator_enum: "direct" | "outsourced" | "other"
      power_enum: "supplied" | "available" | "unavailable"
      role_type: "admin" | "manager" | "editor" | "viewer"
      space_type_enum:
        | "general"
        | "disabled"
        | "ev"
        | "compact"
        | "pregnant"
        | "motorcycle"
        | "other"
      surface_enum: "ascon" | "block" | "concrete" | "other"
      survey_status_enum:
        | "draft"
        | "in_progress"
        | "submitted"
        | "review"
        | "approved"
        | "rejected"
      team_type: "operations" | "facilities" | "planning" | "admin"
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
      lot_status_enum: ["active", "inactive", "construction", "closed"],
      lot_type_enum: [
        "offstreet",
        "onstreet",
        "multilevel",
        "vacant_lot",
        "underground",
      ],
      operator_enum: ["direct", "outsourced", "other"],
      power_enum: ["supplied", "available", "unavailable"],
      role_type: ["admin", "manager", "editor", "viewer"],
      space_type_enum: [
        "general",
        "disabled",
        "ev",
        "compact",
        "pregnant",
        "motorcycle",
        "other",
      ],
      surface_enum: ["ascon", "block", "concrete", "other"],
      survey_status_enum: [
        "draft",
        "in_progress",
        "submitted",
        "review",
        "approved",
        "rejected",
      ],
      team_type: ["operations", "facilities", "planning", "admin"],
    },
  },
} as const
