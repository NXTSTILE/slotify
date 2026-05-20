export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ServicesDisplayMode = "flat" | "grouped";
export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "rescheduled"
  | "completed";
export type ConversationState =
  | "IDLE"
  | "SELECTING_SERVICES"
  | "SELECTING_DATE"
  | "SELECTING_SLOT"
  | "CONFIRMING_NAME"
  | "BOOKED";
export type NotificationType = "new_booking" | "cancellation" | "reschedule";

export interface Database {
  public: {
    Tables: {
      salons: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          phone: string;
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
          whatsapp_business_account_id: string | null;
          address: string | null;
          city: string | null;
          cancellation_policy: string | null;
          services_display_mode: ServicesDisplayMode;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          phone: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_access_token?: string | null;
          whatsapp_business_account_id?: string | null;
          address?: string | null;
          city?: string | null;
          cancellation_policy?: string | null;
          services_display_mode?: ServicesDisplayMode;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          phone?: string;
          whatsapp_phone_number_id?: string | null;
          whatsapp_access_token?: string | null;
          whatsapp_business_account_id?: string | null;
          address?: string | null;
          city?: string | null;
          cancellation_policy?: string | null;
          services_display_mode?: ServicesDisplayMode;
          created_at?: string;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          id: string;
          salon_id: string;
          name: string;
          display_order: number;
        };
        Insert: {
          id?: string;
          salon_id: string;
          name: string;
          display_order?: number;
        };
        Update: {
          id?: string;
          salon_id?: string;
          name?: string;
          display_order?: number;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          salon_id: string;
          category_id: string | null;
          name: string;
          duration_minutes: number;
          price: number;
          is_active: boolean;
          display_order: number;
        };
        Insert: {
          id?: string;
          salon_id: string;
          category_id?: string | null;
          name: string;
          duration_minutes: number;
          price: number;
          is_active?: boolean;
          display_order?: number;
        };
        Update: {
          id?: string;
          salon_id?: string;
          category_id?: string | null;
          name?: string;
          duration_minutes?: number;
          price?: number;
          is_active?: boolean;
          display_order?: number;
        };
        Relationships: [];
      };
      working_hours: {
        Row: {
          id: string;
          salon_id: string;
          day_of_week: number;
          open_time: string | null;
          close_time: string | null;
          is_closed: boolean;
        };
        Insert: {
          id?: string;
          salon_id: string;
          day_of_week: number;
          open_time?: string | null;
          close_time?: string | null;
          is_closed?: boolean;
        };
        Update: {
          id?: string;
          salon_id?: string;
          day_of_week?: number;
          open_time?: string | null;
          close_time?: string | null;
          is_closed?: boolean;
        };
        Relationships: [];
      };
      holidays: {
        Row: {
          id: string;
          salon_id: string;
          date: string;
          reason: string | null;
        };
        Insert: {
          id?: string;
          salon_id: string;
          date: string;
          reason?: string | null;
        };
        Update: {
          id?: string;
          salon_id?: string;
          date?: string;
          reason?: string | null;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          salon_id: string;
          phone: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          phone: string;
          name?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          phone?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      appointments: {
        Row: {
          id: string;
          salon_id: string;
          customer_id: string;
          start_time: string;
          end_time: string;
          total_duration_minutes: number;
          total_price: number;
          status: AppointmentStatus;
          reminder_sent: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_id: string;
          start_time: string;
          end_time: string;
          total_duration_minutes: number;
          total_price: number;
          status?: AppointmentStatus;
          reminder_sent?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_id?: string;
          start_time?: string;
          end_time?: string;
          total_duration_minutes?: number;
          total_price?: number;
          status?: AppointmentStatus;
          reminder_sent?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      appointment_services: {
        Row: {
          id: string;
          appointment_id: string;
          service_id: string;
          price_at_booking: number;
          duration_at_booking: number;
        };
        Insert: {
          id?: string;
          appointment_id: string;
          service_id: string;
          price_at_booking: number;
          duration_at_booking: number;
        };
        Update: {
          id?: string;
          appointment_id?: string;
          service_id?: string;
          price_at_booking?: number;
          duration_at_booking?: number;
        };
        Relationships: [];
      };
      conversation_states: {
        Row: {
          id: string;
          salon_id: string;
          customer_phone: string;
          state: ConversationState;
          context: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          customer_phone: string;
          state?: ConversationState;
          context?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          customer_phone?: string;
          state?: ConversationState;
          context?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          salon_id: string;
          type: NotificationType;
          appointment_id: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          salon_id: string;
          type: NotificationType;
          appointment_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          salon_id?: string;
          type?: NotificationType;
          appointment_id?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      services_display_mode: ServicesDisplayMode;
      appointment_status: AppointmentStatus;
      conversation_state: ConversationState;
      notification_type: NotificationType;
    };
  };
}
