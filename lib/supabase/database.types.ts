// Runtime identity tables and scoped business RPC contract.
// Regenerate/extend alongside migrations as the application schema grows.
export type StaffRole = "owner" | "coordinator" | "technician";
type Organization = {
  id: string;
  display_name: string;
  time_zone: string;
  created_at: string;
  version: number;
};
type Membership = {
  id: string;
  organization_id: string;
  user_id: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
  version: number;
};
export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Pick<Organization, "display_name"> &
          Partial<Omit<Organization, "display_name">>;
        Update: Partial<Organization>;
        Relationships: [];
      };
      memberships: {
        Row: Membership;
        Insert: Pick<Membership, "organization_id" | "user_id" | "role"> &
          Partial<Omit<Membership, "organization_id" | "user_id" | "role">>;
        Update: Partial<Membership>;
        Relationships: [
          {
            foreignKeyName: "memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      owner_export: { Args: { p_organization_id: string; p_datasets?: string[]; p_site_id?: string }; Returns: unknown };
      handover_queue: { Args: { p_organization_id: string; p_filters?: unknown }; Returns: unknown };
      billing_review_detail: { Args: { p_organization_id: string; p_visit_id: string }; Returns: unknown };
      billing_review_command: { Args: { p_organization_id: string; p_visit_id: string; p_operation_id: string; p_version: number; p_visit_version: number; p_ready: boolean; p_note: string }; Returns: unknown };
      maintenance_generation_command: {
        Args: {
          p_organization_id: string;
          p_plan_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: string;
      };
      maintenance_generation_state: {
        Args: { p_organization_id: string; p_plan_id: string; p_page?: number };
        Returns: unknown;
      };
      maintenance_tick: { Args: { p_plan_id?: string }; Returns: number };
      maintenance_claim: { Args: { p_plan_id?: string }; Returns: unknown };
      maintenance_execute: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: unknown;
      };
      maintenance_fail: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: undefined;
      };

      maintenance_plan_command: {
        Args: {
          p_organization_id: string;
          p_plan_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: string;
      };
      maintenance_preview: {
        Args: {
          p_organization_id: string;
          p_data: unknown;
          p_from: string;
          p_count?: number;
        };
        Returns: unknown;
      };
      maintenance_editor: {
        Args: { p_organization_id: string; p_site_id?: string };
        Returns: unknown;
      };
      maintenance_detail: {
        Args: { p_organization_id: string; p_plan_id: string };
        Returns: unknown;
      };
      maintenance_list: {
        Args: { p_organization_id: string; p_state?: string; p_page?: number };
        Returns: unknown;
      };

      import_apply: {
        Args: {
          p_organization_id: string;
          p_batch_id: string;
          p_preview_id: string;
          p_digest: string;
          p_operation_id: string;
          p_confirmed: boolean;
        };
        Returns: unknown;
      };

      import_upload: {
        Args: {
          p_organization_id: string;
          p_id: string;
          p_filename: string;
          p_source_digest: string;
          p_grid: unknown;
        };
        Returns: string;
      };
      import_preview: {
        Args: {
          p_organization_id: string;
          p_batch_id: string;
          p_id: string;
          p_mapping: unknown;
          p_resolutions: unknown;
        };
        Returns: string;
      };
      import_detail: {
        Args: { p_organization_id: string; p_batch_id: string };
        Returns: unknown;
      };

      schedule_visit_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: string;
      };
      schedule_snapshot: {
        Args: {
          p_organization_id: string;
          p_from: string;
          p_until: string;
          p_site_id?: string;
          p_member_id?: string;
          p_include_cancelled?: boolean;
        };
        Returns: unknown;
      };
      schedule_visit_detail: {
        Args: { p_organization_id: string; p_visit_id: string };
        Returns: unknown;
      };
      register_detail: {
        Args: {
          p_organization_id: string;
          p_kind: string;
          p_entity_id: string;
        };
        Returns: unknown;
      };
      register_command: {
        Args: {
          p_organization_id: string;
          p_entity_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: string;
      };
      offline_assignment_ids: {
        Args: { p_organization_id: string };
        Returns: string[];
      };
      field_recovery_context: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation: unknown;
          p_photo_ids: string[];
        };
        Returns: unknown;
      };
      reconcile_field_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation_id: string;
          p_previous_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: unknown;
      };
      replay_photo_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_attachment_id: string;
          p_kind: string;
          p_data: unknown;
        };
        Returns: unknown;
      };
      replay_field_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: unknown;
      };
      offline_visit_bundle: {
        Args: { p_organization_id: string; p_visit_id: string };
        Returns: unknown;
      };
      office_work_queue: { Args: { p_organization_id: string; p_filters?: unknown }; Returns: unknown };
      follow_up_list: { Args: { p_organization_id: string }; Returns: unknown };
      follow_up_command: {
        Args: {
          p_organization_id: string;
          p_action_id: string;
          p_operation_id: string;
          p_version: number;
          p_kind: string;
          p_data: unknown;
        };
        Returns: string;
      };
      return_visit_source: {
        Args: { p_organization_id: string; p_visit_id: string };
        Returns: unknown;
      };

      report_amendment: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: unknown;
      };
      amend_report: {
        Args: {
          p_organization_id: string;
          p_base_revision_id: string;
          p_operation_id: string;
          p_version: number;
          p_reason: string;
          p_items: unknown;
        };
        Returns: string;
      };
      acknowledge_report: {
        Args: {
          p_token: string;
          p_name: string;
          p_role: string;
          p_acknowledged: boolean;
        };
        Returns: unknown;
      };
      report_receipts: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: unknown;
      };
      create_report_link: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_operation_id: string;
          p_token_hash: string;
          p_ttl_days: number;
        };
        Returns: unknown;
      };
      revoke_report_link: {
        Args: { p_organization_id: string; p_link_id: string };
        Returns: undefined;
      };
      report_links: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: unknown;
      };
      guest_report: { Args: { p_token: string }; Returns: unknown };
      pdf_claim: { Args: { p_revision_id?: string }; Returns: unknown };
      pdf_heartbeat: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: undefined;
      };
      pdf_manifest: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_sha256: string;
          p_size: number;
          p_renderer: string;
        };
        Returns: undefined;
      };
      pdf_complete: {
        Args: { p_job_id: string; p_lease_token: string; p_sha256: string };
        Returns: undefined;
      };
      pdf_fail: {
        Args: { p_job_id: string; p_lease_token: string; p_error: string };
        Returns: undefined;
      };
      retry_report: {
        Args: {
          p_organization_id: string;
          p_revision_id: string;
          p_operation_id: string;
        };
        Returns: undefined;
      };
      report_preview: {
        Args: { p_organization_id: string; p_visit_id: string };
        Returns: unknown;
      };
      issue_report: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation_id: string;
          p_version: number;
        };
        Returns: string;
      };
      report_revision: {
        Args: { p_organization_id: string; p_revision_id: string };
        Returns: unknown;
      };
      report_list: { Args: { p_organization_id: string }; Returns: unknown };
      attachment_read: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_attachment_id?: string;
        };
        Returns: unknown;
      };
      attachment_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_attachment_id: string;
          p_kind: string;
          p_data: unknown;
        };
        Returns: string;
      };
      visit_bundle: {
        Args: { p_organization_id: string; p_visit_id: string };
        Returns: unknown;
      };
      visit_review_queue: {
        Args: { p_organization_id: string };
        Returns: unknown;
      };
      visit_command: {
        Args: {
          p_organization_id: string;
          p_visit_id: string;
          p_operation_id: string;
          p_kind: string;
          p_version: number;
          p_data: unknown;
        };
        Returns: string;
      };
      save_operation: {
        Args: {
          p_organization_id: string;
          p_operation_id: string;
          p_kind: string;
          p_data: unknown;
        };
        Returns: string;
      };
      operation_snapshot: {
        Args: { p_organization_id: string };
        Returns: unknown;
      };
      create_workspace: {
        Args: { p_operation_id: string; p_name: string; p_time_zone: string };
        Returns: string;
      };
      update_workspace: {
        Args: {
          p_organization_id: string;
          p_name: string;
          p_time_zone: string;
          p_version: number;
        };
        Returns: undefined;
      };
      create_workspace_invitation: {
        Args: {
          p_organization_id: string;
          p_operation_id: string;
          p_email: string;
          p_role: string;
          p_token_hash: string;
        };
        Returns: string;
      };
      lookup_workspace_invitation: {
        Args: { p_token_hash: string };
        Returns: {
          workspace_name: string;
          role: string;
          expires_at: string;
          accepted: boolean;
        }[];
      };
      accept_workspace_invitation: {
        Args: { p_token_hash: string };
        Returns: string;
      };
      revoke_workspace_invitation: {
        Args: { p_organization_id: string; p_invitation_id: string };
        Returns: undefined;
      };
      update_workspace_member: {
        Args: {
          p_organization_id: string;
          p_membership_id: string;
          p_role: string;
          p_active: boolean;
          p_version: number;
        };
        Returns: undefined;
      };
      workspace_roster: {
        Args: { p_organization_id: string };
        Returns: {
          membership_id: string;
          user_id: string;
          email: string;
          role: string;
          active: boolean;
          version: number;
        }[];
      };
      workspace_invitations: {
        Args: { p_organization_id: string };
        Returns: {
          id: string;
          email: string;
          role: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
