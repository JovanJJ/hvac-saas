import {
  StaffPage,
  type StaffContext,
} from "@/features/workspaces/staff-shell";
import {
  newInvitation,
  ownerInvitations,
  ownerRoster,
} from "@/features/workspaces/dal";
import {
  InvitationForm,
  MemberForm,
  RevokeInvitationForm,
} from "@/features/workspaces/forms";
import type { StaffRole } from "@/lib/supabase/database.types";
import { roleLabels } from "@/features/workspaces/validation";
async function TeamContent({ context }: { context: StaffContext }) {
  const organizationId = context.workspace.organization.id;
  const [members, invitations] = await Promise.all([
    ownerRoster(organizationId),
    ownerInvitations(organizationId),
  ]);
  return (
    <>
      <h1>Tim i pozivi</h1>
      <section className="card mt-6">
        <h2>Pozovi novu osobu</h2>
        <p className="text-sm text-[#60716c]">
          Poziv važi sedam dana. Prosledite link osobi čiju adresu unesete.
        </p>
        <InvitationForm organizationId={organizationId} {...newInvitation()} />
      </section>
      <section className="mt-8">
        <h2>Članovi tima</h2>
        <div className="mt-4 grid gap-4">
          {members.map((member) => (
            <article key={member.membership_id} className="card">
              <h3 className="break-all">{member.email}</h3>
              <p>
                {roleLabels[member.role as StaffRole]} ·{" "}
                {member.active ? "Aktivno" : "Opozvano"}
              </p>
              <MemberForm organizationId={organizationId} member={member} />
            </article>
          ))}
        </div>
      </section>
      <section className="mt-8">
        <h2>Pozivi</h2>
        {!invitations.length && <p className="mt-4">Još nema poziva.</p>}
        <div className="mt-4 grid gap-4">
          {invitations.map((invitation) => (
            <article className="card" key={invitation.id}>
              <h3 className="break-all">{invitation.email}</h3>
              <p>
                {roleLabels[invitation.role as StaffRole]} ·{" "}
                {invitation.revoked_at
                  ? "Link opozvan"
                  : invitation.accepted_at
                    ? "Prihvaćen"
                    : invitation.expired
                      ? "Istekao"
                      : "Čeka prihvatanje"}
              </p>
              <p className="text-sm">
                Važi do:{" "}
                {new Date(invitation.expires_at).toLocaleString("sr-Latn-RS", {
                  timeZone: context.workspace.organization.time_zone,
                })}
              </p>
              {!invitation.revoked_at && (
                <RevokeInvitationForm
                  organizationId={organizationId}
                  invitationId={invitation.id}
                />
              )}
              {!invitation.accepted_at && (
                <div className="mt-4 border-t border-[#dce4df] pt-4">
                  <InvitationForm
                    organizationId={organizationId}
                    email={invitation.email}
                    role={invitation.role as StaffRole}
                    {...newInvitation()}
                  />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
export default function TeamPage() {
  return (
    <StaffPage path="/settings/team" roles={["owner"]}>
      {(context) => <TeamContent context={context} />}
    </StaffPage>
  );
}

export const metadata = { title: "Tim i pozivi" };
