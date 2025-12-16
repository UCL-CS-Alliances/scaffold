// src/app/account/ui/AccountPageClient.tsx
"use client";

import { useMemo, useState } from "react";
import UserProfileForm from "@/components/account/UserProfileForm";

type Me = { id: string; email: string; firstName: string; lastName: string };

type Meta = {
  organisations: { id: number; name: string }[];
  roles: { id: number; key: string; label: string }[];
  tiers: { id: number; key: string; label: string; rank: number }[];
  apps: { id: number; key: string; name: string }[];
};

export default function AccountPageClient(props: {
  me: Me;
  isAdmin: boolean;
  initialSelectedUserId: string;
  initialTempPassword: string | null;
  adminData: null | { users: { id: string; label: string }[]; meta: Meta };
}) {
  const { me, isAdmin, adminData, initialSelectedUserId, initialTempPassword } = props;

  const [selectedUserId, setSelectedUserId] = useState(initialSelectedUserId);
  const [tempPassword, setTempPassword] = useState<string | null>(initialTempPassword);

  const selectedLabel = useMemo(() => {
    if (!adminData) return null;
    return adminData.users.find((u) => u.id === selectedUserId)?.label ?? null;
  }, [adminData, selectedUserId]);

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
                // If the admin switches users manually, drop the temp password (it belonged to the redirected user).
                setTempPassword(null);
              }}
              style={{ width: "min(28rem, 100%)" }}
            >
              {adminData.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

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
        meta={adminData?.meta ?? undefined}
        initialSelf={me}
        initialTempPassword={tempPassword ?? undefined}
      />
    </>
  );
}
