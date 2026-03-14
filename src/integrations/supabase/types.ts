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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_contracts: {
        Row: {
          advance_bond_amount: number | null
          advance_payment_amount: number | null
          advance_payment_rate: number | null
          bid_project_id: string
          contract_amount: number
          contract_date: string
          contract_end: string
          contract_number: string
          contract_start: string
          contractor_address: string | null
          contractor_business_number: string | null
          contractor_email: string | null
          contractor_name: string
          contractor_phone: string | null
          contractor_representative: string | null
          created_at: string | null
          created_by: string | null
          defect_bond_amount: number | null
          defect_bond_rate: number | null
          id: string
          payment_terms: Json | null
          penalty_rate: number | null
          performance_bond_amount: number | null
          performance_bond_company: string | null
          performance_bond_end: string | null
          performance_bond_number: string | null
          performance_bond_rate: number | null
          service_project_id: string | null
          signed_at: string | null
          special_conditions: string | null
          status: string | null
          submission_id: string
          termination_date: string | null
          termination_reason: string | null
          total_amount: number
          updated_at: string | null
          vat_amount: number | null
          warranty_end: string | null
          warranty_months: number | null
          work_days: number | null
        }
        Insert: {
          advance_bond_amount?: number | null
          advance_payment_amount?: number | null
          advance_payment_rate?: number | null
          bid_project_id: string
          contract_amount: number
          contract_date: string
          contract_end: string
          contract_number: string
          contract_start: string
          contractor_address?: string | null
          contractor_business_number?: string | null
          contractor_email?: string | null
          contractor_name: string
          contractor_phone?: string | null
          contractor_representative?: string | null
          created_at?: string | null
          created_by?: string | null
          defect_bond_amount?: number | null
          defect_bond_rate?: number | null
          id?: string
          payment_terms?: Json | null
          penalty_rate?: number | null
          performance_bond_amount?: number | null
          performance_bond_company?: string | null
          performance_bond_end?: string | null
          performance_bond_number?: string | null
          performance_bond_rate?: number | null
          service_project_id?: string | null
          signed_at?: string | null
          special_conditions?: string | null
          status?: string | null
          submission_id: string
          termination_date?: string | null
          termination_reason?: string | null
          total_amount: number
          updated_at?: string | null
          vat_amount?: number | null
          warranty_end?: string | null
          warranty_months?: number | null
          work_days?: number | null
        }
        Update: {
          advance_bond_amount?: number | null
          advance_payment_amount?: number | null
          advance_payment_rate?: number | null
          bid_project_id?: string
          contract_amount?: number
          contract_date?: string
          contract_end?: string
          contract_number?: string
          contract_start?: string
          contractor_address?: string | null
          contractor_business_number?: string | null
          contractor_email?: string | null
          contractor_name?: string
          contractor_phone?: string | null
          contractor_representative?: string | null
          created_at?: string | null
          created_by?: string | null
          defect_bond_amount?: number | null
          defect_bond_rate?: number | null
          id?: string
          payment_terms?: Json | null
          penalty_rate?: number | null
          performance_bond_amount?: number | null
          performance_bond_company?: string | null
          performance_bond_end?: string | null
          performance_bond_number?: string | null
          performance_bond_rate?: number | null
          service_project_id?: string | null
          signed_at?: string | null
          special_conditions?: string | null
          status?: string | null
          submission_id?: string
          termination_date?: string | null
          termination_reason?: string | null
          total_amount?: number
          updated_at?: string | null
          vat_amount?: number | null
          warranty_end?: string | null
          warranty_months?: number | null
          work_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_contracts_bid_project_id_fkey"
            columns: ["bid_project_id"]
            isOneToOne: false
            referencedRelation: "bid_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_contracts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "bid_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_documents: {
        Row: {
          bid_project_id: string
          contract_id: string | null
          created_at: string | null
          description: string | null
          doc_category: string
          doc_type: string
          file_format: string | null
          file_path: string
          file_size: number | null
          id: string
          is_current: boolean | null
          is_public: boolean | null
          title: string
          uploaded_by: string | null
          version: string | null
        }
        Insert: {
          bid_project_id: string
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          doc_category?: string
          doc_type: string
          file_format?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          is_public?: boolean | null
          title: string
          uploaded_by?: string | null
          version?: string | null
        }
        Update: {
          bid_project_id?: string
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          doc_category?: string
          doc_type?: string
          file_format?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          is_public?: boolean | null
          title?: string
          uploaded_by?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_documents_bid_project_id_fkey"
            columns: ["bid_project_id"]
            isOneToOne: false
            referencedRelation: "bid_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_documents_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "bid_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_evaluations: {
        Row: {
          bid_project_id: string
          business_score: number | null
          comments: string | null
          created_at: string | null
          disqualification_reason: string | null
          evaluation_date: string | null
          evaluation_detail: Json | null
          evaluator_id: string | null
          evaluator_name: string | null
          evaluator_org: string | null
          id: string
          is_qualified: boolean | null
          performance_score: number | null
          price_score: number | null
          rank: number | null
          strengths: string | null
          submission_id: string
          technical_score: number | null
          total_score: number | null
          updated_at: string | null
          weaknesses: string | null
        }
        Insert: {
          bid_project_id: string
          business_score?: number | null
          comments?: string | null
          created_at?: string | null
          disqualification_reason?: string | null
          evaluation_date?: string | null
          evaluation_detail?: Json | null
          evaluator_id?: string | null
          evaluator_name?: string | null
          evaluator_org?: string | null
          id?: string
          is_qualified?: boolean | null
          performance_score?: number | null
          price_score?: number | null
          rank?: number | null
          strengths?: string | null
          submission_id: string
          technical_score?: number | null
          total_score?: number | null
          updated_at?: string | null
          weaknesses?: string | null
        }
        Update: {
          bid_project_id?: string
          business_score?: number | null
          comments?: string | null
          created_at?: string | null
          disqualification_reason?: string | null
          evaluation_date?: string | null
          evaluation_detail?: Json | null
          evaluator_id?: string | null
          evaluator_name?: string | null
          evaluator_org?: string | null
          id?: string
          is_qualified?: boolean | null
          performance_score?: number | null
          price_score?: number | null
          rank?: number | null
          strengths?: string | null
          submission_id?: string
          technical_score?: number | null
          total_score?: number | null
          updated_at?: string | null
          weaknesses?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_evaluations_bid_project_id_fkey"
            columns: ["bid_project_id"]
            isOneToOne: false
            referencedRelation: "bid_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_evaluations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "bid_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_projects: {
        Row: {
          announce_date: string | null
          assigned_to: string | null
          bid_deadline: string | null
          bid_number: string
          bid_open_date: string | null
          bid_open_location: string | null
          bid_start_date: string | null
          bid_type: string
          budget_available_amount: number | null
          budget_item_id: string | null
          cancel_reason: string | null
          category: string | null
          contract_amount: number | null
          contract_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          design_amount: number | null
          estimated_amount: number | null
          evaluation_criteria: Json | null
          evaluation_method: string | null
          id: string
          location: string | null
          lot_id: string | null
          lowest_price_rate: number | null
          nara_ref: string | null
          nara_url: string | null
          previous_bid_id: string | null
          qualification: string | null
          qualification_criteria: Json | null
          rebid_count: number | null
          savings_rate: number | null
          scope_of_work: string | null
          status: string
          successful_bidder: string | null
          title: string
          updated_at: string | null
          vat_included: boolean | null
          work_end_date: string | null
          work_period_days: number | null
          work_start_date: string | null
        }
        Insert: {
          announce_date?: string | null
          assigned_to?: string | null
          bid_deadline?: string | null
          bid_number: string
          bid_open_date?: string | null
          bid_open_location?: string | null
          bid_start_date?: string | null
          bid_type: string
          budget_available_amount?: number | null
          budget_item_id?: string | null
          cancel_reason?: string | null
          category?: string | null
          contract_amount?: number | null
          contract_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          design_amount?: number | null
          estimated_amount?: number | null
          evaluation_criteria?: Json | null
          evaluation_method?: string | null
          id?: string
          location?: string | null
          lot_id?: string | null
          lowest_price_rate?: number | null
          nara_ref?: string | null
          nara_url?: string | null
          previous_bid_id?: string | null
          qualification?: string | null
          qualification_criteria?: Json | null
          rebid_count?: number | null
          savings_rate?: number | null
          scope_of_work?: string | null
          status?: string
          successful_bidder?: string | null
          title: string
          updated_at?: string | null
          vat_included?: boolean | null
          work_end_date?: string | null
          work_period_days?: number | null
          work_start_date?: string | null
        }
        Update: {
          announce_date?: string | null
          assigned_to?: string | null
          bid_deadline?: string | null
          bid_number?: string
          bid_open_date?: string | null
          bid_open_location?: string | null
          bid_start_date?: string | null
          bid_type?: string
          budget_available_amount?: number | null
          budget_item_id?: string | null
          cancel_reason?: string | null
          category?: string | null
          contract_amount?: number | null
          contract_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          design_amount?: number | null
          estimated_amount?: number | null
          evaluation_criteria?: Json | null
          evaluation_method?: string | null
          id?: string
          location?: string | null
          lot_id?: string | null
          lowest_price_rate?: number | null
          nara_ref?: string | null
          nara_url?: string | null
          previous_bid_id?: string | null
          qualification?: string | null
          qualification_criteria?: Json | null
          rebid_count?: number | null
          savings_rate?: number | null
          scope_of_work?: string | null
          status?: string
          successful_bidder?: string | null
          title?: string
          updated_at?: string | null
          vat_included?: boolean | null
          work_end_date?: string | null
          work_period_days?: number | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_projects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_projects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_projects_previous_bid_id_fkey"
            columns: ["previous_bid_id"]
            isOneToOne: false
            referencedRelation: "bid_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bid_submissions: {
        Row: {
          annual_revenue: number | null
          bid_amount: number | null
          bid_project_id: string
          bid_rate: number | null
          business_number: string | null
          company_address: string | null
          company_name: string
          contact_email: string | null
          contact_fax: string | null
          contact_person: string | null
          contact_phone: string | null
          created_at: string | null
          documents: Json | null
          employee_count: number | null
          established_date: string | null
          id: string
          invalid_reason: string | null
          invalidated_at: string | null
          invalidated_by: string | null
          is_valid: boolean | null
          main_business: string | null
          notes: string | null
          past_performance: Json | null
          representative: string | null
          submission_number: string
          submitted_at: string | null
          updated_at: string | null
        }
        Insert: {
          annual_revenue?: number | null
          bid_amount?: number | null
          bid_project_id: string
          bid_rate?: number | null
          business_number?: string | null
          company_address?: string | null
          company_name: string
          contact_email?: string | null
          contact_fax?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          documents?: Json | null
          employee_count?: number | null
          established_date?: string | null
          id?: string
          invalid_reason?: string | null
          invalidated_at?: string | null
          invalidated_by?: string | null
          is_valid?: boolean | null
          main_business?: string | null
          notes?: string | null
          past_performance?: Json | null
          representative?: string | null
          submission_number: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Update: {
          annual_revenue?: number | null
          bid_amount?: number | null
          bid_project_id?: string
          bid_rate?: number | null
          business_number?: string | null
          company_address?: string | null
          company_name?: string
          contact_email?: string | null
          contact_fax?: string | null
          contact_person?: string | null
          contact_phone?: string | null
          created_at?: string | null
          documents?: Json | null
          employee_count?: number | null
          established_date?: string | null
          id?: string
          invalid_reason?: string | null
          invalidated_at?: string | null
          invalidated_by?: string | null
          is_valid?: boolean | null
          main_business?: string | null
          notes?: string | null
          past_performance?: Json | null
          representative?: string | null
          submission_number?: string
          submitted_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bid_submissions_bid_project_id_fkey"
            columns: ["bid_project_id"]
            isOneToOne: false
            referencedRelation: "bid_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bid_submissions_invalidated_by_fkey"
            columns: ["invalidated_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "bid_submissions_invalidated_by_fkey"
            columns: ["invalidated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_executions: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          created_at: string | null
          created_by: string | null
          description: string
          document_date: string | null
          document_number: string | null
          execution_date: string
          execution_number: string
          execution_type: string
          id: string
          item_id: string
          lot_id: string | null
          notes: string | null
          payment_method: string | null
          receipt_path: string | null
          reference_id: string | null
          reference_module: string | null
          reference_number: string | null
          reject_reason: string | null
          requested_by: string | null
          status: string
          updated_at: string | null
          vendor_business_number: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          document_date?: string | null
          document_number?: string | null
          execution_date: string
          execution_number: string
          execution_type: string
          id?: string
          item_id: string
          lot_id?: string | null
          notes?: string | null
          payment_method?: string | null
          receipt_path?: string | null
          reference_id?: string | null
          reference_module?: string | null
          reference_number?: string | null
          reject_reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string | null
          vendor_business_number?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          document_date?: string | null
          document_number?: string | null
          execution_date?: string
          execution_number?: string
          execution_type?: string
          id?: string
          item_id?: string
          lot_id?: string | null
          notes?: string | null
          payment_method?: string | null
          receipt_path?: string | null
          reference_id?: string | null
          reference_module?: string | null
          reference_number?: string | null
          reject_reason?: string | null
          requested_by?: string | null
          status?: string
          updated_at?: string | null
          vendor_business_number?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_executions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_executions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_executions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_executions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_executions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_executions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_executions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_executions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_executions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_items: {
        Row: {
          allocated_amount: number | null
          budget_type: string
          category_l1: string
          category_l2: string | null
          category_l3: string | null
          category_l4: string | null
          created_at: string | null
          depth: number | null
          description: string | null
          executed_amount: number | null
          execution_rate: number | null
          frequency: string | null
          id: string
          is_mandatory: boolean | null
          is_recurring: boolean | null
          is_summary: boolean | null
          item_code: string
          item_name: string
          lot_id: string | null
          notes: string | null
          parent_item_id: string | null
          plan_id: string
          planned_amount: number | null
          previous_year_amount: number | null
          remaining_amount: number | null
          requested_amount: number | null
          responsible_person: string | null
          responsible_team: Database["public"]["Enums"]["team_type"] | null
          returned_amount: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          allocated_amount?: number | null
          budget_type: string
          category_l1: string
          category_l2?: string | null
          category_l3?: string | null
          category_l4?: string | null
          created_at?: string | null
          depth?: number | null
          description?: string | null
          executed_amount?: number | null
          execution_rate?: number | null
          frequency?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_recurring?: boolean | null
          is_summary?: boolean | null
          item_code: string
          item_name: string
          lot_id?: string | null
          notes?: string | null
          parent_item_id?: string | null
          plan_id: string
          planned_amount?: number | null
          previous_year_amount?: number | null
          remaining_amount?: number | null
          requested_amount?: number | null
          responsible_person?: string | null
          responsible_team?: Database["public"]["Enums"]["team_type"] | null
          returned_amount?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          allocated_amount?: number | null
          budget_type?: string
          category_l1?: string
          category_l2?: string | null
          category_l3?: string | null
          category_l4?: string | null
          created_at?: string | null
          depth?: number | null
          description?: string | null
          executed_amount?: number | null
          execution_rate?: number | null
          frequency?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_recurring?: boolean | null
          is_summary?: boolean | null
          item_code?: string
          item_name?: string
          lot_id?: string | null
          notes?: string | null
          parent_item_id?: string | null
          plan_id?: string
          planned_amount?: number | null
          previous_year_amount?: number | null
          remaining_amount?: number | null
          requested_amount?: number | null
          responsible_person?: string | null
          responsible_team?: Database["public"]["Enums"]["team_type"] | null
          returned_amount?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plan_summary"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "budget_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_items_responsible_person_fkey"
            columns: ["responsible_person"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_items_responsible_person_fkey"
            columns: ["responsible_person"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          balance: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          fiscal_year: number
          id: string
          notes: string | null
          plan_number: number | null
          plan_type: string
          reject_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string
          total_expenditure: number | null
          total_revenue: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          balance?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fiscal_year: number
          id?: string
          notes?: string | null
          plan_number?: number | null
          plan_type?: string
          reject_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          total_expenditure?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          balance?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          fiscal_year?: number
          id?: string
          notes?: string | null
          plan_number?: number | null
          plan_type?: string
          reject_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          total_expenditure?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_plans_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_plans_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_plans_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_transfers: {
        Row: {
          amount: number
          approval_number: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          fiscal_year: number
          from_item_id: string
          id: string
          legal_basis: string | null
          notes: string | null
          reason: string
          reject_reason: string | null
          requested_by: string | null
          status: string
          to_item_id: string
          transfer_number: string
          transfer_type: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          approval_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          fiscal_year: number
          from_item_id: string
          id?: string
          legal_basis?: string | null
          notes?: string | null
          reason: string
          reject_reason?: string | null
          requested_by?: string | null
          status?: string
          to_item_id: string
          transfer_number: string
          transfer_type: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          approval_number?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          fiscal_year?: number
          from_item_id?: string
          id?: string
          legal_basis?: string | null
          notes?: string | null
          reason?: string
          reject_reason?: string | null
          requested_by?: string | null
          status?: string
          to_item_id?: string
          transfer_number?: string
          transfer_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "budget_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "budget_items"
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
      complaint_comments: {
        Row: {
          attachment_path: string | null
          author_id: string
          author_name: string | null
          comment_type: string | null
          complaint_id: string
          content: string
          created_at: string | null
          id: string
          is_system: boolean | null
          status_from: string | null
          status_to: string | null
        }
        Insert: {
          attachment_path?: string | null
          author_id: string
          author_name?: string | null
          comment_type?: string | null
          complaint_id: string
          content: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          status_from?: string | null
          status_to?: string | null
        }
        Update: {
          attachment_path?: string | null
          author_id?: string
          author_name?: string | null
          comment_type?: string | null
          complaint_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_system?: boolean | null
          status_from?: string | null
          status_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaint_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "complaint_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_comments_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_at: string | null
          assigned_team: Database["public"]["Enums"]["team_type"] | null
          assigned_to: string | null
          attachment_paths: Json | null
          category: string
          channel: string
          closed_at: string | null
          closed_by: string | null
          complainant_address: string | null
          complainant_email: string | null
          complainant_name: string | null
          complainant_phone: string | null
          complaint_number: string
          content: string
          created_at: string | null
          created_by: string | null
          due_date: string | null
          due_days: number | null
          external_ref: string | null
          id: string
          incident_date: string | null
          incident_time: string | null
          is_anonymous: boolean | null
          is_overdue: boolean | null
          is_repeat: boolean | null
          location_detail: string | null
          lot_id: string | null
          notes: string | null
          priority: string | null
          received_at: string | null
          related_complaint_id: string | null
          repeat_count: number | null
          resolution_type: string | null
          responded_at: string | null
          response: string | null
          response_channel: string | null
          response_type: string | null
          saeol_ref: string | null
          saeol_status: string | null
          satisfaction_date: string | null
          satisfaction_feedback: string | null
          satisfaction_score: number | null
          status: string
          status_changed_at: string | null
          sub_category: string | null
          title: string
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_team?: Database["public"]["Enums"]["team_type"] | null
          assigned_to?: string | null
          attachment_paths?: Json | null
          category: string
          channel: string
          closed_at?: string | null
          closed_by?: string | null
          complainant_address?: string | null
          complainant_email?: string | null
          complainant_name?: string | null
          complainant_phone?: string | null
          complaint_number: string
          content: string
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          due_days?: number | null
          external_ref?: string | null
          id?: string
          incident_date?: string | null
          incident_time?: string | null
          is_anonymous?: boolean | null
          is_overdue?: boolean | null
          is_repeat?: boolean | null
          location_detail?: string | null
          lot_id?: string | null
          notes?: string | null
          priority?: string | null
          received_at?: string | null
          related_complaint_id?: string | null
          repeat_count?: number | null
          resolution_type?: string | null
          responded_at?: string | null
          response?: string | null
          response_channel?: string | null
          response_type?: string | null
          saeol_ref?: string | null
          saeol_status?: string | null
          satisfaction_date?: string | null
          satisfaction_feedback?: string | null
          satisfaction_score?: number | null
          status?: string
          status_changed_at?: string | null
          sub_category?: string | null
          title: string
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_team?: Database["public"]["Enums"]["team_type"] | null
          assigned_to?: string | null
          attachment_paths?: Json | null
          category?: string
          channel?: string
          closed_at?: string | null
          closed_by?: string | null
          complainant_address?: string | null
          complainant_email?: string | null
          complainant_name?: string | null
          complainant_phone?: string | null
          complaint_number?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          due_date?: string | null
          due_days?: number | null
          external_ref?: string | null
          id?: string
          incident_date?: string | null
          incident_time?: string | null
          is_anonymous?: boolean | null
          is_overdue?: boolean | null
          is_repeat?: boolean | null
          location_detail?: string | null
          lot_id?: string | null
          notes?: string | null
          priority?: string | null
          received_at?: string | null
          related_complaint_id?: string | null
          repeat_count?: number | null
          resolution_type?: string | null
          responded_at?: string | null
          response?: string | null
          response_channel?: string | null
          response_type?: string | null
          saeol_ref?: string | null
          saeol_status?: string | null
          satisfaction_date?: string | null
          satisfaction_feedback?: string | null
          satisfaction_score?: number | null
          status?: string
          status_changed_at?: string | null
          sub_category?: string | null
          title?: string
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "complaints_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "complaints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_related_complaint_id_fkey"
            columns: ["related_complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_projects: {
        Row: {
          actual_completion: string | null
          bid_contract_id: string | null
          budget_execution_rate: number | null
          budget_item_id: string | null
          construction_cost: number | null
          construction_end: string | null
          construction_start: string | null
          contractor: string | null
          contractor_phone: string | null
          created_at: string | null
          created_by: string | null
          delay_days: number | null
          delay_reason: string | null
          description: string | null
          design_cost: number | null
          design_end: string | null
          design_start: string | null
          designer: string | null
          id: string
          lot_id: string | null
          notes: string | null
          other_cost: number | null
          permits_completed: number | null
          permits_required: Json | null
          permits_total: number | null
          phase: string
          planning_end: string | null
          planning_start: string | null
          progress_detail: Json | null
          progress_pct: number | null
          project_name: string
          project_number: string
          project_type: string
          remaining: number | null
          service_project_id: string | null
          site_id: string | null
          spent: number | null
          status: string | null
          supervision_cost: number | null
          supervisor: string | null
          supervisor_phone: string | null
          target_completion: string | null
          total_budget: number | null
          updated_at: string | null
        }
        Insert: {
          actual_completion?: string | null
          bid_contract_id?: string | null
          budget_execution_rate?: number | null
          budget_item_id?: string | null
          construction_cost?: number | null
          construction_end?: string | null
          construction_start?: string | null
          contractor?: string | null
          contractor_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          delay_days?: number | null
          delay_reason?: string | null
          description?: string | null
          design_cost?: number | null
          design_end?: string | null
          design_start?: string | null
          designer?: string | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          other_cost?: number | null
          permits_completed?: number | null
          permits_required?: Json | null
          permits_total?: number | null
          phase?: string
          planning_end?: string | null
          planning_start?: string | null
          progress_detail?: Json | null
          progress_pct?: number | null
          project_name: string
          project_number: string
          project_type: string
          remaining?: number | null
          service_project_id?: string | null
          site_id?: string | null
          spent?: number | null
          status?: string | null
          supervision_cost?: number | null
          supervisor?: string | null
          supervisor_phone?: string | null
          target_completion?: string | null
          total_budget?: number | null
          updated_at?: string | null
        }
        Update: {
          actual_completion?: string | null
          bid_contract_id?: string | null
          budget_execution_rate?: number | null
          budget_item_id?: string | null
          construction_cost?: number | null
          construction_end?: string | null
          construction_start?: string | null
          contractor?: string | null
          contractor_phone?: string | null
          created_at?: string | null
          created_by?: string | null
          delay_days?: number | null
          delay_reason?: string | null
          description?: string | null
          design_cost?: number | null
          design_end?: string | null
          design_start?: string | null
          designer?: string | null
          id?: string
          lot_id?: string | null
          notes?: string | null
          other_cost?: number | null
          permits_completed?: number | null
          permits_required?: Json | null
          permits_total?: number | null
          phase?: string
          planning_end?: string | null
          planning_start?: string | null
          progress_detail?: Json | null
          progress_pct?: number | null
          project_name?: string
          project_number?: string
          project_type?: string
          remaining?: number | null
          service_project_id?: string | null
          site_id?: string | null
          spent?: number | null
          status?: string | null
          supervision_cost?: number | null
          supervisor?: string | null
          supervisor_phone?: string | null
          target_completion?: string | null
          total_budget?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "construction_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "site_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "construction_projects_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "site_evaluation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          chart_config: Json | null
          chart_type: string | null
          created_at: string | null
          dashboard_name: string | null
          data_config: Json
          data_source: string
          description: string | null
          display_config: Json | null
          height: number | null
          id: string
          is_visible: boolean | null
          lot_filter: Json | null
          period_filter: Json | null
          position_x: number | null
          position_y: number | null
          sort_order: number | null
          title: string
          updated_at: string | null
          user_id: string
          widget_type: string
          width: number | null
        }
        Insert: {
          chart_config?: Json | null
          chart_type?: string | null
          created_at?: string | null
          dashboard_name?: string | null
          data_config: Json
          data_source: string
          description?: string | null
          display_config?: Json | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          lot_filter?: Json | null
          period_filter?: Json | null
          position_x?: number | null
          position_y?: number | null
          sort_order?: number | null
          title: string
          updated_at?: string | null
          user_id: string
          widget_type: string
          width?: number | null
        }
        Update: {
          chart_config?: Json | null
          chart_type?: string | null
          created_at?: string | null
          dashboard_name?: string | null
          data_config?: Json
          data_source?: string
          description?: string | null
          display_config?: Json | null
          height?: number | null
          id?: string
          is_visible?: boolean | null
          lot_filter?: Json | null
          period_filter?: Json | null
          position_x?: number | null
          position_y?: number | null
          sort_order?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
          widget_type?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "dashboard_widgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string | null
          created_at: string | null
          description: string | null
          doc_number: string
          doc_type: string
          file_format: string | null
          file_path: string
          file_size: number | null
          id: string
          is_current: boolean | null
          previous_version_id: string | null
          project_id: string
          review_comments: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          tags: Json | null
          title: string
          uploaded_by: string | null
          version: string
          version_note: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          doc_number: string
          doc_type: string
          file_format?: string | null
          file_path: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          previous_version_id?: string | null
          project_id: string
          review_comments?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tags?: Json | null
          title: string
          uploaded_by?: string | null
          version?: string
          version_note?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          doc_number?: string
          doc_type?: string
          file_format?: string | null
          file_path?: string
          file_size?: number | null
          id?: string
          is_current?: boolean | null
          previous_version_id?: string | null
          project_id?: string
          review_comments?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tags?: Json | null
          title?: string
          uploaded_by?: string | null
          version?: string
          version_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_documents_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "design_documents_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "design_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "construction_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "construction_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_evaluation_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "design_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "design_documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "design_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      display_boards: {
        Row: {
          board_id: string
          board_name: string | null
          created_at: string | null
          current_message: string | null
          direction: string | null
          display_size: string | null
          display_template: Json | null
          display_type: string | null
          floor: number | null
          id: string
          install_date: string | null
          ip_address: string | null
          last_error: string | null
          last_push: string | null
          last_push_success: boolean | null
          location: string | null
          location_type: string | null
          lot_id: string
          manufacturer: string | null
          max_lines: number | null
          model: string | null
          notes: string | null
          port: number | null
          protocol: string | null
          push_interval_sec: number | null
          serial_config: Json | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          board_id: string
          board_name?: string | null
          created_at?: string | null
          current_message?: string | null
          direction?: string | null
          display_size?: string | null
          display_template?: Json | null
          display_type?: string | null
          floor?: number | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_error?: string | null
          last_push?: string | null
          last_push_success?: boolean | null
          location?: string | null
          location_type?: string | null
          lot_id: string
          manufacturer?: string | null
          max_lines?: number | null
          model?: string | null
          notes?: string | null
          port?: number | null
          protocol?: string | null
          push_interval_sec?: number | null
          serial_config?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          board_id?: string
          board_name?: string | null
          created_at?: string | null
          current_message?: string | null
          direction?: string | null
          display_size?: string | null
          display_template?: Json | null
          display_type?: string | null
          floor?: number | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_error?: string | null
          last_push?: string | null
          last_push_success?: boolean | null
          location?: string | null
          location_type?: string | null
          lot_id?: string
          manufacturer?: string | null
          max_lines?: number | null
          model?: string | null
          notes?: string | null
          port?: number | null
          protocol?: string | null
          push_interval_sec?: number | null
          serial_config?: Json | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "display_boards_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_boards_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "enforcement_records_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enforcement_records_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
            foreignKeyName: "equipment_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
          {
            foreignKeyName: "fee_exemptions_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
          {
            foreignKeyName: "fee_policies_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
          {
            foreignKeyName: "free_hours_settings_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_devices: {
        Row: {
          alert_offline_minutes: number | null
          alert_sent: boolean | null
          config: Json | null
          connected_sensors: number | null
          created_at: string | null
          device_id: string
          device_name: string | null
          firmware_version: string | null
          floor: number | null
          hardware_version: string | null
          id: string
          install_date: string | null
          ip_address: string | null
          last_data_received: string | null
          last_heartbeat: string | null
          location_detail: string | null
          lot_id: string
          mac_address: string | null
          max_sensors: number | null
          mqtt_topic: string | null
          notes: string | null
          protocol: string | null
          registered_by: string | null
          restart_count: number | null
          status: string | null
          status_changed_at: string | null
          subnet: string | null
          updated_at: string | null
          uptime_hours: number | null
        }
        Insert: {
          alert_offline_minutes?: number | null
          alert_sent?: boolean | null
          config?: Json | null
          connected_sensors?: number | null
          created_at?: string | null
          device_id: string
          device_name?: string | null
          firmware_version?: string | null
          floor?: number | null
          hardware_version?: string | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_data_received?: string | null
          last_heartbeat?: string | null
          location_detail?: string | null
          lot_id: string
          mac_address?: string | null
          max_sensors?: number | null
          mqtt_topic?: string | null
          notes?: string | null
          protocol?: string | null
          registered_by?: string | null
          restart_count?: number | null
          status?: string | null
          status_changed_at?: string | null
          subnet?: string | null
          updated_at?: string | null
          uptime_hours?: number | null
        }
        Update: {
          alert_offline_minutes?: number | null
          alert_sent?: boolean | null
          config?: Json | null
          connected_sensors?: number | null
          created_at?: string | null
          device_id?: string
          device_name?: string | null
          firmware_version?: string | null
          floor?: number | null
          hardware_version?: string | null
          id?: string
          install_date?: string | null
          ip_address?: string | null
          last_data_received?: string | null
          last_heartbeat?: string | null
          location_detail?: string | null
          lot_id?: string
          mac_address?: string | null
          max_sensors?: number | null
          mqtt_topic?: string | null
          notes?: string | null
          protocol?: string | null
          registered_by?: string | null
          restart_count?: number | null
          status?: string | null
          status_changed_at?: string | null
          subnet?: string | null
          updated_at?: string | null
          uptime_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_devices_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "gateway_devices_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_realtime_status: {
        Row: {
          available_disabled: number | null
          available_ev: number | null
          available_spaces: number | null
          congestion_level: string | null
          gate_calculated_occupied: number | null
          gate_count_in: number | null
          gate_count_out: number | null
          last_gate_update: string | null
          last_sensor_update: string | null
          last_updated: string | null
          lot_id: string
          occupancy_rate: number | null
          occupied_compact: number | null
          occupied_disabled: number | null
          occupied_ev: number | null
          occupied_spaces: number | null
          sensor_vs_gate_diff: number | null
          status: string | null
          today_avg_duration_min: number | null
          today_peak_occupied: number | null
          today_peak_time: string | null
          today_total_in: number | null
          today_total_out: number | null
          total_spaces: number | null
        }
        Insert: {
          available_disabled?: number | null
          available_ev?: number | null
          available_spaces?: number | null
          congestion_level?: string | null
          gate_calculated_occupied?: number | null
          gate_count_in?: number | null
          gate_count_out?: number | null
          last_gate_update?: string | null
          last_sensor_update?: string | null
          last_updated?: string | null
          lot_id: string
          occupancy_rate?: number | null
          occupied_compact?: number | null
          occupied_disabled?: number | null
          occupied_ev?: number | null
          occupied_spaces?: number | null
          sensor_vs_gate_diff?: number | null
          status?: string | null
          today_avg_duration_min?: number | null
          today_peak_occupied?: number | null
          today_peak_time?: string | null
          today_total_in?: number | null
          today_total_out?: number | null
          total_spaces?: number | null
        }
        Update: {
          available_disabled?: number | null
          available_ev?: number | null
          available_spaces?: number | null
          congestion_level?: string | null
          gate_calculated_occupied?: number | null
          gate_count_in?: number | null
          gate_count_out?: number | null
          last_gate_update?: string | null
          last_sensor_update?: string | null
          last_updated?: string | null
          lot_id?: string
          occupancy_rate?: number | null
          occupied_compact?: number | null
          occupied_disabled?: number | null
          occupied_ev?: number | null
          occupied_spaces?: number | null
          sensor_vs_gate_diff?: number | null
          status?: string | null
          today_avg_duration_min?: number | null
          today_peak_occupied?: number | null
          today_peak_time?: string | null
          today_total_in?: number | null
          today_total_out?: number | null
          total_spaces?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_realtime_status_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lot_realtime_status_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: true
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
            foreignKeyName: "maintenance_logs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
          {
            foreignKeyName: "maintenance_schedules_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            foreignKeyName: "monthly_passes_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
          {
            foreignKeyName: "operations_staff_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
          {
            foreignKeyName: "outsourcing_contracts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
          {
            foreignKeyName: "parking_spaces_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      permits: {
        Row: {
          actual_approval_date: string | null
          application_date: string | null
          application_doc_path: string | null
          approval_doc_path: string | null
          assigned_to: string | null
          authority: string
          authority_contact: string | null
          authority_department: string | null
          conditions: string | null
          created_at: string | null
          expiry_date: string | null
          fee_amount: number | null
          fee_paid: boolean | null
          id: string
          notes: string | null
          permit_category: string | null
          permit_number: string | null
          permit_type: string
          project_id: string
          rejection_reason: string | null
          required_documents: Json | null
          resubmission_count: number | null
          resubmission_date: string | null
          status: string | null
          submitted_documents: Json | null
          target_approval_date: string | null
          updated_at: string | null
        }
        Insert: {
          actual_approval_date?: string | null
          application_date?: string | null
          application_doc_path?: string | null
          approval_doc_path?: string | null
          assigned_to?: string | null
          authority: string
          authority_contact?: string | null
          authority_department?: string | null
          conditions?: string | null
          created_at?: string | null
          expiry_date?: string | null
          fee_amount?: number | null
          fee_paid?: boolean | null
          id?: string
          notes?: string | null
          permit_category?: string | null
          permit_number?: string | null
          permit_type: string
          project_id: string
          rejection_reason?: string | null
          required_documents?: Json | null
          resubmission_count?: number | null
          resubmission_date?: string | null
          status?: string | null
          submitted_documents?: Json | null
          target_approval_date?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_approval_date?: string | null
          application_date?: string | null
          application_doc_path?: string | null
          approval_doc_path?: string | null
          assigned_to?: string | null
          authority?: string
          authority_contact?: string | null
          authority_department?: string | null
          conditions?: string | null
          created_at?: string | null
          expiry_date?: string | null
          fee_amount?: number | null
          fee_paid?: boolean | null
          id?: string
          notes?: string | null
          permit_category?: string | null
          permit_number?: string | null
          permit_type?: string
          project_id?: string
          rejection_reason?: string | null
          required_documents?: Json | null
          resubmission_count?: number | null
          resubmission_date?: string | null
          status?: string | null
          submitted_documents?: Json | null
          target_approval_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "permits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "construction_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "construction_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "site_evaluation_summary"
            referencedColumns: ["project_id"]
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
      report_generated: {
        Row: {
          created_at: string | null
          data_snapshot: Json | null
          description: string | null
          error_message: string | null
          excel_path: string | null
          file_format: string | null
          file_path: string | null
          file_size: number | null
          generated_by: string | null
          generation_time_ms: number | null
          hwp_path: string | null
          id: string
          is_shared: boolean | null
          page_count: number | null
          parameters_used: Json | null
          period_end: string | null
          period_start: string | null
          period_type: string | null
          report_number: string
          shared_at: string | null
          shared_with: Json | null
          status: string | null
          summary_data: Json | null
          target_lots: Json | null
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string | null
          data_snapshot?: Json | null
          description?: string | null
          error_message?: string | null
          excel_path?: string | null
          file_format?: string | null
          file_path?: string | null
          file_size?: number | null
          generated_by?: string | null
          generation_time_ms?: number | null
          hwp_path?: string | null
          id?: string
          is_shared?: boolean | null
          page_count?: number | null
          parameters_used?: Json | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          report_number: string
          shared_at?: string | null
          shared_with?: Json | null
          status?: string | null
          summary_data?: Json | null
          target_lots?: Json | null
          template_id: string
          title: string
        }
        Update: {
          created_at?: string | null
          data_snapshot?: Json | null
          description?: string | null
          error_message?: string | null
          excel_path?: string | null
          file_format?: string | null
          file_path?: string | null
          file_size?: number | null
          generated_by?: string | null
          generation_time_ms?: number | null
          hwp_path?: string | null
          id?: string
          is_shared?: boolean | null
          page_count?: number | null
          parameters_used?: Json | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string | null
          report_number?: string
          shared_at?: string | null
          shared_with?: Json | null
          status?: string | null
          summary_data?: Json | null
          target_lots?: Json | null
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_generated_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "report_generated_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_generated_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          consecutive_fails: number | null
          created_at: string | null
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          email_body: string | null
          email_subject: string | null
          execution_time: string | null
          fail_count: number | null
          frequency: string
          id: string
          include_excel: boolean | null
          is_active: boolean | null
          last_report_id: string | null
          last_run: string | null
          last_status: string | null
          month_of_year: number | null
          next_run: string | null
          output_format: string | null
          parameters: Json | null
          recipients: Json
          run_count: number | null
          schedule_name: string
          send_method: string | null
          target_lots: Json | null
          template_id: string
          updated_at: string | null
        }
        Insert: {
          consecutive_fails?: number | null
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          email_body?: string | null
          email_subject?: string | null
          execution_time?: string | null
          fail_count?: number | null
          frequency: string
          id?: string
          include_excel?: boolean | null
          is_active?: boolean | null
          last_report_id?: string | null
          last_run?: string | null
          last_status?: string | null
          month_of_year?: number | null
          next_run?: string | null
          output_format?: string | null
          parameters?: Json | null
          recipients: Json
          run_count?: number | null
          schedule_name: string
          send_method?: string | null
          target_lots?: Json | null
          template_id: string
          updated_at?: string | null
        }
        Update: {
          consecutive_fails?: number | null
          created_at?: string | null
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          email_body?: string | null
          email_subject?: string | null
          execution_time?: string | null
          fail_count?: number | null
          frequency?: string
          id?: string
          include_excel?: boolean | null
          is_active?: boolean | null
          last_report_id?: string | null
          last_run?: string | null
          last_status?: string | null
          month_of_year?: number | null
          next_run?: string | null
          output_format?: string | null
          parameters?: Json | null
          recipients?: Json
          run_count?: number | null
          schedule_name?: string
          send_method?: string | null
          target_lots?: Json | null
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "report_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_last_report_id_fkey"
            columns: ["last_report_id"]
            isOneToOne: false
            referencedRelation: "report_generated"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          data_sources: Json | null
          description: string | null
          footer_config: Json | null
          header_config: Json | null
          id: string
          is_favorite: boolean | null
          is_system: boolean | null
          name: string
          page_orientation: string | null
          page_size: string | null
          parameters: Json | null
          report_category: string | null
          report_type: string
          required_modules: Json | null
          sections: Json | null
          sort_order: number | null
          target_audience: string | null
          template_code: string
          template_format: string | null
          template_html: string | null
          template_path: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          data_sources?: Json | null
          description?: string | null
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_favorite?: boolean | null
          is_system?: boolean | null
          name: string
          page_orientation?: string | null
          page_size?: string | null
          parameters?: Json | null
          report_category?: string | null
          report_type: string
          required_modules?: Json | null
          sections?: Json | null
          sort_order?: number | null
          target_audience?: string | null
          template_code: string
          template_format?: string | null
          template_html?: string | null
          template_path?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          data_sources?: Json | null
          description?: string | null
          footer_config?: Json | null
          header_config?: Json | null
          id?: string
          is_favorite?: boolean | null
          is_system?: boolean | null
          name?: string
          page_orientation?: string | null
          page_size?: string | null
          parameters?: Json | null
          report_category?: string | null
          report_type?: string
          required_modules?: Json | null
          sections?: Json | null
          sort_order?: number | null
          target_audience?: string | null
          template_code?: string
          template_format?: string | null
          template_html?: string | null
          template_path?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "report_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_daily: {
        Row: {
          avg_parking_minutes: number | null
          card_amount: number | null
          cash_amount: number | null
          created_at: string | null
          data_source: string | null
          discrepancy_note: string | null
          exemption_amount: number | null
          exemption_count: number | null
          exemption_detail: Json | null
          id: string
          input_by: string | null
          lot_id: string
          mobile_amount: number | null
          monthly_pass_amount: number | null
          other_amount: number | null
          peak_hour: string | null
          peak_hour_vehicles: number | null
          revenue_date: string
          source_detail: string | null
          total_amount: number | null
          total_vehicles: number | null
          turnover_rate: number | null
          updated_at: string | null
          verified: boolean | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          avg_parking_minutes?: number | null
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string | null
          data_source?: string | null
          discrepancy_note?: string | null
          exemption_amount?: number | null
          exemption_count?: number | null
          exemption_detail?: Json | null
          id?: string
          input_by?: string | null
          lot_id: string
          mobile_amount?: number | null
          monthly_pass_amount?: number | null
          other_amount?: number | null
          peak_hour?: string | null
          peak_hour_vehicles?: number | null
          revenue_date: string
          source_detail?: string | null
          total_amount?: number | null
          total_vehicles?: number | null
          turnover_rate?: number | null
          updated_at?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          avg_parking_minutes?: number | null
          card_amount?: number | null
          cash_amount?: number | null
          created_at?: string | null
          data_source?: string | null
          discrepancy_note?: string | null
          exemption_amount?: number | null
          exemption_count?: number | null
          exemption_detail?: Json | null
          id?: string
          input_by?: string | null
          lot_id?: string
          mobile_amount?: number | null
          monthly_pass_amount?: number | null
          other_amount?: number | null
          peak_hour?: string | null
          peak_hour_vehicles?: number | null
          revenue_date?: string
          source_detail?: string | null
          total_amount?: number | null
          total_vehicles?: number | null
          turnover_rate?: number | null
          updated_at?: string | null
          verified?: boolean | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_daily_input_by_fkey"
            columns: ["input_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "revenue_daily_input_by_fkey"
            columns: ["input_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_daily_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "revenue_daily_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_reconciliation: {
        Row: {
          company_name: string | null
          contract_id: string | null
          created_at: string | null
          created_by: string | null
          diff_amount: number | null
          diff_analysis: string | null
          diff_rate: number | null
          id: string
          lot_id: string
          period_end: string
          period_start: string
          period_type: string
          recon_number: string
          report_date: string | null
          report_document_path: string | null
          reported_card: number | null
          reported_cash: number | null
          reported_exemptions: number | null
          reported_mobile: number | null
          reported_other: number | null
          reported_total: number | null
          reported_vehicles: number | null
          resolution_note: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          system_card: number | null
          system_cash: number | null
          system_exemptions: number | null
          system_mobile: number | null
          system_other: number | null
          system_total: number | null
          system_vehicles: number | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_amount?: number | null
          diff_analysis?: string | null
          diff_rate?: number | null
          id?: string
          lot_id: string
          period_end: string
          period_start: string
          period_type?: string
          recon_number: string
          report_date?: string | null
          report_document_path?: string | null
          reported_card?: number | null
          reported_cash?: number | null
          reported_exemptions?: number | null
          reported_mobile?: number | null
          reported_other?: number | null
          reported_total?: number | null
          reported_vehicles?: number | null
          resolution_note?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          system_card?: number | null
          system_cash?: number | null
          system_exemptions?: number | null
          system_mobile?: number | null
          system_other?: number | null
          system_total?: number | null
          system_vehicles?: number | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          contract_id?: string | null
          created_at?: string | null
          created_by?: string | null
          diff_amount?: number | null
          diff_analysis?: string | null
          diff_rate?: number | null
          id?: string
          lot_id?: string
          period_end?: string
          period_start?: string
          period_type?: string
          recon_number?: string
          report_date?: string | null
          report_document_path?: string | null
          reported_card?: number | null
          reported_cash?: number | null
          reported_exemptions?: number | null
          reported_mobile?: number | null
          reported_other?: number | null
          reported_total?: number | null
          reported_vehicles?: number | null
          resolution_note?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          system_card?: number | null
          system_cash?: number | null
          system_exemptions?: number | null
          system_mobile?: number | null
          system_other?: number | null
          system_total?: number | null
          system_vehicles?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_reconciliation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "revenue_reconciliation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_reconciliation_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_reconciliation_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_reconciliation_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "revenue_reconciliation_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
          {
            foreignKeyName: "safety_inspections_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_devices: {
        Row: {
          alert_battery_threshold: number | null
          alert_offline_minutes: number | null
          alert_sent: boolean | null
          battery_level: number | null
          battery_voltage: number | null
          calibration_date: string | null
          calibration_offset: Json | null
          config: Json | null
          created_at: string | null
          device_id: string
          device_name: string | null
          device_type: string
          error_count: number | null
          false_negative_rate: number | null
          false_positive_rate: number | null
          firmware_version: string | null
          floor: number | null
          gateway_id: string | null
          hardware_version: string | null
          id: string
          install_date: string | null
          last_battery_change: string | null
          last_heartbeat: string | null
          last_reading: string | null
          location_detail: string | null
          lot_id: string
          model: string | null
          mounting_height_cm: number | null
          mounting_type: string | null
          notes: string | null
          registered_by: string | null
          rssi: number | null
          snr: number | null
          space_id: string | null
          status: string | null
          status_changed_at: string | null
          total_readings: number | null
          updated_at: string | null
          zone: string | null
        }
        Insert: {
          alert_battery_threshold?: number | null
          alert_offline_minutes?: number | null
          alert_sent?: boolean | null
          battery_level?: number | null
          battery_voltage?: number | null
          calibration_date?: string | null
          calibration_offset?: Json | null
          config?: Json | null
          created_at?: string | null
          device_id: string
          device_name?: string | null
          device_type?: string
          error_count?: number | null
          false_negative_rate?: number | null
          false_positive_rate?: number | null
          firmware_version?: string | null
          floor?: number | null
          gateway_id?: string | null
          hardware_version?: string | null
          id?: string
          install_date?: string | null
          last_battery_change?: string | null
          last_heartbeat?: string | null
          last_reading?: string | null
          location_detail?: string | null
          lot_id: string
          model?: string | null
          mounting_height_cm?: number | null
          mounting_type?: string | null
          notes?: string | null
          registered_by?: string | null
          rssi?: number | null
          snr?: number | null
          space_id?: string | null
          status?: string | null
          status_changed_at?: string | null
          total_readings?: number | null
          updated_at?: string | null
          zone?: string | null
        }
        Update: {
          alert_battery_threshold?: number | null
          alert_offline_minutes?: number | null
          alert_sent?: boolean | null
          battery_level?: number | null
          battery_voltage?: number | null
          calibration_date?: string | null
          calibration_offset?: Json | null
          config?: Json | null
          created_at?: string | null
          device_id?: string
          device_name?: string | null
          device_type?: string
          error_count?: number | null
          false_negative_rate?: number | null
          false_positive_rate?: number | null
          firmware_version?: string | null
          floor?: number | null
          gateway_id?: string | null
          hardware_version?: string | null
          id?: string
          install_date?: string | null
          last_battery_change?: string | null
          last_heartbeat?: string | null
          last_reading?: string | null
          location_detail?: string | null
          lot_id?: string
          model?: string | null
          mounting_height_cm?: number | null
          mounting_type?: string | null
          notes?: string | null
          registered_by?: string | null
          rssi?: number | null
          snr?: number | null
          space_id?: string | null
          status?: string | null
          status_changed_at?: string | null
          total_readings?: number | null
          updated_at?: string | null
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_devices_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateway_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "sensor_devices_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "parking_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_readings: {
        Row: {
          battery_level: number | null
          confidence: number | null
          device_id: string
          distance_cm: number | null
          lot_id: string
          occupied: boolean
          raw_data: Json | null
          rssi: number | null
          snr: number | null
          space_id: string | null
          temperature: number | null
          time: string
        }
        Insert: {
          battery_level?: number | null
          confidence?: number | null
          device_id: string
          distance_cm?: number | null
          lot_id: string
          occupied: boolean
          raw_data?: Json | null
          rssi?: number | null
          snr?: number | null
          space_id?: string | null
          temperature?: number | null
          time: string
        }
        Update: {
          battery_level?: number | null
          confidence?: number | null
          device_id?: string
          distance_cm?: number | null
          lot_id?: string
          occupied?: boolean
          raw_data?: Json | null
          rssi?: number | null
          snr?: number | null
          space_id?: string | null
          temperature?: number | null
          time?: string
        }
        Relationships: []
      }
      service_deliverables: {
        Row: {
          created_at: string | null
          deliverable_number: string
          deliverable_type: string
          description: string | null
          file_format: string | null
          file_path: string | null
          file_size: number | null
          format_required: string | null
          id: string
          milestone_id: string | null
          project_id: string
          required_copies: number | null
          review_note: string | null
          review_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision_count: number | null
          revision_deadline: string | null
          revision_note: string | null
          sort_order: number | null
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deliverable_number: string
          deliverable_type: string
          description?: string | null
          file_format?: string | null
          file_path?: string | null
          file_size?: number | null
          format_required?: string | null
          id?: string
          milestone_id?: string | null
          project_id: string
          required_copies?: number | null
          review_note?: string | null
          review_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_count?: number | null
          revision_deadline?: string | null
          revision_note?: string | null
          sort_order?: number | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deliverable_number?: string
          deliverable_type?: string
          description?: string | null
          file_format?: string | null
          file_path?: string | null
          file_size?: number | null
          format_required?: string | null
          id?: string
          milestone_id?: string | null
          project_id?: string
          required_copies?: number | null
          review_note?: string | null
          review_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_count?: number | null
          revision_deadline?: string | null
          revision_note?: string | null
          sort_order?: number | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "service_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_deliverables_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_deliverables_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_inspections: {
        Row: {
          approved_amount: number | null
          approved_at: string | null
          approved_by: string | null
          checklist_results: Json | null
          correction_deadline: string | null
          correction_items: Json | null
          correction_submitted_at: string | null
          correction_verified: boolean | null
          correction_verified_at: string | null
          correction_verified_by: string | null
          created_at: string | null
          deduction_amount: number | null
          deduction_reason: string | null
          deficiency_note: string | null
          fail_items: number | null
          id: string
          inspection_date: string
          inspection_number: string
          inspection_seq: number
          inspection_type: string
          inspector_id: string
          inspector_name: string | null
          milestone_id: string | null
          notes: string | null
          pass_items: number | null
          photos: Json | null
          project_id: string
          report_path: string | null
          result: string | null
          result_note: string | null
          status: string | null
          sub_inspector_id: string | null
          target_amount: number
          title: string
          total_items: number | null
          updated_at: string | null
        }
        Insert: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          checklist_results?: Json | null
          correction_deadline?: string | null
          correction_items?: Json | null
          correction_submitted_at?: string | null
          correction_verified?: boolean | null
          correction_verified_at?: string | null
          correction_verified_by?: string | null
          created_at?: string | null
          deduction_amount?: number | null
          deduction_reason?: string | null
          deficiency_note?: string | null
          fail_items?: number | null
          id?: string
          inspection_date: string
          inspection_number: string
          inspection_seq: number
          inspection_type: string
          inspector_id: string
          inspector_name?: string | null
          milestone_id?: string | null
          notes?: string | null
          pass_items?: number | null
          photos?: Json | null
          project_id: string
          report_path?: string | null
          result?: string | null
          result_note?: string | null
          status?: string | null
          sub_inspector_id?: string | null
          target_amount: number
          title: string
          total_items?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          checklist_results?: Json | null
          correction_deadline?: string | null
          correction_items?: Json | null
          correction_submitted_at?: string | null
          correction_verified?: boolean | null
          correction_verified_at?: string | null
          correction_verified_by?: string | null
          created_at?: string | null
          deduction_amount?: number | null
          deduction_reason?: string | null
          deficiency_note?: string | null
          fail_items?: number | null
          id?: string
          inspection_date?: string
          inspection_number?: string
          inspection_seq?: number
          inspection_type?: string
          inspector_id?: string
          inspector_name?: string | null
          milestone_id?: string | null
          notes?: string | null
          pass_items?: number | null
          photos?: Json | null
          project_id?: string
          report_path?: string | null
          result?: string | null
          result_note?: string | null
          status?: string | null
          sub_inspector_id?: string | null
          target_amount?: number
          title?: string
          total_items?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_inspections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_inspections_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_correction_verified_by_fkey"
            columns: ["correction_verified_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_inspections_correction_verified_by_fkey"
            columns: ["correction_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_inspections_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "service_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_inspections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_inspections_sub_inspector_id_fkey"
            columns: ["sub_inspector_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_inspections_sub_inspector_id_fkey"
            columns: ["sub_inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_issues: {
        Row: {
          approval_document_path: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to: string | null
          attachments: Json | null
          created_at: string | null
          description: string
          id: string
          impact_amount: number | null
          impact_days: number | null
          impact_scope: string | null
          issue_number: string
          issue_type: string
          notes: string | null
          project_id: string
          reported_at: string | null
          reported_by: string | null
          requires_approval: boolean | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          revised_amount: number | null
          revised_end_date: string | null
          severity: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          approval_document_path?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          created_at?: string | null
          description: string
          id?: string
          impact_amount?: number | null
          impact_days?: number | null
          impact_scope?: string | null
          issue_number: string
          issue_type: string
          notes?: string | null
          project_id: string
          reported_at?: string | null
          reported_by?: string | null
          requires_approval?: boolean | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revised_amount?: number | null
          revised_end_date?: string | null
          severity?: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          approval_document_path?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          created_at?: string | null
          description?: string
          id?: string
          impact_amount?: number | null
          impact_days?: number | null
          impact_scope?: string | null
          issue_number?: string
          issue_type?: string
          notes?: string | null
          project_id?: string
          reported_at?: string | null
          reported_by?: string | null
          requires_approval?: boolean | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          revised_amount?: number | null
          revised_end_date?: string | null
          severity?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_issues_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_issues_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_issues_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_issues_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_issues_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_milestones: {
        Row: {
          actual_date: string | null
          created_at: string | null
          delay_days: number | null
          deliverables_count: number | null
          deliverables_expected: string | null
          deliverables_submitted: number | null
          description: string | null
          id: string
          milestone_number: number
          milestone_type: string
          notes: string | null
          payment_amount: number | null
          payment_requested: boolean | null
          project_id: string
          status: string | null
          target_date: string
          title: string
          updated_at: string | null
          weight_pct: number | null
        }
        Insert: {
          actual_date?: string | null
          created_at?: string | null
          delay_days?: number | null
          deliverables_count?: number | null
          deliverables_expected?: string | null
          deliverables_submitted?: number | null
          description?: string | null
          id?: string
          milestone_number: number
          milestone_type?: string
          notes?: string | null
          payment_amount?: number | null
          payment_requested?: boolean | null
          project_id: string
          status?: string | null
          target_date: string
          title: string
          updated_at?: string | null
          weight_pct?: number | null
        }
        Update: {
          actual_date?: string | null
          created_at?: string | null
          delay_days?: number | null
          deliverables_count?: number | null
          deliverables_expected?: string | null
          deliverables_submitted?: number | null
          description?: string | null
          id?: string
          milestone_number?: number
          milestone_type?: string
          notes?: string | null
          payment_amount?: number | null
          payment_requested?: boolean | null
          project_id?: string
          status?: string | null
          target_date?: string
          title?: string
          updated_at?: string | null
          weight_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_payments: {
        Row: {
          advance_deduction: number | null
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_name: string | null
          budget_execution_id: string | null
          created_at: string | null
          created_by: string | null
          deduction_detail: Json | null
          delay_days: number | null
          delay_interest: number | null
          due_date: string | null
          gross_amount: number
          id: string
          inspection_id: string | null
          is_delayed: boolean | null
          net_amount: number | null
          notes: string | null
          other_deduction: number | null
          paid_amount: number | null
          paid_date: string | null
          payment_method: string | null
          payment_number: string
          payment_seq: number
          payment_type: string
          project_id: string
          receipt_number: string | null
          reject_reason: string | null
          request_date: string
          request_document_path: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          advance_deduction?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_name?: string | null
          budget_execution_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deduction_detail?: Json | null
          delay_days?: number | null
          delay_interest?: number | null
          due_date?: string | null
          gross_amount: number
          id?: string
          inspection_id?: string | null
          is_delayed?: boolean | null
          net_amount?: number | null
          notes?: string | null
          other_deduction?: number | null
          paid_amount?: number | null
          paid_date?: string | null
          payment_method?: string | null
          payment_number: string
          payment_seq: number
          payment_type: string
          project_id: string
          receipt_number?: string | null
          reject_reason?: string | null
          request_date: string
          request_document_path?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          advance_deduction?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_name?: string | null
          budget_execution_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deduction_detail?: Json | null
          delay_days?: number | null
          delay_interest?: number | null
          due_date?: string | null
          gross_amount?: number
          id?: string
          inspection_id?: string | null
          is_delayed?: boolean | null
          net_amount?: number | null
          notes?: string | null
          other_deduction?: number | null
          paid_amount?: number | null
          paid_date?: string | null
          payment_method?: string | null
          payment_number?: string
          payment_seq?: number
          payment_type?: string
          project_id?: string
          receipt_number?: string | null
          reject_reason?: string | null
          request_date?: string
          request_document_path?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_payments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_payments_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "service_inspections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_projects: {
        Row: {
          actual_end_date: string | null
          actual_start_date: string | null
          bid_contract_id: string | null
          budget_item_id: string | null
          contract_amount: number
          contract_date: string | null
          contractor_address: string | null
          contractor_business_number: string | null
          contractor_email: string | null
          contractor_manager: string | null
          contractor_manager_phone: string | null
          contractor_name: string
          contractor_phone: string | null
          contractor_representative: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          extended_days: number | null
          extended_end_date: string | null
          id: string
          inspector_id: string | null
          last_progress_update: string | null
          lot_id: string | null
          notes: string | null
          paid_amount: number | null
          payment_rate: number | null
          progress_note: string | null
          progress_pct: number | null
          project_number: string
          remaining_amount: number | null
          scope_of_work: string | null
          service_category: string | null
          service_type: string
          start_date: string
          status: string
          status_changed_at: string | null
          sub_supervisor_id: string | null
          supervisor_id: string | null
          suspension_end: string | null
          suspension_reason: string | null
          suspension_start: string | null
          termination_date: string | null
          termination_reason: string | null
          title: string
          total_amount: number
          updated_at: string | null
          vat_amount: number | null
          warranty_bond_amount: number | null
          warranty_bond_company: string | null
          warranty_bond_number: string | null
          warranty_end: string | null
          warranty_months: number | null
          warranty_start: string | null
          work_days: number | null
        }
        Insert: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          bid_contract_id?: string | null
          budget_item_id?: string | null
          contract_amount: number
          contract_date?: string | null
          contractor_address?: string | null
          contractor_business_number?: string | null
          contractor_email?: string | null
          contractor_manager?: string | null
          contractor_manager_phone?: string | null
          contractor_name: string
          contractor_phone?: string | null
          contractor_representative?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          extended_days?: number | null
          extended_end_date?: string | null
          id?: string
          inspector_id?: string | null
          last_progress_update?: string | null
          lot_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_rate?: number | null
          progress_note?: string | null
          progress_pct?: number | null
          project_number: string
          remaining_amount?: number | null
          scope_of_work?: string | null
          service_category?: string | null
          service_type: string
          start_date: string
          status?: string
          status_changed_at?: string | null
          sub_supervisor_id?: string | null
          supervisor_id?: string | null
          suspension_end?: string | null
          suspension_reason?: string | null
          suspension_start?: string | null
          termination_date?: string | null
          termination_reason?: string | null
          title: string
          total_amount: number
          updated_at?: string | null
          vat_amount?: number | null
          warranty_bond_amount?: number | null
          warranty_bond_company?: string | null
          warranty_bond_number?: string | null
          warranty_end?: string | null
          warranty_months?: number | null
          warranty_start?: string | null
          work_days?: number | null
        }
        Update: {
          actual_end_date?: string | null
          actual_start_date?: string | null
          bid_contract_id?: string | null
          budget_item_id?: string | null
          contract_amount?: number
          contract_date?: string | null
          contractor_address?: string | null
          contractor_business_number?: string | null
          contractor_email?: string | null
          contractor_manager?: string | null
          contractor_manager_phone?: string | null
          contractor_name?: string
          contractor_phone?: string | null
          contractor_representative?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          extended_days?: number | null
          extended_end_date?: string | null
          id?: string
          inspector_id?: string | null
          last_progress_update?: string | null
          lot_id?: string | null
          notes?: string | null
          paid_amount?: number | null
          payment_rate?: number | null
          progress_note?: string | null
          progress_pct?: number | null
          project_number?: string
          remaining_amount?: number | null
          scope_of_work?: string | null
          service_category?: string | null
          service_type?: string
          start_date?: string
          status?: string
          status_changed_at?: string | null
          sub_supervisor_id?: string | null
          supervisor_id?: string | null
          suspension_end?: string | null
          suspension_reason?: string | null
          suspension_start?: string | null
          termination_date?: string | null
          termination_reason?: string | null
          title?: string
          total_amount?: number
          updated_at?: string | null
          vat_amount?: number | null
          warranty_bond_amount?: number | null
          warranty_bond_company?: string | null
          warranty_bond_number?: string | null
          warranty_end?: string | null
          warranty_months?: number | null
          warranty_start?: string | null
          work_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_projects_inspector_id_fkey"
            columns: ["inspector_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_sub_supervisor_id_fkey"
            columns: ["sub_supervisor_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_projects_sub_supervisor_id_fkey"
            columns: ["sub_supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_projects_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "service_projects_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_candidates: {
        Row: {
          accessibility_score: number | null
          acquisition_method: string | null
          address_jibun: string | null
          address_road: string | null
          administrative_dong: string | null
          area_sqm: number | null
          bc_ratio: number | null
          building_coverage_ratio: number | null
          created_at: string | null
          created_by: string | null
          cultural_heritage_review: boolean | null
          decision_date: string | null
          decision_note: string | null
          demand_score: number | null
          depth_m: number | null
          environmental_review: boolean | null
          estimated_annual_expense: number | null
          estimated_annual_profit: number | null
          estimated_annual_revenue: number | null
          estimated_construction_cost: number | null
          estimated_floors: number | null
          estimated_land_cost: number | null
          estimated_spaces: number | null
          evaluation_date: string | null
          evaluator_id: string | null
          feasibility_score: number | null
          floor_area_ratio: number | null
          frontage_m: number | null
          ground_condition: string | null
          height_limit_m: number | null
          id: string
          irr: number | null
          land_category: string | null
          land_use: string | null
          latitude: number | null
          legal_restrictions: string | null
          legal_score: number | null
          location_score: number | null
          longitude: number | null
          name: string
          nearby_facilities: string | null
          nearby_parking_lots: Json | null
          nearest_road: string | null
          notes: string | null
          npv: number | null
          owner_name: string | null
          ownership: string | null
          payback_years: number | null
          pedestrian_access: string | null
          photos: Json | null
          planned_lot_type: Database["public"]["Enums"]["lot_type_enum"] | null
          planned_space_detail: Json | null
          public_transport_access: string | null
          ranking: number | null
          road_width_m: number | null
          setback_m: number | null
          shape: string | null
          site_number: string
          slope_pct: number | null
          status: string | null
          surrounding_commercial_area: number | null
          surrounding_population: number | null
          total_score: number | null
          traffic_impact_review: boolean | null
          traffic_volume: string | null
          updated_at: string | null
          zoning: string | null
        }
        Insert: {
          accessibility_score?: number | null
          acquisition_method?: string | null
          address_jibun?: string | null
          address_road?: string | null
          administrative_dong?: string | null
          area_sqm?: number | null
          bc_ratio?: number | null
          building_coverage_ratio?: number | null
          created_at?: string | null
          created_by?: string | null
          cultural_heritage_review?: boolean | null
          decision_date?: string | null
          decision_note?: string | null
          demand_score?: number | null
          depth_m?: number | null
          environmental_review?: boolean | null
          estimated_annual_expense?: number | null
          estimated_annual_profit?: number | null
          estimated_annual_revenue?: number | null
          estimated_construction_cost?: number | null
          estimated_floors?: number | null
          estimated_land_cost?: number | null
          estimated_spaces?: number | null
          evaluation_date?: string | null
          evaluator_id?: string | null
          feasibility_score?: number | null
          floor_area_ratio?: number | null
          frontage_m?: number | null
          ground_condition?: string | null
          height_limit_m?: number | null
          id?: string
          irr?: number | null
          land_category?: string | null
          land_use?: string | null
          latitude?: number | null
          legal_restrictions?: string | null
          legal_score?: number | null
          location_score?: number | null
          longitude?: number | null
          name: string
          nearby_facilities?: string | null
          nearby_parking_lots?: Json | null
          nearest_road?: string | null
          notes?: string | null
          npv?: number | null
          owner_name?: string | null
          ownership?: string | null
          payback_years?: number | null
          pedestrian_access?: string | null
          photos?: Json | null
          planned_lot_type?: Database["public"]["Enums"]["lot_type_enum"] | null
          planned_space_detail?: Json | null
          public_transport_access?: string | null
          ranking?: number | null
          road_width_m?: number | null
          setback_m?: number | null
          shape?: string | null
          site_number: string
          slope_pct?: number | null
          status?: string | null
          surrounding_commercial_area?: number | null
          surrounding_population?: number | null
          total_score?: number | null
          traffic_impact_review?: boolean | null
          traffic_volume?: string | null
          updated_at?: string | null
          zoning?: string | null
        }
        Update: {
          accessibility_score?: number | null
          acquisition_method?: string | null
          address_jibun?: string | null
          address_road?: string | null
          administrative_dong?: string | null
          area_sqm?: number | null
          bc_ratio?: number | null
          building_coverage_ratio?: number | null
          created_at?: string | null
          created_by?: string | null
          cultural_heritage_review?: boolean | null
          decision_date?: string | null
          decision_note?: string | null
          demand_score?: number | null
          depth_m?: number | null
          environmental_review?: boolean | null
          estimated_annual_expense?: number | null
          estimated_annual_profit?: number | null
          estimated_annual_revenue?: number | null
          estimated_construction_cost?: number | null
          estimated_floors?: number | null
          estimated_land_cost?: number | null
          estimated_spaces?: number | null
          evaluation_date?: string | null
          evaluator_id?: string | null
          feasibility_score?: number | null
          floor_area_ratio?: number | null
          frontage_m?: number | null
          ground_condition?: string | null
          height_limit_m?: number | null
          id?: string
          irr?: number | null
          land_category?: string | null
          land_use?: string | null
          latitude?: number | null
          legal_restrictions?: string | null
          legal_score?: number | null
          location_score?: number | null
          longitude?: number | null
          name?: string
          nearby_facilities?: string | null
          nearby_parking_lots?: Json | null
          nearest_road?: string | null
          notes?: string | null
          npv?: number | null
          owner_name?: string | null
          ownership?: string | null
          payback_years?: number | null
          pedestrian_access?: string | null
          photos?: Json | null
          planned_lot_type?: Database["public"]["Enums"]["lot_type_enum"] | null
          planned_space_detail?: Json | null
          public_transport_access?: string | null
          ranking?: number | null
          road_width_m?: number | null
          setback_m?: number | null
          shape?: string | null
          site_number?: string
          slope_pct?: number | null
          status?: string | null
          surrounding_commercial_area?: number | null
          surrounding_population?: number | null
          total_score?: number | null
          traffic_impact_review?: boolean | null
          traffic_volume?: string | null
          updated_at?: string | null
          zoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "site_candidates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_candidates_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
          {
            foreignKeyName: "site_candidates_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "surface_markings_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
          },
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
            foreignKeyName: "surveys_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "surveys_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
            referencedRelation: "complaint_staff_performance"
            referencedColumns: ["staff_id"]
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
      budget_execution_monthly: {
        Row: {
          budget_type: string | null
          execution_count: number | null
          month: string | null
          plan_id: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plan_summary"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "budget_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "budget_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_plan_summary: {
        Row: {
          fiscal_year: number | null
          overall_execution_rate: number | null
          plan_id: string | null
          plan_type: string | null
          status: string | null
          title: string | null
          total_allocated_expenditure: number | null
          total_allocated_revenue: number | null
          total_executed_expenditure: number | null
          total_planned_expenditure: number | null
          total_planned_revenue: number | null
        }
        Relationships: []
      }
      complaint_hotspot: {
        Row: {
          last_30_days: number | null
          last_90_days: number | null
          lot_code: string | null
          lot_id: string | null
          lot_name: string | null
          repeat_count: number | null
          top_category: string | null
          total_complaints: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_staff_performance: {
        Row: {
          assigned_count: number | null
          avg_resolution_days: number | null
          avg_satisfaction: number | null
          closed_count: number | null
          open_count: number | null
          overdue_count: number | null
          staff_id: string | null
          staff_name: string | null
          team: Database["public"]["Enums"]["team_type"] | null
        }
        Relationships: []
      }
      complaint_stats_monthly: {
        Row: {
          avg_resolution_days: number | null
          avg_satisfaction: number | null
          category: string | null
          closed_count: number | null
          month: string | null
          open_count: number | null
          overdue_count: number | null
          total_count: number | null
        }
        Relationships: []
      }
      construction_dashboard: {
        Row: {
          actual_completion: string | null
          budget_execution_rate: number | null
          delay_days: number | null
          estimated_spaces: number | null
          id: string | null
          lot_name: string | null
          permits_completed: number | null
          permits_total: number | null
          phase: string | null
          progress_pct: number | null
          project_name: string | null
          project_number: string | null
          remaining: number | null
          site_name: string | null
          spent: number | null
          status: string | null
          target_completion: string | null
          total_budget: number | null
        }
        Relationships: []
      }
      gateway_health_view: {
        Row: {
          active_sensors: number | null
          connected_sensors: number | null
          device_id: string | null
          device_name: string | null
          firmware_version: string | null
          health_status: string | null
          id: string | null
          ip_address: string | null
          last_heartbeat: string | null
          lot_code: string | null
          lot_id: string | null
          lot_name: string | null
          max_sensors: number | null
          minutes_since_heartbeat: number | null
          problem_sensors: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      realtime_map_view: {
        Row: {
          address_jibun: string | null
          address_road: string | null
          available_spaces: number | null
          code: string | null
          congestion_level: string | null
          id: string | null
          last_updated: string | null
          latitude: number | null
          longitude: number | null
          lot_type: Database["public"]["Enums"]["lot_type_enum"] | null
          name: string | null
          occupancy_rate: number | null
          occupied_spaces: number | null
          realtime_status: string | null
          today_peak_occupied: number | null
          today_peak_time: string | null
          today_total_in: number | null
          total_spaces: number | null
        }
        Relationships: []
      }
      revenue_monthly: {
        Row: {
          card_total: number | null
          cash_total: number | null
          days_recorded: number | null
          exemption_amount_total: number | null
          exemptions_total: number | null
          grand_total: number | null
          lot_id: string | null
          mobile_total: number | null
          month: string | null
          other_total: number | null
          pass_total: number | null
          vehicles_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_summary_monthly: {
        Row: {
          card_total: number | null
          cash_total: number | null
          exemption_total: number | null
          grand_total: number | null
          lot_count: number | null
          mobile_total: number | null
          month: string | null
          pass_total: number | null
          vehicles_total: number | null
        }
        Relationships: []
      }
      revenue_yearly: {
        Row: {
          days_recorded: number | null
          grand_total: number | null
          lot_id: string | null
          vehicles_total: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_daily_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      sensor_health_view: {
        Row: {
          battery_level: number | null
          device_id: string | null
          device_name: string | null
          device_type: string | null
          gateway_device_id: string | null
          gateway_id: string | null
          health_status: string | null
          id: string | null
          last_heartbeat: string | null
          last_reading: string | null
          lot_code: string | null
          lot_id: string | null
          lot_name: string | null
          minutes_since_heartbeat: number | null
          rssi: number | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensor_devices_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateway_devices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "gateway_health_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "parking_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensor_devices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "realtime_map_view"
            referencedColumns: ["id"]
          },
        ]
      }
      service_issue_summary: {
        Row: {
          critical_open: number | null
          open_issues: number | null
          project_id: string | null
          total_impact_amount: number | null
          total_impact_days: number | null
          total_issues: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_payment_summary"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "service_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "service_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      service_payment_summary: {
        Row: {
          actual_paid: number | null
          paid_amount: number | null
          paid_count: number | null
          payment_rate: number | null
          pending_count: number | null
          project_id: string | null
          project_number: string | null
          remaining_amount: number | null
          title: string | null
          total_amount: number | null
          total_delay_interest: number | null
        }
        Relationships: []
      }
      site_evaluation_summary: {
        Row: {
          address_jibun: string | null
          area_sqm: number | null
          bc_ratio: number | null
          estimated_annual_profit: number | null
          estimated_annual_revenue: number | null
          estimated_construction_cost: number | null
          estimated_spaces: number | null
          grade: string | null
          id: string | null
          name: string | null
          ownership: string | null
          payback_years: number | null
          project_id: string | null
          project_progress: number | null
          project_status: string | null
          ranking: number | null
          site_number: string | null
          status: string | null
          total_score: number | null
        }
        Relationships: []
      }
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
