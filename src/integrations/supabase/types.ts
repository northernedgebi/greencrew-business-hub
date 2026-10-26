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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          address: string | null
          booking_weekdays: number[]
          created_at: string
          created_by: string
          email: string | null
          id: string
          logo_url: string | null
          max_visits_per_day: number
          name: string
          phone: string | null
          plan: string
          subscription_status: string
          trial_ends_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          booking_weekdays?: number[]
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_visits_per_day?: number
          name: string
          phone?: string | null
          plan?: string
          subscription_status?: string
          trial_ends_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          booking_weekdays?: number[]
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          max_visits_per_day?: number
          name?: string
          phone?: string | null
          plan?: string
          subscription_status?: string
          trial_ends_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string
          crew_id: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["company_role"]
          schedule_visible_from: string | null
          schedule_visible_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string
          crew_id?: string | null
          email: string
          id?: string
          role: Database["public"]["Enums"]["company_role"]
          schedule_visible_from?: string | null
          schedule_visible_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string
          crew_id?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          schedule_visible_from?: string | null
          schedule_visible_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_invites_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          crew_id: string | null
          id: string
          role: Database["public"]["Enums"]["company_role"]
          schedule_visible_from: string | null
          schedule_visible_until: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          crew_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["company_role"]
          schedule_visible_from?: string | null
          schedule_visible_until?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          crew_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["company_role"]
          schedule_visible_from?: string | null
          schedule_visible_until?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          customer_id: string
          end_date: string | null
          id: string
          signed_at: string | null
          start_date: string | null
          status: string
          title: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          end_date?: string | null
          id?: string
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          end_date?: string | null
          id?: string
          signed_at?: string | null
          start_date?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          start_address: string | null
          start_lat: number | null
          start_lng: number | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          start_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crews_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          company_id: string
          created_at: string
          customer_type: string
          ein: string | null
          email: string | null
          id: string
          inactive_reason: string | null
          name: string
          notes: string | null
          overdue_hold_limit: number | null
          phone: string | null
          portal_user_id: string | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_type?: string
          ein?: string | null
          email?: string | null
          id?: string
          inactive_reason?: string | null
          name: string
          notes?: string | null
          overdue_hold_limit?: number | null
          phone?: string | null
          portal_user_id?: string | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_type?: string
          ein?: string | null
          email?: string | null
          id?: string
          inactive_reason?: string | null
          name?: string
          notes?: string | null
          overdue_hold_limit?: number | null
          phone?: string | null
          portal_user_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          crew_id: string | null
          email: string | null
          hourly_rate: number | null
          id: string
          name: string
          phone: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          crew_id?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          name: string
          phone?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          crew_id?: string | null
          email?: string | null
          hourly_rate?: number | null
          id?: string
          name?: string
          phone?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          property_id: string | null
          status: string
          title: string
          total: number
          valid_until: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          title: string
          total?: number
          valid_until?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          title?: string
          total?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          company_id: string
          description: string
          id: string
          invoice_id: string
          job_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          company_id: string
          description: string
          id?: string
          invoice_id: string
          job_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Update: {
          company_id?: string
          description?: string
          id?: string
          invoice_id?: string
          job_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          company_id: string
          created_at: string
          customer_id: string
          due_date: string
          id: string
          issue_date: string
          notes: string | null
          number: number
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_rate: number
          total: number
        }
        Insert: {
          amount_paid?: number
          company_id: string
          created_at?: string
          customer_id: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_rate?: number
          total?: number
        }
        Update: {
          amount_paid?: number
          company_id?: string
          created_at?: string
          customer_id?: string
          due_date?: string
          id?: string
          issue_date?: string
          notes?: string | null
          number?: number
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_rate?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string
          crew_id: string | null
          customer_id: string
          id: string
          invoice_id: string | null
          notes: string | null
          price: number
          property_id: string | null
          recurrence_date: string | null
          recurring_plan_id: string | null
          route_order: number | null
          scheduled_date: string
          service_kind: string
          start_time: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string
          crew_id?: string | null
          customer_id: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          price?: number
          property_id?: string | null
          recurrence_date?: string | null
          recurring_plan_id?: string | null
          route_order?: number | null
          scheduled_date: string
          service_kind?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string
          crew_id?: string | null
          customer_id?: string
          id?: string
          invoice_id?: string | null
          notes?: string | null
          price?: number
          property_id?: string | null
          recurrence_date?: string | null
          recurring_plan_id?: string | null
          route_order?: number | null
          scheduled_date?: string
          service_kind?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_recurring_plan_id_fkey"
            columns: ["recurring_plan_id"]
            isOneToOne: false
            referencedRelation: "recurring_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          company_id: string
          created_at: string
          customer_id: string
          direction: string
          id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          channel?: string
          company_id: string
          created_at?: string
          customer_id: string
          direction?: string
          id?: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          channel?: string
          company_id?: string
          created_at?: string
          customer_id?: string
          direction?: string
          id?: string
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          company_id: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          paid_at: string
        }
        Insert: {
          amount: number
          company_id: string
          id?: string
          invoice_id: string
          method?: string
          note?: string | null
          paid_at?: string
        }
        Update: {
          amount?: number
          company_id?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          paid_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          city: string | null
          company_id: string
          created_at: string
          customer_id: string
          gate_code: string | null
          id: string
          label: string | null
          lat: number | null
          lng: number | null
          lot_size_sqft: number | null
          notes: string | null
          state: string | null
          zip: string | null
        }
        Insert: {
          address: string
          city?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          gate_code?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          lot_size_sqft?: number | null
          notes?: string | null
          state?: string | null
          zip?: string | null
        }
        Update: {
          address?: string
          city?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          gate_code?: string | null
          id?: string
          label?: string | null
          lat?: number | null
          lng?: number | null
          lot_size_sqft?: number | null
          notes?: string | null
          state?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_plans: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          crew_id: string | null
          customer_id: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurrence"]
          id: string
          notes: string | null
          price: number
          property_id: string
          service: string
          service_kind: string
          start_date: string
          times_per_year: number | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          crew_id?: string | null
          customer_id: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence"]
          id?: string
          notes?: string | null
          price?: number
          property_id: string
          service: string
          service_kind?: string
          start_date?: string
          times_per_year?: number | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          crew_id?: string | null
          customer_id?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurrence"]
          id?: string
          notes?: string | null
          price?: number
          property_id?: string
          service?: string
          service_kind?: string
          start_date?: string
          times_per_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_plans_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          company_id: string
          company_reply: string | null
          created_at: string
          customer_id: string
          estimate_id: string | null
          id: string
          job_id: string | null
          kind: string
          message: string | null
          requested_date: string | null
          scheduled_job_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          company_reply?: string | null
          created_at?: string
          customer_id: string
          estimate_id?: string | null
          id?: string
          job_id?: string | null
          kind: string
          message?: string | null
          requested_date?: string | null
          scheduled_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          company_reply?: string | null
          created_at?: string
          customer_id?: string
          estimate_id?: string | null
          id?: string
          job_id?: string | null
          kind?: string
          message?: string | null
          requested_date?: string | null
          scheduled_job_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_scheduled_job_id_fkey"
            columns: ["scheduled_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
      customer_accounts: {
        Row: {
          company_id: string | null
          created_at: string | null
          customer_type: string | null
          effective_status: string | null
          ein: string | null
          email: string | null
          id: string | null
          inactive_reason: string | null
          inactivity_reason: string | null
          name: string | null
          notes: string | null
          overdue_balance: number | null
          overdue_hold_limit: number | null
          phone: string | null
          portal_user_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_my_invites: { Args: never; Returns: number }
      add_customer_service: {
        Args: { _company: string; _customer: string; _service: Json }
        Returns: string
      }
      can_access_crew_job: {
        Args: { _company: string; _crew: string; _date: string }
        Returns: boolean
      }
      can_access_job_customer: {
        Args: { _company: string; _customer: string }
        Returns: boolean
      }
      can_access_job_property: {
        Args: { _company: string; _property: string }
        Returns: boolean
      }
      can_read_company: { Args: { _company: string }; Returns: boolean }
      combine_service_visit: {
        Args: { _lawn: string; _service: string }
        Returns: undefined
      }
      create_company: {
        Args: { _name: string; _phone?: string; _plan?: string }
        Returns: string
      }
      create_customer_with_service: {
        Args: {
          _company: string
          _customer: Json
          _property: Json
          _service: Json
        }
        Returns: string
      }
      customer_account_state: {
        Args: { _customer: string }
        Returns: {
          effective_status: string
          inactivity_reason: string
          overdue_balance: number
        }[]
      }
      generate_recurring_jobs: {
        Args: { _company: string; _until: string }
        Returns: number
      }
      generate_service_visits:
        | { Args: { _plan: string; _until: string }; Returns: number }
        | {
            Args: { _plan: string; _today: string; _until: string }
            Returns: number
          }
      has_company_role: {
        Args: {
          _company: string
          _roles: Database["public"]["Enums"]["company_role"][]
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _company: string }; Returns: boolean }
      is_member: { Args: { _company: string }; Returns: boolean }
      is_member_any: { Args: { _company: string }; Returns: boolean }
      is_office: { Args: { _company: string }; Returns: boolean }
      link_my_customer_accounts: { Args: never; Returns: number }
      portal_available_days: {
        Args: { _from: string; _job: string; _to: string }
        Returns: string[]
      }
      portal_cancel_request: { Args: { _id: string }; Returns: undefined }
      portal_request_reschedule: {
        Args: { _date: string; _job: string; _message: string }
        Returns: string
      }
      portal_request_service: {
        Args: { _customer: string; _message: string }
        Returns: string
      }
      portal_respond_estimate: {
        Args: { _accept: boolean; _estimate: string }
        Returns: undefined
      }
      recalc_invoice: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "super_admin"
      company_role:
        | "owner"
        | "office_manager"
        | "crew_manager"
        | "technician"
        | "read_only"
      invoice_status: "draft" | "sent" | "paid" | "partial" | "void" | "overdue"
      job_status: "scheduled" | "in_progress" | "completed" | "cancelled"
      recurrence: "weekly" | "biweekly" | "monthly" | "yearly" | "custom"
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
      app_role: ["super_admin"],
      company_role: [
        "owner",
        "office_manager",
        "crew_manager",
        "technician",
        "read_only",
      ],
      invoice_status: ["draft", "sent", "paid", "partial", "void", "overdue"],
      job_status: ["scheduled", "in_progress", "completed", "cancelled"],
      recurrence: ["weekly", "biweekly", "monthly", "yearly", "custom"],
    },
  },
} as const
