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
      ad_performance_daily: {
        Row: {
          ad_id: string | null
          ad_text: string | null
          business_id: string
          clicks: number
          conversions: number
          cpa: number | null
          cpc_cents: number | null
          cpm_cents: number | null
          ctr: number | null
          format: string | null
          hold_rate: number | null
          hook_rate: number | null
          id: number
          impressions: number
          media_url: string | null
          meta_ad_id: string | null
          metric_date: string
          raw_data: Json
          reach: number
          roas: number | null
          spend_cents: number
        }
        Insert: {
          ad_id?: string | null
          ad_text?: string | null
          business_id: string
          clicks?: number
          conversions?: number
          cpa?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          ctr?: number | null
          format?: string | null
          hold_rate?: number | null
          hook_rate?: number | null
          id?: never
          impressions?: number
          media_url?: string | null
          meta_ad_id?: string | null
          metric_date: string
          raw_data?: Json
          reach?: number
          roas?: number | null
          spend_cents?: number
        }
        Update: {
          ad_id?: string | null
          ad_text?: string | null
          business_id?: string
          clicks?: number
          conversions?: number
          cpa?: number | null
          cpc_cents?: number | null
          cpm_cents?: number | null
          ctr?: number | null
          format?: string | null
          hold_rate?: number | null
          hook_rate?: number | null
          id?: never
          impressions?: number
          media_url?: string | null
          meta_ad_id?: string | null
          metric_date?: string
          raw_data?: Json
          reach?: number
          roas?: number | null
          spend_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "ad_performance_daily_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_performance_daily_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_sets: {
        Row: {
          bid_strategy: string | null
          business_id: string
          campaign_id: string
          created_at: string
          daily_budget_cents: number | null
          end_at: string | null
          external_adset_id: string | null
          id: string
          lifetime_budget_cents: number | null
          name: string
          optimization_goal: string | null
          placements: Json
          start_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          targeting: Json
        }
        Insert: {
          bid_strategy?: string | null
          business_id: string
          campaign_id: string
          created_at?: string
          daily_budget_cents?: number | null
          end_at?: string | null
          external_adset_id?: string | null
          id?: string
          lifetime_budget_cents?: number | null
          name: string
          optimization_goal?: string | null
          placements?: Json
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          targeting?: Json
        }
        Update: {
          bid_strategy?: string | null
          business_id?: string
          campaign_id?: string
          created_at?: string
          daily_budget_cents?: number | null
          end_at?: string | null
          external_adset_id?: string | null
          id?: string
          lifetime_budget_cents?: number | null
          name?: string
          optimization_goal?: string | null
          placements?: Json
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          targeting?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ad_sets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_sets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ads: {
        Row: {
          ad_set_id: string
          business_id: string
          created_at: string
          creative_id: string | null
          external_ad_id: string | null
          external_creative_id: string | null
          id: string
          name: string
          status: Database["public"]["Enums"]["campaign_status"]
        }
        Insert: {
          ad_set_id: string
          business_id: string
          created_at?: string
          creative_id?: string | null
          external_ad_id?: string | null
          external_creative_id?: string | null
          id?: string
          name: string
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Update: {
          ad_set_id?: string
          business_id?: string
          created_at?: string
          creative_id?: string | null
          external_ad_id?: string | null
          external_creative_id?: string | null
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["campaign_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ads_ad_set_id_fkey"
            columns: ["ad_set_id"]
            isOneToOne: false
            referencedRelation: "ad_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      api_credentials: {
        Row: {
          business_id: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          label: string
          provider: string
          secret_ref: string
        }
        Insert: {
          business_id: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          provider: string
          secret_ref: string
        }
        Update: {
          business_id?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          provider?: string
          secret_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_credentials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_users: {
        Row: {
          business_id: string
          joined_at: string
          role: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["business_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          business_colors: Json
          business_voice: string | null
          contact_phone: string | null
          core_offerings: string | null
          created_at: string
          description: string | null
          guidelines: Json
          id: string
          industry: string | null
          keywords: string[]
          logo_asset_id: string | null
          logo_url: string | null
          name: string
          outreach_settings: Json
          pain_points: string | null
          services: Json
          settings: Json
          target_audience: string | null
          target_countries: Json | null
          tone_of_voice: string | null
          updated_at: string
          video_reference_enabled: boolean
          video_reference_female_url: string | null
          video_reference_male_url: string | null
          website_url: string | null
        }
        Insert: {
          business_colors?: Json
          business_voice?: string | null
          contact_phone?: string | null
          core_offerings?: string | null
          created_at?: string
          description?: string | null
          guidelines?: Json
          id?: string
          industry?: string | null
          keywords?: string[]
          logo_asset_id?: string | null
          logo_url?: string | null
          name: string
          outreach_settings?: Json
          pain_points?: string | null
          services?: Json
          settings?: Json
          target_audience?: string | null
          target_countries?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
          video_reference_enabled?: boolean
          video_reference_female_url?: string | null
          video_reference_male_url?: string | null
          website_url?: string | null
        }
        Update: {
          business_colors?: Json
          business_voice?: string | null
          contact_phone?: string | null
          core_offerings?: string | null
          created_at?: string
          description?: string | null
          guidelines?: Json
          id?: string
          industry?: string | null
          keywords?: string[]
          logo_asset_id?: string | null
          logo_url?: string | null
          name?: string
          outreach_settings?: Json
          pain_points?: string | null
          services?: Json
          settings?: Json
          target_audience?: string | null
          target_countries?: Json | null
          tone_of_voice?: string | null
          updated_at?: string
          video_reference_enabled?: boolean
          video_reference_female_url?: string | null
          video_reference_male_url?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_businesses_logo"
            columns: ["logo_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ad_account_id: string | null
          business_id: string
          created_at: string
          currency: string
          daily_budget_cents: number | null
          end_at: string | null
          external_campaign_id: string | null
          id: string
          lifetime_budget_cents: number | null
          name: string
          objective: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          ad_account_id?: string | null
          business_id: string
          created_at?: string
          currency?: string
          daily_budget_cents?: number | null
          end_at?: string | null
          external_campaign_id?: string | null
          id?: string
          lifetime_budget_cents?: number | null
          name: string
          objective?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          ad_account_id?: string | null
          business_id?: string
          created_at?: string
          currency?: string
          daily_budget_cents?: number | null
          end_at?: string | null
          external_campaign_id?: string | null
          id?: string
          lifetime_budget_cents?: number | null
          name?: string
          objective?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_connected_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      email_events: {
        Row: {
          business_id: string
          channel: string
          contact_id: string | null
          event_type: Database["public"]["Enums"]["email_event_type"]
          id: string
          occurred_at: string
          outreach_campaign_id: string | null
          provider_message_id: string | null
          raw_data: Json | null
        }
        Insert: {
          business_id: string
          channel: string
          contact_id?: string | null
          event_type: Database["public"]["Enums"]["email_event_type"]
          id?: string
          occurred_at?: string
          outreach_campaign_id?: string | null
          provider_message_id?: string | null
          raw_data?: Json | null
        }
        Update: {
          business_id?: string
          channel?: string
          contact_id?: string | null
          event_type?: Database["public"]["Enums"]["email_event_type"]
          id?: string
          occurred_at?: string
          outreach_campaign_id?: string | null
          provider_message_id?: string | null
          raw_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_outreach_campaign_id_fkey"
            columns: ["outreach_campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_id: string | null
          ad_name: string | null
          adset_name: string | null
          business_id: string
          campaign_name: string | null
          created_at: string
          field_data: Json
          id: string
          meta_form_id: string | null
          meta_lead_id: string
          status: string
        }
        Insert: {
          ad_id?: string | null
          ad_name?: string | null
          adset_name?: string | null
          business_id: string
          campaign_name?: string | null
          created_at?: string
          field_data?: Json
          id?: string
          meta_form_id?: string | null
          meta_lead_id: string
          status?: string
        }
        Update: {
          ad_id?: string | null
          ad_name?: string | null
          adset_name?: string | null
          business_id?: string
          campaign_name?: string | null
          created_at?: string
          field_data?: Json
          id?: string
          meta_form_id?: string | null
          meta_lead_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_ad_id_fkey"
            columns: ["ad_id"]
            isOneToOne: false
            referencedRelation: "ads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          bucket: string
          business_id: string
          created_at: string
          duration_seconds: number | null
          height_px: number | null
          id: string
          metadata: Json
          mime_type: string | null
          size_bytes: number | null
          source: Database["public"]["Enums"]["asset_source"]
          storage_path: string
          thumbnail_path: string | null
          type: Database["public"]["Enums"]["asset_type"]
          width_px: number | null
        }
        Insert: {
          bucket?: string
          business_id: string
          created_at?: string
          duration_seconds?: number | null
          height_px?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["asset_source"]
          storage_path: string
          thumbnail_path?: string | null
          type: Database["public"]["Enums"]["asset_type"]
          width_px?: number | null
        }
        Update: {
          bucket?: string
          business_id?: string
          created_at?: string
          duration_seconds?: number | null
          height_px?: number | null
          id?: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          source?: Database["public"]["Enums"]["asset_source"]
          storage_path?: string
          thumbnail_path?: string | null
          type?: Database["public"]["Enums"]["asset_type"]
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_creatives: {
        Row: {
          ad_script: Json | null
          aspect_ratio: string
          audio_style: string | null
          business_id: string
          character_type: string | null
          created_at: string
          duration: string | null
          id: string
          idea_prompt: string | null
          language: string | null
          media_asset_id: string | null
          media_urls: Json | null
          revision_history: Json
          service: string | null
          status: string | null
          studio_session_id: string | null
          type: string | null
          updated_at: string
          video_mode: string
          video_style: string | null
          voice_id: string | null
        }
        Insert: {
          ad_script?: Json | null
          aspect_ratio?: string
          audio_style?: string | null
          business_id: string
          character_type?: string | null
          created_at?: string
          duration?: string | null
          id?: string
          idea_prompt?: string | null
          language?: string | null
          media_asset_id?: string | null
          media_urls?: Json | null
          revision_history?: Json
          service?: string | null
          status?: string | null
          studio_session_id?: string | null
          type?: string | null
          updated_at?: string
          video_mode?: string
          video_style?: string | null
          voice_id?: string | null
        }
        Update: {
          ad_script?: Json | null
          aspect_ratio?: string
          audio_style?: string | null
          business_id?: string
          character_type?: string | null
          created_at?: string
          duration?: string | null
          id?: string
          idea_prompt?: string | null
          language?: string | null
          media_asset_id?: string | null
          media_urls?: Json | null
          revision_history?: Json
          service?: string | null
          status?: string | null
          studio_session_id?: string | null
          type?: string | null
          updated_at?: string
          video_mode?: string
          video_style?: string | null
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_creatives_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_creatives_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_ad_creatives_studio_session_id_fkey"
            columns: ["studio_session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaign_leads: {
        Row: {
          id: string
          lead_id: string
          outreach_campaign_id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          id?: string
          lead_id: string
          outreach_campaign_id: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          id?: string
          lead_id?: string
          outreach_campaign_id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaign_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "outreach_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_leads_outreach_campaign_id_fkey"
            columns: ["outreach_campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaign_lists: {
        Row: {
          created_at: string
          id: string
          list_id: string
          outreach_campaign_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          outreach_campaign_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          outreach_campaign_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaign_lists_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "outreach_lead_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaign_lists_outreach_campaign_id_fkey"
            columns: ["outreach_campaign_id"]
            isOneToOne: false
            referencedRelation: "outreach_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_campaigns: {
        Row: {
          business_id: string
          created_at: string
          cta_link: string | null
          cta_text: string | null
          daily_limit: number
          external_campaign_id: string | null
          generated_body: Json | null
          generated_subject: string | null
          goal: string | null
          id: string
          list_id: string | null
          message_brief: string | null
          name: string
          revision_history: Json
          service_type: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          target_region: string | null
          tone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          daily_limit?: number
          external_campaign_id?: string | null
          generated_body?: Json | null
          generated_subject?: string | null
          goal?: string | null
          id?: string
          list_id?: string | null
          message_brief?: string | null
          name: string
          revision_history?: Json
          service_type?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_region?: string | null
          tone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          cta_link?: string | null
          cta_text?: string | null
          daily_limit?: number
          external_campaign_id?: string | null
          generated_body?: Json | null
          generated_subject?: string | null
          goal?: string | null
          id?: string
          list_id?: string | null
          message_brief?: string | null
          name?: string
          revision_history?: Json
          service_type?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          target_region?: string | null
          tone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "outreach_lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_lead_lists: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_lead_lists_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_leads: {
        Row: {
          business_id: string
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          email: string
          email_verification_status: string
          first_name: string | null
          id: string
          last_name: string | null
          linkedin_url: string | null
          list_id: string | null
          phone: string | null
          source: string
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          business_id: string
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email: string
          email_verification_status?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          phone?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          business_id?: string
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string
          email_verification_status?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          linkedin_url?: string | null
          list_id?: string | null
          phone?: string | null
          source?: string
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_leads_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_leads_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "outreach_lead_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token_ref: string | null
          account_kind: string
          business_id: string
          created_at: string
          display_name: string | null
          external_id: string
          id: string
          metadata: Json
          platform: Database["public"]["Enums"]["platform_type"]
          refresh_token_ref: string | null
          scopes: string[]
          status: Database["public"]["Enums"]["account_status"]
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token_ref?: string | null
          account_kind: string
          business_id: string
          created_at?: string
          display_name?: string | null
          external_id: string
          id?: string
          metadata?: Json
          platform: Database["public"]["Enums"]["platform_type"]
          refresh_token_ref?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["account_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ref?: string | null
          account_kind?: string
          business_id?: string
          created_at?: string
          display_name?: string | null
          external_id?: string
          id?: string
          metadata?: Json
          platform?: Database["public"]["Enums"]["platform_type"]
          refresh_token_ref?: string | null
          scopes?: string[]
          status?: Database["public"]["Enums"]["account_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      prompt_overrides: {
        Row: {
          business_id: string
          created_at: string
          id: string
          prompt_key: string
          template_text: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          prompt_key: string
          template_text: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          prompt_key?: string
          template_text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_overrides_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          business_id: string
          caption: string | null
          connection_id: string | null
          created_at: string
          error_message: string | null
          format: string | null
          generation_inputs: Json
          id: string
          idea_prompt: string | null
          media_asset_id: string | null
          media_asset_ids: string[]
          published_at: string | null
          scheduled_at: string | null
          status: string
          title: string | null
          updated_at: string
          upload_post_job_id: string | null
          upload_post_request_id: string | null
        }
        Insert: {
          business_id: string
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          format?: string | null
          generation_inputs?: Json
          id?: string
          idea_prompt?: string | null
          media_asset_id?: string | null
          media_asset_ids?: string[]
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          upload_post_job_id?: string | null
          upload_post_request_id?: string | null
        }
        Update: {
          business_id?: string
          caption?: string | null
          connection_id?: string | null
          created_at?: string
          error_message?: string | null
          format?: string | null
          generation_inputs?: Json
          id?: string
          idea_prompt?: string | null
          media_asset_id?: string | null
          media_asset_ids?: string[]
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          upload_post_job_id?: string | null
          upload_post_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_messages: {
        Row: {
          content: string | null
          created_at: string
          id: string
          kind: string
          payload: Json | null
          role: string
          session_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          role: string
          session_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "studio_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_sessions: {
        Row: {
          aspect_ratio: string
          business_id: string
          created_at: string
          creative_id: string | null
          id: string
          initial_idea: string
          product_area: string
          qa_brief: Json
          raw_image_url: string | null
          reference_image_url: string | null
          service: string | null
          status: string
          updated_at: string
        }
        Insert: {
          aspect_ratio?: string
          business_id: string
          created_at?: string
          creative_id?: string | null
          id?: string
          initial_idea: string
          product_area?: string
          qa_brief?: Json
          raw_image_url?: string | null
          reference_image_url?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          aspect_ratio?: string
          business_id?: string
          created_at?: string
          creative_id?: string | null
          id?: string
          initial_idea?: string
          product_area?: string
          qa_brief?: Json
          raw_image_url?: string | null
          reference_image_url?: string | null
          service?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_sessions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_sessions_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "meta_ad_creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_post_analytics_cache: {
        Row: {
          business_id: string
          cache_key: string
          data: Json
          fetched_at: string
          id: string
        }
        Insert: {
          business_id: string
          cache_key: string
          data: Json
          fetched_at?: string
          id?: string
        }
        Update: {
          business_id?: string
          cache_key?: string
          data?: Json
          fetched_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_post_analytics_cache_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      user_business_ids: { Args: never; Returns: string[] }
      user_business_write_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      account_status: "connected" | "expired" | "revoked" | "error"
      asset_source: "ai_generated" | "uploaded" | "scraped"
      asset_type: "image" | "video" | "audio" | "document"
      business_role: "owner" | "admin" | "editor" | "viewer"
      campaign_status: "draft" | "active" | "paused" | "completed" | "archived"
      creative_status:
        | "draft"
        | "in_review"
        | "approved"
        | "rejected"
        | "archived"
      email_event_type:
        | "sent"
        | "delivered"
        | "opened"
        | "clicked"
        | "replied"
        | "bounced"
        | "complained"
        | "unsubscribed"
      generation_type:
        | "ad_copy"
        | "image"
        | "video"
        | "newsletter"
        | "outreach_email"
        | "analysis"
      lead_status:
        | "new"
        | "contacted"
        | "replied"
        | "interested"
        | "not_interested"
        | "bounced"
        | "do_not_contact"
      platform_type:
        | "facebook"
        | "instagram"
        | "linkedin"
        | "x"
        | "tiktok"
        | "youtube"
        | "threads"
      post_status:
        | "draft"
        | "scheduled"
        | "publishing"
        | "published"
        | "failed"
        | "deleted"
      user_role: "admin" | "editor" | "viewer"
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
      account_status: ["connected", "expired", "revoked", "error"],
      asset_source: ["ai_generated", "uploaded", "scraped"],
      asset_type: ["image", "video", "audio", "document"],
      business_role: ["owner", "admin", "editor", "viewer"],
      campaign_status: ["draft", "active", "paused", "completed", "archived"],
      creative_status: [
        "draft",
        "in_review",
        "approved",
        "rejected",
        "archived",
      ],
      email_event_type: [
        "sent",
        "delivered",
        "opened",
        "clicked",
        "replied",
        "bounced",
        "complained",
        "unsubscribed",
      ],
      generation_type: [
        "ad_copy",
        "image",
        "video",
        "newsletter",
        "outreach_email",
        "analysis",
      ],
      lead_status: [
        "new",
        "contacted",
        "replied",
        "interested",
        "not_interested",
        "bounced",
        "do_not_contact",
      ],
      platform_type: [
        "facebook",
        "instagram",
        "linkedin",
        "x",
        "tiktok",
        "youtube",
        "threads",
      ],
      post_status: [
        "draft",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "deleted",
      ],
      user_role: ["admin", "editor", "viewer"],
    },
  },
} as const
