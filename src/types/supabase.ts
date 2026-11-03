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
    PostgrestVersion: "14.17"
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
      content_automation_settings: {
        Row: {
          automation_mode: string
          business_id: string
          created_at: string
          generation_timezone: string
          id: string
          is_enabled: boolean
          linkedin_frequency_per_week: number
          mode_changed_at: string | null
          mode_changed_by: string | null
          social_frequency_per_week: number
          updated_at: string
        }
        Insert: {
          automation_mode?: string
          business_id: string
          created_at?: string
          generation_timezone?: string
          id?: string
          is_enabled?: boolean
          linkedin_frequency_per_week?: number
          mode_changed_at?: string | null
          mode_changed_by?: string | null
          social_frequency_per_week?: number
          updated_at?: string
        }
        Update: {
          automation_mode?: string
          business_id?: string
          created_at?: string
          generation_timezone?: string
          id?: string
          is_enabled?: boolean
          linkedin_frequency_per_week?: number
          mode_changed_at?: string | null
          mode_changed_by?: string | null
          social_frequency_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_automation_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_automation_settings_mode_changed_by_fkey"
            columns: ["mode_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_clips: {
        Row: {
          attempts: number
          business_id: string
          clip_index: number
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          last_error: string | null
          max_attempts: number
          media_asset_id: string | null
          property_content_id: string
          provider: string
          provider_task_id: string | null
          request_params: Json
          revision_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          business_id: string
          clip_index: number
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          media_asset_id?: string | null
          property_content_id: string
          provider?: string
          provider_task_id?: string | null
          request_params?: Json
          revision_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          business_id?: string
          clip_index?: number
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          media_asset_id?: string | null
          property_content_id?: string
          provider?: string
          provider_task_id?: string | null
          request_params?: Json
          revision_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_clips_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_clips_content"
            columns: ["property_content_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_content"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_clips_revision"
            columns: ["revision_id", "property_content_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["id", "property_content_id"]
          },
        ]
      }
      content_generation_cycles: {
        Row: {
          business_id: string
          completed_at: string | null
          created_at: string
          environment: string
          id: string
          linkedin_target_count: number
          social_target_count: number
          started_at: string | null
          status: string
          updated_at: string
          week_end: string | null
          week_start: string
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          created_at?: string
          environment: string
          id?: string
          linkedin_target_count?: number
          social_target_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          week_end?: string | null
          week_start: string
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          created_at?: string
          environment?: string
          id?: string
          linkedin_target_count?: number
          social_target_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          week_end?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_generation_cycles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_generation_queue: {
        Row: {
          business_id: string
          completed_at: string | null
          content_type: string | null
          created_at: string
          cycle_id: string
          error_message: string | null
          generation_attempts: number
          generation_state: Json
          generation_status: string
          id: string
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          next_attempt_at: string
          pipeline_type: string
          property_id: string | null
          slot_index: number
          started_at: string | null
        }
        Insert: {
          business_id: string
          completed_at?: string | null
          content_type?: string | null
          created_at?: string
          cycle_id: string
          error_message?: string | null
          generation_attempts?: number
          generation_state?: Json
          generation_status?: string
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          pipeline_type: string
          property_id?: string | null
          slot_index: number
          started_at?: string | null
        }
        Update: {
          business_id?: string
          completed_at?: string | null
          content_type?: string | null
          created_at?: string
          cycle_id?: string
          error_message?: string | null
          generation_attempts?: number
          generation_state?: Json
          generation_status?: string
          id?: string
          locked_by?: string | null
          locked_until?: string | null
          max_attempts?: number
          next_attempt_at?: string
          pipeline_type?: string
          property_id?: string | null
          slot_index?: number
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_queue_cycle"
            columns: ["cycle_id", "business_id"]
            isOneToOne: false
            referencedRelation: "content_generation_cycles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_queue_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_queue_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_promotion_stats"
            referencedColumns: ["property_id", "business_id"]
          },
        ]
      }
      content_performance: {
        Row: {
          business_id: string
          clicks: number | null
          collected_at: string
          comments: number | null
          id: string
          impressions: number | null
          likes: number | null
          reach: number | null
          shares: number | null
          social_post_id: string
        }
        Insert: {
          business_id: string
          clicks?: number | null
          collected_at?: string
          comments?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          reach?: number | null
          shares?: number | null
          social_post_id: string
        }
        Update: {
          business_id?: string
          clicks?: number | null
          collected_at?: string
          comments?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          reach?: number | null
          shares?: number | null
          social_post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_content_performance_post"
            columns: ["social_post_id", "business_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          business_id: string
          caption: string | null
          created_at: string
          created_by: string | null
          format_reason: string | null
          generation_prompt: string | null
          hashtags: string[]
          id: string
          media_asset_id: string | null
          property_content_id: string
          revision_number: number
          script: string | null
          validated_at: string | null
          validation_errors: Json | null
          validation_status: string
          video_duration: number | null
          video_format: string | null
        }
        Insert: {
          business_id: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          format_reason?: string | null
          generation_prompt?: string | null
          hashtags?: string[]
          id?: string
          media_asset_id?: string | null
          property_content_id: string
          revision_number: number
          script?: string | null
          validated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string
          video_duration?: number | null
          video_format?: string | null
        }
        Update: {
          business_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string | null
          format_reason?: string | null
          generation_prompt?: string | null
          hashtags?: string[]
          id?: string
          media_asset_id?: string | null
          property_content_id?: string
          revision_number?: number
          script?: string | null
          validated_at?: string | null
          validation_errors?: Json | null
          validation_status?: string
          video_duration?: number | null
          video_format?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_revisions_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_revisions_content"
            columns: ["property_content_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_content"
            referencedColumns: ["id", "business_id"]
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
      properties: {
        Row: {
          business_id: string
          city: string | null
          country: string | null
          created_at: string
          event_types: string[]
          event_types_raw: string | null
          id: string
          import_batch: string | null
          legacy_fields: Json
          location_raw: string | null
          location_verified: string
          region: string | null
          rotation_seq: number
          source_key: string
          source_row: number | null
          space_category: string | null
          status: string
          timezone: string | null
          title: string
          updated_at: string
        }
        Insert: {
          business_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          event_types?: string[]
          event_types_raw?: string | null
          id?: string
          import_batch?: string | null
          legacy_fields?: Json
          location_raw?: string | null
          location_verified?: string
          region?: string | null
          rotation_seq?: never
          source_key: string
          source_row?: number | null
          space_category?: string | null
          status?: string
          timezone?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          event_types?: string[]
          event_types_raw?: string | null
          id?: string
          import_batch?: string | null
          legacy_fields?: Json
          location_raw?: string | null
          location_verified?: string
          region?: string | null
          rotation_seq?: never
          source_key?: string
          source_row?: number | null
          space_category?: string | null
          status?: string
          timezone?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      property_content: {
        Row: {
          archived_at: string | null
          business_id: string
          content_type: string
          created_at: string
          current_revision_id: string | null
          cycle_id: string | null
          environment: string
          generation_status: string
          id: string
          pipeline_type: string
          property_id: string
          queue_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          business_id: string
          content_type: string
          created_at?: string
          current_revision_id?: string | null
          cycle_id?: string | null
          environment: string
          generation_status?: string
          id?: string
          pipeline_type: string
          property_id: string
          queue_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          business_id?: string
          content_type?: string
          created_at?: string
          current_revision_id?: string | null
          cycle_id?: string | null
          environment?: string
          generation_status?: string
          id?: string
          pipeline_type?: string
          property_id?: string
          queue_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pc_current_revision"
            columns: ["current_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["id", "property_content_id"]
          },
          {
            foreignKeyName: "fk_pc_cycle"
            columns: ["cycle_id", "business_id"]
            isOneToOne: false
            referencedRelation: "content_generation_cycles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_pc_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_pc_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_promotion_stats"
            referencedColumns: ["property_id", "business_id"]
          },
          {
            foreignKeyName: "fk_pc_queue"
            columns: ["queue_id", "business_id"]
            isOneToOne: false
            referencedRelation: "content_generation_queue"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      property_images: {
        Row: {
          business_id: string
          created_at: string
          id: string
          media_asset_id: string | null
          position: number
          property_id: string
          url: string
          validation_status: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          position: number
          property_id: string
          url: string
          validation_status?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          media_asset_id?: string | null
          position?: number
          property_id?: string
          url?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_images_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_property_images_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_promotion_stats"
            referencedColumns: ["property_id", "business_id"]
          },
          {
            foreignKeyName: "property_images_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      property_legacy_content: {
        Row: {
          business_id: string
          caption: string | null
          created_at: string
          hashtags: string | null
          id: string
          kind: string
          property_id: string | null
          property_title_raw: string
          raw: Json
          source_created_at: string | null
          source_key: string
          source_row: number
          source_sheet: string
          source_status: string | null
          url: string | null
        }
        Insert: {
          business_id: string
          caption?: string | null
          created_at?: string
          hashtags?: string | null
          id?: string
          kind: string
          property_id?: string | null
          property_title_raw: string
          raw?: Json
          source_created_at?: string | null
          source_key: string
          source_row: number
          source_sheet: string
          source_status?: string | null
          url?: string | null
        }
        Update: {
          business_id?: string
          caption?: string | null
          created_at?: string
          hashtags?: string | null
          id?: string
          kind?: string
          property_id?: string | null
          property_title_raw?: string
          raw?: Json
          source_created_at?: string | null
          source_key?: string
          source_row?: number
          source_sheet?: string
          source_status?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_property_legacy_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_property_legacy_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_promotion_stats"
            referencedColumns: ["property_id", "business_id"]
          },
          {
            foreignKeyName: "property_legacy_content_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      property_promotions: {
        Row: {
          business_id: string
          claimed_at: string
          cycle_id: string | null
          environment: string
          failure_reason: string | null
          generated_at: string | null
          id: string
          pipeline_type: string
          property_id: string
          queue_id: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          business_id: string
          claimed_at?: string
          cycle_id?: string | null
          environment: string
          failure_reason?: string | null
          generated_at?: string | null
          id?: string
          pipeline_type: string
          property_id: string
          queue_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          business_id?: string
          claimed_at?: string
          cycle_id?: string | null
          environment?: string
          failure_reason?: string | null
          generated_at?: string | null
          id?: string
          pipeline_type?: string
          property_id?: string
          queue_id?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pp_cycle"
            columns: ["cycle_id", "business_id"]
            isOneToOne: false
            referencedRelation: "content_generation_cycles"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_pp_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_pp_property"
            columns: ["property_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_promotion_stats"
            referencedColumns: ["property_id", "business_id"]
          },
          {
            foreignKeyName: "fk_pp_queue"
            columns: ["queue_id", "business_id"]
            isOneToOne: false
            referencedRelation: "content_generation_queue"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      publishing_logs: {
        Row: {
          attempt_number: number
          business_id: string
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          idempotency_key: string | null
          request_metadata: Json
          response_metadata: Json
          social_post_id: string
          status: string
        }
        Insert: {
          attempt_number: number
          business_id: string
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          request_metadata?: Json
          response_metadata?: Json
          social_post_id: string
          status: string
        }
        Update: {
          attempt_number?: number
          business_id?: string
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          request_metadata?: Json
          response_metadata?: Json
          social_post_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_publishing_logs_post"
            columns: ["social_post_id", "business_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      social_posts: {
        Row: {
          business_id: string
          caption: string | null
          connection_id: string | null
          content_revision_id: string | null
          created_at: string
          environment: string | null
          error_message: string | null
          format: string | null
          generation_inputs: Json
          hashtags: string[] | null
          id: string
          idea_prompt: string | null
          idempotency_key: string | null
          locked_by: string | null
          locked_until: string | null
          media_asset_id: string | null
          media_asset_ids: string[]
          next_attempt_at: string
          platform: string | null
          platform_metadata: Json
          platform_post_id: string | null
          property_content_id: string | null
          publish_attempt_count: number
          publish_outcome_unknown: boolean
          publish_started_at: string | null
          published_at: string | null
          retry_base_attempt: number
          schedule_timezone: string | null
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
          content_revision_id?: string | null
          created_at?: string
          environment?: string | null
          error_message?: string | null
          format?: string | null
          generation_inputs?: Json
          hashtags?: string[] | null
          id?: string
          idea_prompt?: string | null
          idempotency_key?: string | null
          locked_by?: string | null
          locked_until?: string | null
          media_asset_id?: string | null
          media_asset_ids?: string[]
          next_attempt_at?: string
          platform?: string | null
          platform_metadata?: Json
          platform_post_id?: string | null
          property_content_id?: string | null
          publish_attempt_count?: number
          publish_outcome_unknown?: boolean
          publish_started_at?: string | null
          published_at?: string | null
          retry_base_attempt?: number
          schedule_timezone?: string | null
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
          content_revision_id?: string | null
          created_at?: string
          environment?: string | null
          error_message?: string | null
          format?: string | null
          generation_inputs?: Json
          hashtags?: string[] | null
          id?: string
          idea_prompt?: string | null
          idempotency_key?: string | null
          locked_by?: string | null
          locked_until?: string | null
          media_asset_id?: string | null
          media_asset_ids?: string[]
          next_attempt_at?: string
          platform?: string | null
          platform_metadata?: Json
          platform_post_id?: string | null
          property_content_id?: string | null
          publish_attempt_count?: number
          publish_outcome_unknown?: boolean
          publish_started_at?: string | null
          published_at?: string | null
          retry_base_attempt?: number
          schedule_timezone?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          upload_post_job_id?: string | null
          upload_post_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_social_posts_content"
            columns: ["property_content_id", "business_id"]
            isOneToOne: false
            referencedRelation: "property_content"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "fk_social_posts_revision"
            columns: ["content_revision_id", "property_content_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["id", "property_content_id"]
          },
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
      property_promotion_stats: {
        Row: {
          business_id: string | null
          content_count: number | null
          environment: string | null
          failed_generation_count: number | null
          generated_count: number | null
          in_flight_count: number | null
          last_generated_at: string | null
          last_linkedin_generated_at: string | null
          last_published_at: string | null
          last_social_generated_at: string | null
          linkedin_generated_count: number | null
          property_id: string | null
          published_content_count: number | null
          social_generated_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_generation_jobs: {
        Args: { p_lease?: string; p_limit?: number; p_worker: string }
        Returns: {
          business_id: string
          completed_at: string | null
          content_type: string | null
          created_at: string
          cycle_id: string
          error_message: string | null
          generation_attempts: number
          generation_state: Json
          generation_status: string
          id: string
          locked_by: string | null
          locked_until: string | null
          max_attempts: number
          next_attempt_at: string
          pipeline_type: string
          property_id: string | null
          slot_index: number
          started_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_generation_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_property_for_job: { Args: { p_queue: string }; Returns: string }
      claim_publish_jobs: {
        Args: {
          p_lease?: string
          p_limit?: number
          p_post_id?: string
          p_worker: string
        }
        Returns: {
          business_id: string
          caption: string | null
          connection_id: string | null
          content_revision_id: string | null
          created_at: string
          environment: string | null
          error_message: string | null
          format: string | null
          generation_inputs: Json
          hashtags: string[] | null
          id: string
          idea_prompt: string | null
          idempotency_key: string | null
          locked_by: string | null
          locked_until: string | null
          media_asset_id: string | null
          media_asset_ids: string[]
          next_attempt_at: string
          platform: string | null
          platform_metadata: Json
          platform_post_id: string | null
          property_content_id: string | null
          publish_attempt_count: number
          publish_outcome_unknown: boolean
          publish_started_at: string | null
          published_at: string | null
          retry_base_attempt: number
          schedule_timezone: string | null
          scheduled_at: string | null
          status: string
          title: string | null
          updated_at: string
          upload_post_job_id: string | null
          upload_post_request_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "social_posts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_generation_job: {
        Args: { p_queue: string; p_worker: string }
        Returns: undefined
      }
      content_publish_max_lateness: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      ensure_content_clip: {
        Args: { p_index: number; p_revision: string }
        Returns: {
          attempts: number
          business_id: string
          clip_index: number
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          last_error: string | null
          max_attempts: number
          media_asset_id: string | null
          property_content_id: string
          provider: string
          provider_task_id: string | null
          request_params: Json
          revision_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "content_clips"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_cycle_slots: { Args: { p_cycle: string }; Returns: number }
      fail_generation_job: {
        Args: {
          p_error: string
          p_queue: string
          p_retryable?: boolean
          p_worker: string
        }
        Returns: string
      }
      finish_publish: {
        Args: {
          p_attempt: number
          p_block_reason?: string
          p_error?: string
          p_outcome: string
          p_platform_post_id?: string
          p_post: string
          p_response?: Json
          p_retryable?: boolean
        }
        Returns: string
      }
      generation_job_still_valid: {
        Args: { p_queue: string; p_worker: string }
        Returns: boolean
      }
      get_publish_payload: { Args: { p_post: string }; Returns: Json }
      is_business_admin: { Args: { p_business: string }; Returns: boolean }
      is_service_context: { Args: never; Returns: boolean }
      publish_block_reason: {
        Args: {
          p_check_due: boolean
          p_expect_status: string
          p_post_id: string
        }
        Returns: string
      }
      record_publish_response: {
        Args: {
          p_attempt: number
          p_job_id?: string
          p_post: string
          p_request_id?: string
          p_response?: Json
        }
        Returns: boolean
      }
      recover_stale_publishing: { Args: never; Returns: number }
      refresh_cycle_status: { Args: { p_cycle: string }; Returns: undefined }
      release_held_posts: {
        Args: { p_business: string }
        Returns: {
          released: number
          skipped: number
        }[]
      }
      renew_generation_lease: {
        Args: { p_lease?: string; p_queue: string; p_worker: string }
        Returns: boolean
      }
      request_content_regeneration: {
        Args: { p_content: string; p_prompt?: string }
        Returns: string
      }
      resolve_unknown_publish: {
        Args: {
          p_note?: string
          p_outcome: string
          p_platform_post_id?: string
          p_post: string
        }
        Returns: string
      }
      retry_failed_publish: { Args: { p_post: string }; Returns: string }
      unknown_publish_posts: {
        Args: never
        Returns: {
          business_id: string
          caption: string | null
          connection_id: string | null
          content_revision_id: string | null
          created_at: string
          environment: string | null
          error_message: string | null
          format: string | null
          generation_inputs: Json
          hashtags: string[] | null
          id: string
          idea_prompt: string | null
          idempotency_key: string | null
          locked_by: string | null
          locked_until: string | null
          media_asset_id: string | null
          media_asset_ids: string[]
          next_attempt_at: string
          platform: string | null
          platform_metadata: Json
          platform_post_id: string | null
          property_content_id: string | null
          publish_attempt_count: number
          publish_outcome_unknown: boolean
          publish_started_at: string | null
          published_at: string | null
          retry_base_attempt: number
          schedule_timezone: string | null
          scheduled_at: string | null
          status: string
          title: string | null
          updated_at: string
          upload_post_job_id: string | null
          upload_post_request_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "social_posts"
          isOneToOne: false
          isSetofReturn: true
        }
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
