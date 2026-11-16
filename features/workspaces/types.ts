export type MutationState = {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
  invitationUrl?: string;
};
export const initialMutationState: MutationState = { status: "idle" };
