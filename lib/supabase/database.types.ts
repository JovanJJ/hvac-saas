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
