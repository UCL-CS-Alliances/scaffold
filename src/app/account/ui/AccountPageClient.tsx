// src/app/account/ui/AccountPageClient.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import UserProfileForm from "@/components/account/UserProfileForm";

type Me = { id: string; email: string; firstName: string; lastName: string };

type Meta = {
  organisations: { id: number; name: string }[];
  roles: { id: number; key: string; label: string }[];
  tiers: { id: number; key: string; label: string; rank: number }[];
  apps: { id: number; key: string; name: string }[];
  admins: { id: string; name: string }[];
};

type AppsMeta = { apps: { id: number; key: string; name: string }[] };

type AdminUser = {
  id: string;
  name: string;
  label: string;
  organisationId: number | null;
  organisationName: string | null;
};

export default function AccountPageClient(props: {
  me: Me;
  isAdmin: boolean;
  initialSelectedUserId: string;
  initialTempPassword: string | null;
  appsMeta: AppsMeta;
  adminData: null | { users: AdminUser[]; meta: Meta };
}) {
  const { me, isAdmin, adminData, initialSelectedUserId, initialTempPassword, appsMeta } = props;

  const router = useRouter();

  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
  const [tempPassword, setTempPassword] = useState<string | null>(initialTempPassword);
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);

  const selectedLabel = useMemo(() => {
    if (!adminData) return null;
    return adminData.users.find((u) => u.id === selectedUserId)?.label ?? null;
  }, [adminData, selectedUserId]);

  // Colleagues at one organisation belong together in the picker. Grouping keys
  // on organisationId and never on the name: Organisation.name has no unique
  // constraint and the admin "Add organisation" modal can create duplicates, so
  // grouping by name would silently merge two distinct legal entities.
  const userGroups = useMemo(() => {
    if (!adminData) return [];

    const byOrg = new Map<number, { label: string; users: AdminUser[] }>();
    const unassigned: AdminUser[] = [];

    for (const u of adminData.users) {
      if (u.organisationId == null) {
        unassigned.push(u);
        continue;
      }
      const group = byOrg.get(u.organisationId);
      if (group) group.users.push(u);
      else
        byOrg.set(u.organisationId, {
          label: u.organisationName ?? "Unnamed organisation",
          users: [u],
        });
    }

    const groups = [...byOrg.entries()]
      .map(([organisationId, group]) => ({ key: String(organisationId), ...group }))
      .sort((a, b) => a.label.localeCompare(b.label));

    if (unassigned.length) {
      groups.push({ key: "none", label: "No organisation", users: unassigned });
    }

    return groups;
  }, [adminData]);

  return (
    <>
      {isAdmin && adminData && (
        <section
          className="tile tile--gradient"
          style={{ padding: "1rem", marginBottom: "1rem" }}
        >
          <h2 style={{ marginTop: 0 }}>Whose profile do you want to edit?</h2>

          <div
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <p style={{ margin: 0, maxWidth: "60ch" }}>
              Select the user profile you would like to view and edit.
            </p>

            <label className="sr-only" htmlFor="userSelector">
              Select user
            </label>
            <select
              id="userSelector"
              className="auth-input"
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setTempPassword(null);
                setDeletedNotice(null);
              }}
              style={{ width: "min(28rem, 100%)" }}
            >
              {userGroups.map((group) => (
                <optgroup key={group.key} label={group.label}>
                  {group.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {deletedNotice && (
            <p role="status" className="small" style={{ marginTop: "0.75rem" }}>
              <strong>{deletedNotice}</strong>
            </p>
          )}

          {selectedLabel && (
            <p className="small" style={{ marginTop: "0.75rem" }}>
              Currently editing: <strong>{selectedLabel}</strong>
            </p>
          )}
        </section>
      )}

      <UserProfileForm
        mode={isAdmin ? "admin-edit" : "self-edit"}
        meId={me.id}
        targetUserId={isAdmin ? selectedUserId : me.id}
        meta={adminData?.meta}
        appsMeta={appsMeta}
        initialSelf={me}
        initialTempPassword={tempPassword ?? undefined}
        onUserDeleted={() => {
          // Name the user before dropping the selection — selectedLabel is
          // derived from it, and the refreshed list will no longer contain them.
          setDeletedNotice(`Deleted ${selectedLabel ?? "user"}.`);
          setSelectedUserId(me.id);
          setTempPassword(null);
          router.refresh();
        }}
      />
    </>
  );
}
