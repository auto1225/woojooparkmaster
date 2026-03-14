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
      enforcement_records: {
        Row: {
          appeal_date: string | null
          appeal_reason: string | null
          appeal_result: string | null
          appeal_status: string | null
          created_at: string | null
          enforcement_number: string
          fine_amount: number | null
          fine_due_date: string | null
          fine_paid_date: string | null
          id: string
          location_detail: string | null
          lot_id: string | null
          notes: string | null
          officer_id: string | null
          officer_name: string | null
          payment_status: string | null
          photo_paths: Json | null
          updated_at: string | null
          vehicle_number: string
          vehicle_type: string | null
          violation_date: string
          violation_location: string | null
          violation_type: string
        }
        Insert: {
          appeal_date?: string | null
          appeal_reason?: string | null
          appeal_result?: string | null
          appeal_status?: string | null
          created_at?: string | null
          enforcement_number: string
          fine_amount?: number | null
          fine_due_date?: string | null
          fine_paid_date?: string | null
          id?: string
          location_detail?: string | null
          lot_id?: string | null
          notes?: string | null
          officer_id?: string | null
          officer_name?: string | null
          payment_status?: string | null
          photo_paths?: Json | null
          updated_at?: string | null
          vehicle_number: string
          vehicle_type?: string | null
          violation_date: string
          violation_location?: string | null
          violation_type: string
        }
        Update: {
          appeal_date?: string | null
          appeal_reason?: string | null
          appeal_result?: string | null
          appeal_status?: string | null
          created_at?: string | null
          enforcement_number?: string
          fine_amount?: number | null
          fine_due_date?: string | null
          fine_paid_date?: string | null
          id?: string
          location_detail?: string | null
          lot_id?: string | null
          notes?: string | null
          officer_id?: string | null
          officer_name?: string | null
          payment_status?: string | null
          photo_paths?: Json | null
          updated_at?: string | null
          vehicle_number?: string
          vehicle_type?: string | null
          violation_date?: string
          violation_location?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "enforcement_records_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_records_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          created_at: string | null
          current_value: number | null
          depreciation_method: string | null
          equipment_code: string
          equipment_type: string
          firmware_version: string | null
          floor: number | null
          id: string
          install_date: string | null
          ip_address: string | null
          last_maintenance_date: string | null
          location_detail: string | null
          lot_id: string
          maintenance_count: number | null
          manual_path: string | null
          manufacturer: string | null
          model: string | null
          name: string
          network_required: boolean | null
          next_maintenance_date: string | null
          notes: string | null
          photo_path: string | null
          power_consumption: string | null
          purchase_cost: number | null
          quantity: number | null
          registered_by: string | null
          replacement_due: string | null
          serial_number: string | null
          specification: Json | null
          status: string | null
          status_changed_at: string | null
          total_maintenance_cost: number | null
          updated_at: string | null
          useful_life_years: number | null
          warranty_end: string | null
          warranty_start: string | null
        }
        Insert: {
          created_at?: string | null
          current_value?: number | null
          depreciation_method?: string | null
          equipment_code: string
          equipment_type: string
          firmware_version?: string | null
          floor?: number | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_maintenance_date?: string | null
          location_detail?: string | null
          lot_id: string
          maintenance_count?: number | null
          manual_path?: string | null
          manufacturer?: string | null
          model?: string | null
          name: string
          network_required?: boolean | null
          next_maintenance_date?: string | null
          notes?: string | null
          photo_path?: string | null
          power_consumption?: string | null
          purchase_cost?: number | null
          quantity?: number | null
          registered_by?: string | null
          replacement_due?: string | null
          serial_number?: string | null
          specification?: Json | null
          status?: string | null
          status_changed_at?: string | null
          total_maintenance_cost?: number | null
          updated_at?: string | null
          useful_life_years?: number | null
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Update: {
          created_at?: string | null
          current_value?: number | null
          depreciation_method?: string | null
          equipment_code?: string
          equipment_type?: string
          firmware_version?: string | null
          floor?: number | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_maintenance_date?: string | null
          location_detail?: string | null
          lot_id?: string
          maintenance_count?: number | null
          manual_path?: string | null
          manufacturer?: string | null
          model?: string | null
          name?: string
          network_required?: boolean | null
          next_maintenance_date?: string | null
          notes?: string | null
          photo_path?: string | null
          power_consumption?: string | null
          purchase_cost?: number | null
          quantity?: number | null
          registered_by?: string | null
          replacement_due?: string | null
          serial_number?: string | null
          specification?: Json | null
          status?: string | null
          status_changed_at?: string | null
          total_maintenance_cost?: number | null
          updated_at?: string | null
          useful_life_years?: number | null
          warranty_end?: string | null
          warranty_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_exemptions: {
        Row: {
          created_at: string | null
          description: string | null
          discount_amount: number | null
          discount_rate: number | null
          discount_type: string
          effective_from: string | null
          effective_to: string | null
          exemption_name: string
          exemption_type: string
          id: string
          is_active: boolean | null
          legal_basis: string | null
          lot_id: string | null
          max_discount_amount: number | null
          max_hours: number | null
          required_documents: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_rate?: number | null
          discount_type?: string
          effective_from?: string | null
          effective_to?: string | null
          exemption_name: string
          exemption_type: string
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          lot_id?: string | null
          max_discount_amount?: number | null
          max_hours?: number | null
          required_documents?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_rate?: number | null
          discount_type?: string
          effective_from?: string | null
          effective_to?: string | null
          exemption_name?: string
          exemption_type?: string
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          lot_id?: string | null
          max_discount_amount?: number | null
          max_hours?: number | null
          required_documents?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_exemptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_policies: {
        Row: {
          add_fee: number | null
          add_minutes: number | null
          approved_by: string | null
          base_fee: number | null
          base_minutes: number | null
          created_at: string | null
          created_by: string | null
          daily_max: number | null
          day_type: string
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          legal_basis: string | null
          lot_id: string
          monthly_pass_fee: number | null
          notes: string | null
          policy_name: string
          time_end: string | null
          time_start: string | null
          updated_at: string | null
        }
        Insert: {
          add_fee?: number | null
          add_minutes?: number | null
          approved_by?: string | null
          base_fee?: number | null
          base_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_max?: number | null
          day_type?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          lot_id: string
          monthly_pass_fee?: number | null
          notes?: string | null
          policy_name: string
          time_end?: string | null
          time_start?: string | null
          updated_at?: string | null
        }
        Update: {
          add_fee?: number | null
          add_minutes?: number | null
          approved_by?: string | null
          base_fee?: number | null
          base_minutes?: number | null
          created_at?: string | null
          created_by?: string | null
          daily_max?: number | null
          day_type?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          legal_basis?: string | null
          lot_id?: string
          monthly_pass_fee?: number | null
          notes?: string | null
          policy_name?: string
          time_end?: string | null
          time_start?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_policies_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_policies_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      free_hours_settings: {
        Row: {
          approved_by: string | null
          created_at: string | null
          day_type: string
          effective_from: string | null
          effective_to: string | null
          end_time: string
          id: string
          is_active: boolean | null
          lot_id: string
          reason: string | null
          setting_name: string | null
          start_time: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string | null
          day_type: string
          effective_from?: string | null
          effective_to?: string | null
          end_time: string
          id?: string
          is_active?: boolean | null
          lot_id: string
          reason?: string | null
          setting_name?: string | null
          start_time: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string | null
          day_type?: string
          effective_from?: string | null
          effective_to?: string | null
          end_time?: string
          id?: string
          is_active?: boolean | null
          lot_id?: string
          reason?: string | null
          setting_name?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "free_hours_settings_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "free_hours_settings_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          after_photo: string | null
          assigned_at: string | null
          assigned_to: string | null
          before_photo: string | null
          cause: string | null
          checklist_results: Json | null
          closed_at: string | null
          closed_by: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          downtime_hours: number | null
          equipment_id: string | null
          id: string
          labor_cost: number | null
          labor_hours: number | null
          log_number: string
          lot_id: string
          maintenance_type: string
          notes: string | null
          other_cost: number | null
          parts_cost: number | null
          parts_used: Json | null
          priority: string
          reported_at: string | null
          reported_by: string | null
          resolution: string | null
          satisfaction_score: number | null
          schedule_id: string | null
          started_at: string | null
          status: string
          symptom: string | null
          title: string
          total_cost: number | null
          updated_at: string | null
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          after_photo?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          before_photo?: string | null
          cause?: string | null
          checklist_results?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          downtime_hours?: number | null
          equipment_id?: string | null
          id?: string
          labor_cost?: number | null
          labor_hours?: number | null
          log_number: string
          lot_id: string
          maintenance_type: string
          notes?: string | null
          other_cost?: number | null
          parts_cost?: number | null
          parts_used?: Json | null
          priority?: string
          reported_at?: string | null
          reported_by?: string | null
          resolution?: string | null
          satisfaction_score?: number | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          symptom?: string | null
          title: string
          total_cost?: number | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          after_photo?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          before_photo?: string | null
          cause?: string | null
          checklist_results?: Json | null
          closed_at?: string | null
          closed_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          downtime_hours?: number | null
          equipment_id?: string | null
          id?: string
          labor_cost?: number | null
          labor_hours?: number | null
          log_number?: string
          lot_id?: string
          maintenance_type?: string
          notes?: string | null
          other_cost?: number | null
          parts_cost?: number | null
          parts_used?: Json | null
          priority?: string
          reported_at?: string | null
          reported_by?: string | null
          resolution?: string | null
          satisfaction_score?: number | null
          schedule_id?: string | null
          started_at?: string | null
          status?: string
          symptom?: string | null
          title?: string
          total_cost?: number | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "maintenance_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_schedules: {
        Row: {
          advance_notice_days: number | null
          assigned_team: Database["public"]["Enums"]["team_type"] | null
          assigned_to: string | null
          checklist: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          equipment_id: string | null
          estimated_cost: number | null
          estimated_hours: number | null
          id: string
          is_active: boolean | null
          last_completed: string | null
          lot_id: string
          next_due_date: string
          recurrence_rule: Json | null
          schedule_name: string
          schedule_type: string
          updated_at: string | null
          vendor_name: string | null
        }
        Insert: {
          advance_notice_days?: number | null
          assigned_team?: Database["public"]["Enums"]["team_type"] | null
          assigned_to?: string | null
          checklist?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id?: string | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          lot_id: string
          next_due_date: string
          recurrence_rule?: Json | null
          schedule_name: string
          schedule_type: string
          updated_at?: string | null
          vendor_name?: string | null
        }
        Update: {
          advance_notice_days?: number | null
          assigned_team?: Database["public"]["Enums"]["team_type"] | null
          assigned_to?: string | null
          checklist?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          equipment_id?: string | null
          estimated_cost?: number | null
          estimated_hours?: number | null
          id?: string
          is_active?: boolean | null
          last_completed?: string | null
          lot_id?: string
          next_due_date?: string
          recurrence_rule?: Json | null
          schedule_name?: string
          schedule_type?: string
          updated_at?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_schedules_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_schedules_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
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
      monthly_passes: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          fee_amount: number
          fee_paid: number | null
          holder_address: string | null
          holder_name: string | null
          holder_phone: string | null
          id: string
          issued_by: string | null
          lot_id: string
          notes: string | null
          pass_end: string
          pass_number: string
          pass_start: string
          payment_date: string | null
          payment_method: string | null
          previous_pass_id: string | null
          receipt_number: string | null
          renewal_count: number | null
          status: string | null
          updated_at: string | null
          vehicle_number: string
          vehicle_type: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          fee_amount: number
          fee_paid?: number | null
          holder_address?: string | null
          holder_name?: string | null
          holder_phone?: string | null
          id?: string
          issued_by?: string | null
          lot_id: string
          notes?: string | null
          pass_end: string
          pass_number: string
          pass_start: string
          payment_date?: string | null
          payment_method?: string | null
          previous_pass_id?: string | null
          receipt_number?: string | null
          renewal_count?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_number: string
          vehicle_type?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          fee_amount?: number
          fee_paid?: number | null
          holder_address?: string | null
          holder_name?: string | null
          holder_phone?: string | null
          id?: string
          issued_by?: string | null
          lot_id?: string
          notes?: string | null
          pass_end?: string
          pass_number?: string
          pass_start?: string
          payment_date?: string | null
          payment_method?: string | null
          previous_pass_id?: string | null
          receipt_number?: string | null
          renewal_count?: number | null
          status?: string | null
          updated_at?: string | null
          vehicle_number?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_passes_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_passes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_passes_previous_pass_id_fkey"
            columns: ["previous_pass_id"]
            isOneToOne: false
            referencedRelation: "monthly_passes"
            referencedColumns: ["id"]
          },
        ]
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
      operations_staff: {
        Row: {
          created_at: string | null
          hire_date: string | null
          id: string
          is_active: boolean | null
          lot_id: string
          notes: string | null
          phone: string | null
          position: string | null
          resign_date: string | null
          schedule: Json | null
          staff_name: string
          staff_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          lot_id: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          resign_date?: string | null
          schedule?: Json | null
          staff_name: string
          staff_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean | null
          lot_id?: string
          notes?: string | null
          phone?: string | null
          position?: string | null
          resign_date?: string | null
          schedule?: Json | null
          staff_name?: string
          staff_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operations_staff_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      outsourcing_contracts: {
        Row: {
          auto_renew: boolean | null
          business_number: string | null
          company_name: string
          contact_email: string | null
          contact_person: string | null
          contact_phone: string | null
          contract_amount: number | null
          contract_end: string
          contract_number: string | null
          contract_start: string
          created_at: string | null
          created_by: string | null
          evaluation_date: string | null
          evaluation_note: string | null
          id: string
          lot_id: string
          monthly_fee: number | null
          notes: string | null
          performance_score: number | null
          representative: string | null
          revenue_share_rate: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          business_number?: string | null
          company_name: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_amount?: number | null
          contract_end: string
          contract_number?: string | null
          contract_start: string
          created_at?: string | null
          created_by?: string | null
          evaluation_date?: string | null
          evaluation_note?: string | null
          id?: string
          lot_id: string
          monthly_fee?: number | null
          notes?: string | null
          performance_score?: number | null
          representative?: string | null
          revenue_share_rate?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          business_number?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          contract_amount?: number | null
          contract_end?: string
          contract_number?: string | null
          contract_start?: string
          created_at?: string | null
          created_by?: string | null
          evaluation_date?: string | null
          evaluation_note?: string | null
          id?: string
          lot_id?: string
          monthly_fee?: number | null
          notes?: string | null
          performance_score?: number | null
          representative?: string | null
          revenue_share_rate?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outsourcing_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outsourcing_contracts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
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
      safety_inspections: {
        Row: {
          checklist_results: Json
          checklist_template: string | null
          correction_completed: string | null
          correction_deadline: string | null
          correction_verified_by: string | null
          corrective_actions: string | null
          created_at: string | null
          created_by: string | null
          fail_items: number | null
          follow_up_date: string | null
          follow_up_required: boolean | null
          id: string
          inspection_date: string
          inspection_number: string
          inspection_type: string
          inspector_id: string | null
          inspector_name: string | null
          inspector_org: string | null
          issues_found: string | null
          lot_id: string
          na_items: number | null
          notes: string | null
          overall_grade: string | null
          pass_items: number | null
          photo_paths: Json | null
          report_path: string | null
          status: string | null
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          checklist_results: Json
          checklist_template?: string | null
          correction_completed?: string | null
          correction_deadline?: string | null
          correction_verified_by?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          fail_items?: number | null
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          inspection_date: string
          inspection_number: string
          inspection_type: string
          inspector_id?: string | null
          inspector_name?: string | null
          inspector_org?: string | null
          issues_found?: string | null
          lot_id: string
          na_items?: number | null
          notes?: string | null
          overall_grade?: string | null
          pass_items?: number | null
          photo_paths?: Json | null
          report_path?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          checklist_results?: Json
          checklist_template?: string | null
          correction_completed?: string | null
          correction_deadline?: string | null
          correction_verified_by?: string | null
          corrective_actions?: string | null
          created_at?: string | null
          created_by?: string | null
          fail_items?: number | null
          follow_up_date?: string | null
          follow_up_required?: boolean | null
          id?: string
          inspection_date?: string
          inspection_number?: string
          inspection_type?: string
          inspector_id?: string | null
          inspector_name?: string | null
          inspector_org?: string | null
          issues_found?: string | null
          lot_id?: string
          na_items?: number | null
          notes?: string | null
          overall_grade?: string | null
          pass_items?: number | null
          photo_paths?: Json | null
          report_path?: string | null
          status?: string | null
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_inspections_correction_verified_by_fkey"
            columns: ["correction_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_inspections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_inspections_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      surface_markings: {
        Row: {
          color: string | null
          condition: string | null
          condition_note: string | null
          created_at: string | null
          dimension: string | null
          estimated_cost: number | null
          floor: number | null
          id: string
          install_date: string | null
          is_regulatory: boolean | null
          last_repainted: string | null
          location_detail: string | null
          lot_id: string
          marking_name: string
          marking_type: string
          material: string | null
          next_due: string | null
          notes: string | null
          photo_path: string | null
          quantity: number | null
          regulation_ref: string | null
          repaint_cycle_months: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          condition?: string | null
          condition_note?: string | null
          created_at?: string | null
          dimension?: string | null
          estimated_cost?: number | null
          floor?: number | null
          id?: string
          install_date?: string | null
          is_regulatory?: boolean | null
          last_repainted?: string | null
          location_detail?: string | null
          lot_id: string
          marking_name: string
          marking_type: string
          material?: string | null
          next_due?: string | null
          notes?: string | null
          photo_path?: string | null
          quantity?: number | null
          regulation_ref?: string | null
          repaint_cycle_months?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          condition?: string | null
          condition_note?: string | null
          created_at?: string | null
          dimension?: string | null
          estimated_cost?: number | null
          floor?: number | null
          id?: string
          install_date?: string | null
          is_regulatory?: boolean | null
          last_repainted?: string | null
          location_detail?: string | null
          lot_id?: string
          marking_name?: string
          marking_type?: string
          material?: string | null
          next_due?: string | null
          notes?: string | null
          photo_path?: string | null
          quantity?: number | null
          regulation_ref?: string | null
          repaint_cycle_months?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surface_markings_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_basic_info: {
        Row: {
          address: string | null
          compact_spaces: number | null
          disabled_spaces: number | null
          entry_count: number | null
          entry_exit_same: boolean | null
          ev_spaces: number | null
          exit_count: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          lot_name: string | null
          lot_type: string | null
          lot_type_floor: number | null
          operator_type: string | null
          other_spaces: number | null
          other_spaces_desc: string | null
          pregnant_spaces: number | null
          surface_type: string | null
          surface_type_etc: string | null
          survey_id: string
          total_spaces: number | null
        }
        Insert: {
          address?: string | null
          compact_spaces?: number | null
          disabled_spaces?: number | null
          entry_count?: number | null
          entry_exit_same?: boolean | null
          ev_spaces?: number | null
          exit_count?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          lot_name?: string | null
          lot_type?: string | null
          lot_type_floor?: number | null
          operator_type?: string | null
          other_spaces?: number | null
          other_spaces_desc?: string | null
          pregnant_spaces?: number | null
          surface_type?: string | null
          surface_type_etc?: string | null
          survey_id: string
          total_spaces?: number | null
        }
        Update: {
          address?: string | null
          compact_spaces?: number | null
          disabled_spaces?: number | null
          entry_count?: number | null
          entry_exit_same?: boolean | null
          ev_spaces?: number | null
          exit_count?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          lot_name?: string | null
          lot_type?: string | null
          lot_type_floor?: number | null
          operator_type?: string | null
          other_spaces?: number | null
          other_spaces_desc?: string | null
          pregnant_spaces?: number | null
          surface_type?: string | null
          surface_type_etc?: string | null
          survey_id?: string
          total_spaces?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_basic_info_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_infra: {
        Row: {
          display_company: string | null
          display_in_use: boolean | null
          display_installed: boolean | null
          display_network: string | null
          display_not_use_reason: string | null
          display_sw_note: string | null
          display_sw_status: string | null
          equipment_company: string | null
          has_barrier: boolean | null
          has_cctv: boolean | null
          has_kiosk: boolean | null
          has_lpr: boolean | null
          id: string
          network_etc: string | null
          network_lte: boolean | null
          network_wifi: boolean | null
          network_wired: boolean | null
          power_note: string | null
          power_status: string | null
          sensor_company: string | null
          sensor_count: number | null
          sensor_in_use: boolean | null
          sensor_installed: boolean | null
          survey_id: string
        }
        Insert: {
          display_company?: string | null
          display_in_use?: boolean | null
          display_installed?: boolean | null
          display_network?: string | null
          display_not_use_reason?: string | null
          display_sw_note?: string | null
          display_sw_status?: string | null
          equipment_company?: string | null
          has_barrier?: boolean | null
          has_cctv?: boolean | null
          has_kiosk?: boolean | null
          has_lpr?: boolean | null
          id?: string
          network_etc?: string | null
          network_lte?: boolean | null
          network_wifi?: boolean | null
          network_wired?: boolean | null
          power_note?: string | null
          power_status?: string | null
          sensor_company?: string | null
          sensor_count?: number | null
          sensor_in_use?: boolean | null
          sensor_installed?: boolean | null
          survey_id: string
        }
        Update: {
          display_company?: string | null
          display_in_use?: boolean | null
          display_installed?: boolean | null
          display_network?: string | null
          display_not_use_reason?: string | null
          display_sw_note?: string | null
          display_sw_status?: string | null
          equipment_company?: string | null
          has_barrier?: boolean | null
          has_cctv?: boolean | null
          has_kiosk?: boolean | null
          has_lpr?: boolean | null
          id?: string
          network_etc?: string | null
          network_lte?: boolean | null
          network_wifi?: boolean | null
          network_wired?: boolean | null
          power_note?: string | null
          power_status?: string | null
          sensor_company?: string | null
          sensor_count?: number | null
          sensor_in_use?: boolean | null
          sensor_installed?: boolean | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_infra_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_operation: {
        Row: {
          control_linked: boolean | null
          id: string
          management_etc: string | null
          management_type: string | null
          operating_hours: string | null
          operating_hours_custom: string | null
          payment_card: boolean | null
          payment_cash: boolean | null
          payment_mobile: boolean | null
          payment_none: boolean | null
          portal_linked: boolean | null
          staff_count: number | null
          staff_type: string | null
          survey_id: string
        }
        Insert: {
          control_linked?: boolean | null
          id?: string
          management_etc?: string | null
          management_type?: string | null
          operating_hours?: string | null
          operating_hours_custom?: string | null
          payment_card?: boolean | null
          payment_cash?: boolean | null
          payment_mobile?: boolean | null
          payment_none?: boolean | null
          portal_linked?: boolean | null
          staff_count?: number | null
          staff_type?: string | null
          survey_id: string
        }
        Update: {
          control_linked?: boolean | null
          id?: string
          management_etc?: string | null
          management_type?: string | null
          operating_hours?: string | null
          operating_hours_custom?: string | null
          payment_card?: boolean | null
          payment_cash?: boolean | null
          payment_mobile?: boolean | null
          payment_none?: boolean | null
          portal_linked?: boolean | null
          staff_count?: number | null
          staff_type?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_operation_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_photos: {
        Row: {
          caption: string | null
          category: string
          created_at: string | null
          file_path: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          sort_order: number | null
          survey_id: string
          taken_at: string | null
          thumbnail_path: string | null
        }
        Insert: {
          caption?: string | null
          category: string
          created_at?: string | null
          file_path: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          sort_order?: number | null
          survey_id: string
          taken_at?: string | null
          thumbnail_path?: string | null
        }
        Update: {
          caption?: string | null
          category?: string
          created_at?: string | null
          file_path?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          sort_order?: number | null
          survey_id?: string
          taken_at?: string | null
          thumbnail_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_photos_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_sensor_plan: {
        Row: {
          display_sw_feasibility: string | null
          display_sw_note: string | null
          gateway_location: string | null
          id: string
          planned_gateways: number | null
          planned_sensors: number | null
          portal_feasibility: string | null
          portal_note: string | null
          survey_id: string
        }
        Insert: {
          display_sw_feasibility?: string | null
          display_sw_note?: string | null
          gateway_location?: string | null
          id?: string
          planned_gateways?: number | null
          planned_sensors?: number | null
          portal_feasibility?: string | null
          portal_note?: string | null
          survey_id: string
        }
        Update: {
          display_sw_feasibility?: string | null
          display_sw_note?: string | null
          gateway_location?: string | null
          id?: string
          planned_gateways?: number | null
          planned_sensors?: number | null
          portal_feasibility?: string | null
          portal_note?: string | null
          survey_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_sensor_plan_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_usage: {
        Row: {
          avg_usage_rate: string | null
          id: string
          peak_afternoon: boolean | null
          peak_free_time: boolean | null
          peak_morning: boolean | null
          peak_night: boolean | null
          survey_id: string
          user_commercial: boolean | null
          user_etc: string | null
          user_residents: boolean | null
          user_tourists: boolean | null
        }
        Insert: {
          avg_usage_rate?: string | null
          id?: string
          peak_afternoon?: boolean | null
          peak_free_time?: boolean | null
          peak_morning?: boolean | null
          peak_night?: boolean | null
          survey_id: string
          user_commercial?: boolean | null
          user_etc?: string | null
          user_residents?: boolean | null
          user_tourists?: boolean | null
        }
        Update: {
          avg_usage_rate?: string | null
          id?: string
          peak_afternoon?: boolean | null
          peak_free_time?: boolean | null
          peak_morning?: boolean | null
          peak_night?: boolean | null
          survey_id?: string
          user_commercial?: boolean | null
          user_etc?: string | null
          user_residents?: boolean | null
          user_tourists?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "survey_usage_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: true
            referencedRelation: "surveys"
            referencedColumns: ["id"]
          },
        ]
      }
      surveys: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          created_at: string | null
          id: string
          lot_id: string
          notes: string | null
          reject_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["survey_status_enum"]
          submitted_at: string | null
          survey_date: string | null
          survey_type: string
          surveyor_id: string | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string | null
          id?: string
          lot_id: string
          notes?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["survey_status_enum"]
          submitted_at?: string | null
          survey_date?: string | null
          survey_type?: string
          surveyor_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          created_at?: string | null
          id?: string
          lot_id?: string
          notes?: string | null
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["survey_status_enum"]
          submitted_at?: string | null
          survey_date?: string | null
          survey_type?: string
          surveyor_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "surveys_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_surveyor_id_fkey"
            columns: ["surveyor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
