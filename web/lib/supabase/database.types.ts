
export type Database = {
  public: {
    Tables: {
      pipinho_calendar_connections: {
        Row: {
          user_id: string;
          provider: string;
          provider_account_email: string | null;
          calendar_id: string | null;
          calendar_name: string | null;
          timezone: string;
          scope: string | null;
          connected_at: string;
          updated_at: string;
          last_synced_at: string | null;
          sync_status: string;
          sync_error: string | null;
        };
        Insert: Partial<Database["public"]["Tables"]["pipinho_calendar_connections"]["Row"]> & {
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["pipinho_calendar_connections"]["Row"]>;
      };
      pipinho_calendar_credentials: {
        Row: {
          user_id: string;
          encrypted_refresh_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          encrypted_refresh_token: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pipinho_calendar_credentials"]["Row"]>;
      };
      pipinho_calendar_events: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          calendar_id: string;
          provider_event_id: string;
          title: string;
          location: string | null;
          starts_at: string;
          ends_at: string;
          local_start_date: string;
          local_end_date: string;
          all_day: boolean;
          attendance_status: string;
          event_status: string;
          recurring_event_id: string | null;
          provider_updated_at: string | null;
          sync_batch_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["pipinho_calendar_events"]["Row"]> & {
          user_id: string;
          calendar_id: string;
          provider_event_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          local_start_date: string;
          local_end_date: string;
          sync_batch_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["pipinho_calendar_events"]["Row"]>;
      };
    };
  };
};
