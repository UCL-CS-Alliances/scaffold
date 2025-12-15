// src/components/account/UserProfileForm.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { signOut } from "next-auth/react";

type Meta = {
  organisations: { id: number; name: string }[];
  roles: { id: number; key: string; label: string }[];
  tiers: { id: number; key: string; label: string; rank: number }[];
  apps: { id: number; key: string; name: string }[];
};

type Mode = "self-edit" | "admin-edit";

type PendingOrg = {
  clientId: string;
  name: string;
  type: "UNIVERSITY" | "INDUSTRY" | "OTHER";
};

type PendingRole = {
  clientId: string;
  key: string; // will be uppercased client-side
  label: string;
};

function makeClientId(prefix: string) {
  return `${prefix}:pending:${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export default function UserProfileForm(props: {
  mode: Mode;
  meId: string;
  targetUserId: string;
  meta?: Meta; // only passed for admin mode
    initialSelf?: { id: string; email: string; firstName: string; lastName: string };
}) {
  const { mode, meId, targetUserId, meta, initialSelf } = props;

  const isAdmin = mode === "admin-edit";
  const editingSelf = targetUserId === meId;
  const adminEditingOther = isAdmin && !editingSelf;

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Core fields
  const [firstName, setFirstName] = useState(initialSelf?.firstName ?? "");
  const [lastName, setLastName] = useState(initialSelf?.lastName ?? "");
  const [email, setEmail] = useState(initialSelf?.email ?? "");

  // Admin additional info (existing selections)
  const [organisationChoice, setOrganisationChoice] = useState<
    { kind: "existing"; id: number } | { kind: "pending"; clientId: string } | null
  >(null);

  const [defaultAppId, setDefaultAppId] = useState<number | null>(null);

  const [roleChoices, setRoleChoices] = useState<
    Array<{ kind: "existing"; key: string } | { kind: "pending"; clientId: string }>
  >([]);

  // Single membership (admin-only)
  const [membershipTierId, setMembershipTierId] = useState<number | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string>("");
  const [membershipManagerName, setMembershipManagerName] = useState<string>("");
  const [membershipExpiryText, setMembershipExpiryText] = useState<string>(""); // dd/mm/yyyy
  const [membershipIsActive, setMembershipIsActive] = useState<boolean>(true);

  // Read-only membership summary (shown to everyone)
  const [membershipSummary, setMembershipSummary] = useState<null | {
    organisationName: string | null;
    tierLabel: string | null;
    status: string | null;
    expiryText: string | null;
    managerName: string | null;
    isActive: boolean | null;
  }>(null);

  // Pending additions (not written to DB until Save)
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [pendingRoles, setPendingRoles] = useState<PendingRole[]>([]);

  // Modals for pending org/role creation
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalName, setOrgModalName] = useState("");
  const [orgModalType, setOrgModalType] = useState<PendingOrg["type"]>("INDUSTRY");

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalKey, setRoleModalKey] = useState("");
  const [roleModalLabel, setRoleModalLabel] = useState("");

  // ─────────────────────────────────────────────
  // Danger zone state
  // ─────────────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);
  const [pendingSaveAfterDemoteConfirm, setPendingSaveAfterDemoteConfirm] = useState(false);

  const [resetBusy, setResetBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!isAdmin) return "Edit profile";
    return editingSelf ? "Edit profile" : "Edit user profile";
  }, [isAdmin, editingSelf]);

  // Combined lists for admin UI
  const organisationOptions = useMemo(() => {
    const db = meta?.organisations ?? [];
    const pending = pendingOrgs.map((o) => ({
      id: `pending:${o.clientId}`,
      label: `${o.name} (new)`,
    }));
    const dbMapped = db.map((o) => ({
      id: `existing:${o.id}`,
      label: o.name,
    }));
    return [...dbMapped, ...pending];
  }, [meta, pendingOrgs]);

  const roleOptions = useMemo(() => {
    const db = meta?.roles ?? [];
    const pending = pendingRoles.map((r) => ({
      key: `pending:${r.clientId}`,
      label: `${r.label} (${r.key}) (new)`,
    }));
    const dbMapped = db.map((r) => ({
      key: `existing:${r.key}`,
      label: `${r.label} (${r.key})`,
    }));
    return [...dbMapped, ...pending];
  }, [meta, pendingRoles]);

  // Is ADMIN role checked (in UI) — used for demotion confirmation
  const isAdminRoleChecked = useMemo(() => {
    if (!isAdmin) return false;
    return roleChoices.some((c) => c.kind === "existing" && c.key === "ADMIN");
  }, [isAdmin, roleChoices]);

  // Load data for target user
  useEffect(() => {
    async function load() {
      setMessage(null);
      setLoading(true);

      try {
        const qs = `?userId=${encodeURIComponent(targetUserId)}`;
        const r = await fetch(`/api/account/get-user${qs}`, { method: "GET" });
        if (!r.ok) throw new Error("Failed to load user.");

        const data = await r.json();

        setFirstName(data.user.firstName ?? "");
        setLastName(data.user.lastName ?? "");
        setEmail(data.user.email ?? "");
        setMembershipSummary(data.membershipSummary ?? null);

        // Reset in-progress pending items when switching users (safer)
        setPendingOrgs([]);
        setPendingRoles([]);
        setTempPassword(null);
        setPwCurrent("");
        setPwNext("");
        setPwMessage(null);

        if (isAdmin) {
          // existing organisation
          if (data.user.organisationId) {
            setOrganisationChoice({ kind: "existing", id: data.user.organisationId });
          } else {
            setOrganisationChoice(null);
          }

          setDefaultAppId(data.user.defaultAppId ?? null);

          // roles
          const keys: string[] = data.user.roleKeys ?? [];
          setRoleChoices(keys.map((k) => ({ kind: "existing", key: k })));

          // membership edit (single active)
          setMembershipTierId(data.membershipEdit?.membershipTierId ?? null);
          setMembershipStatus(data.membershipEdit?.status ?? "");
          setMembershipManagerName(data.membershipEdit?.managerName ?? "");
          setMembershipExpiryText(data.membershipEdit?.expiryText ?? "");
          setMembershipIsActive(data.membershipEdit?.isActive ?? true);
        }
      } catch (e: any) {
        setMessage(e?.message ?? "Could not load user.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [targetUserId, isAdmin]);

  function roleChecked(optionKey: string) {
    return roleChoices.some((c) => {
      if (c.kind === "existing") return `existing:${c.key}` === optionKey;
      return `pending:${c.clientId}` === optionKey;
    });
  }

  function toggleRole(optionKey: string) {
    setRoleChoices((prev) => {
      const exists = prev.some((c) => {
        if (c.kind === "existing") return `existing:${c.key}` === optionKey;
        return `pending:${c.clientId}` === optionKey;
      });

      if (exists) {
        return prev.filter((c) => {
          if (c.kind === "existing") return `existing:${c.key}` !== optionKey;
          return `pending:${c.clientId}` !== optionKey;
        });
      }

      if (optionKey.startsWith("existing:")) {
        const key = optionKey.replace("existing:", "");
        return [...prev, { kind: "existing", key }];
      }

      const clientId = optionKey.replace("pending:", "");
      return [...prev, { kind: "pending", clientId }];
    });
  }

  function setOrganisationFromOption(optionId: string) {
    if (!optionId) {
      setOrganisationChoice(null);
      return;
    }
    if (optionId.startsWith("existing:")) {
      const id = Number(optionId.replace("existing:", ""));
      setOrganisationChoice({ kind: "existing", id });
      return;
    }
    const clientId = optionId.replace("pending:", "");
    setOrganisationChoice({ kind: "pending", clientId });
  }

  function openAddOrg() {
    setOrgModalName("");
    setOrgModalType("INDUSTRY");
    setOrgModalOpen(true);
  }

  function confirmAddOrg() {
    const name = orgModalName.trim();
    if (!name) return;

    const clientId = makeClientId("org");
    const org: PendingOrg = { clientId, name, type: orgModalType };

    setPendingOrgs((prev) => [...prev, org]);
    setOrganisationChoice({ kind: "pending", clientId });

    setOrgModalOpen(false);
  }

  function openAddRole() {
    setRoleModalKey("");
    setRoleModalLabel("");
    setRoleModalOpen(true);
  }

  function confirmAddRole() {
    const key = roleModalKey.trim().toUpperCase();
    const label = roleModalLabel.trim();
    if (!key || !label) return;

    const clientId = makeClientId("role");
    const role: PendingRole = { clientId, key, label };

    setPendingRoles((prev) => [...prev, role]);
    setRoleChoices((prev) => [...prev, { kind: "pending", clientId }]);

    setRoleModalOpen(false);
  }

  async function changePassword() {
    setPwBusy(true);
    setPwMessage(null);
    setMessage(null);

    try {
      const r = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: pwCurrent,
          newPassword: pwNext,
        }),
      });

      const data = await r.json();
      if (!r.ok || !data.ok) {
        setPwMessage(data.error ?? "Could not change password.");
        return;
      }

      setPwCurrent("");
      setPwNext("");
      setPwMessage("Password updated.");
    } catch {
      setPwMessage("Could not change password.");
    } finally {
      setPwBusy(false);
    }
  }

  async function deleteAccountOrUser() {
    setDeleteBusy(true);
    setMessage(null);

    try {
      const r = await fetch("/api/account/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await r.json();
      if (!r.ok || !data.ok) {
        setMessage(data.error ?? "Could not delete account.");
        return;
      }

      if (editingSelf) {
        await signOut({ callbackUrl: "/" });
        return;
      }

      setDeleteOpen(false);
      setMessage("User deleted.");
    } catch {
      setMessage("Could not delete account.");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function resetPasswordForOtherUser() {
    setResetBusy(true);
    setTempPassword(null);
    setMessage(null);

    try {
      const r = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await r.json();
      if (!r.ok || !data.ok) {
        setMessage(data.error ?? "Could not reset password.");
        return;
      }

      setTempPassword(data.tempPassword);
      setMessage("Temporary password generated.");
    } catch {
      setMessage("Could not reset password.");
    } finally {
      setResetBusy(false);
    }
  }

  async function copyTempPassword() {
    if (!tempPassword) return;

    try {
      await navigator.clipboard.writeText(tempPassword);
      setMessage("Temporary password copied to clipboard.");
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }

  async function saveImpl() {
    setSaving(true);
    setMessage(null);

    try {
      const payload: any = {
        mode: isAdmin ? "admin-edit" : "self-edit",
        targetUserId,
        user: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
        },
      };

      if (isAdmin) {
        payload.admin = {
          organisationChoice,
          defaultAppId,
          roleChoices,
          pending: {
            organisations: pendingOrgs,
            roles: pendingRoles,
          },
          membership: {
            membershipTierId,
            status: membershipStatus.trim() || null,
            managerName: membershipManagerName.trim() || null,
            expiryText: membershipExpiryText.trim() || null,
            isActive: Boolean(membershipIsActive),
          },
        };
      }

      const r = await fetch("/api/account/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok || !data.ok) {
        setMessage(data.error ?? "Could not save changes.");
        return;
      }

      // Clear pending items after successful save
      setPendingOrgs([]);
      setPendingRoles([]);

      // If admin demoted themselves, sign out so session reflects new roles
      if (data.adminDemoted) {
        await signOut({ callbackUrl: "/sign-in" });
        return;
      }

      setMessage("Saved.");
    } catch {
      setMessage("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    // Admin demotion confirmation (admin editing their own profile)
    if (isAdmin && editingSelf) {
      const adminWillBeRemoved = !isAdminRoleChecked;
      if (adminWillBeRemoved) {
        setDemoteConfirmOpen(true);
        setPendingSaveAfterDemoteConfirm(true);
        return;
      }
    }

    await saveImpl();
  }

  if (loading) {
    return (
      <section className="auth-card">
        <p>Loading…</p>
      </section>
    );
  }

  // Permission rules for danger zone
  const canChangePassword = editingSelf; // self only (admins and non-admins)
  const nonAdminSelfDeleteAllowed = !isAdmin && editingSelf;

  return (
    <section className="auth-card">
      <header>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        <p className="small" style={{ marginTop: "0.25rem" }}>
          Email changes are validated and must be unique.
        </p>
      </header>

      <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem" }}>
        {/* Edit profile (common) */}
        <div className="auth-field">
          <label className="auth-label" htmlFor="firstName">
            First name
          </label>
          <input
            className="auth-input"
            id="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="lastName">
            Last name
          </label>
          <input
            className="auth-input"
            id="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label" htmlFor="email">
            Email
          </label>
          <input
            className="auth-input"
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {/* Membership summary (static for everyone) */}
        {membershipSummary && (
          <div className="tile" style={{ padding: "0.85rem" }}>
            <h3 style={{ marginTop: 0 }}>Membership summary</h3>
            <dl className="membership-meta">
              <div>
                <dt>Organisation</dt>
                <dd>{membershipSummary.organisationName ?? "—"}</dd>
              </div>
              <div>
                <dt>Tier</dt>
                <dd>{membershipSummary.tierLabel ?? "—"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{membershipSummary.status ?? "—"}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{membershipSummary.expiryText ?? "—"}</dd>
              </div>
              <div>
                <dt>Account manager</dt>
                <dd>{membershipSummary.managerName ?? "—"}</dd>
              </div>
            </dl>
          </div>
        )}

        {/* Additional information (admin-only) */}
        {isAdmin && meta && (
          <div className="tile tile--gradient" style={{ padding: "0.95rem" }}>
            <h3 style={{ marginTop: 0 }}>Additional information</h3>
            <p className="small" style={{ marginTop: "0.25rem" }}>
              Admin-only fields that affect access rules and routing.
            </p>

            <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem" }}>
              {/* Organisation */}
              <div className="auth-field">
                <label className="auth-label" htmlFor="org">
                  Organisation
                </label>
                <div className="cluster" style={{ alignItems: "center" }}>
                  <select
                    id="org"
                    className="auth-input"
                    value={
                      organisationChoice
                        ? organisationChoice.kind === "existing"
                          ? `existing:${organisationChoice.id}`
                          : `pending:${organisationChoice.clientId}`
                        : ""
                    }
                    onChange={(e) => setOrganisationFromOption(e.target.value)}
                  >
                    <option value="">—</option>
                    {organisationOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>

                  <button type="button" className="button-link" onClick={openAddOrg}>
                    Add
                  </button>
                </div>
              </div>

              {/* Roles */}
              <div className="auth-field">
                <div className="cluster" style={{ justifyContent: "space-between" }}>
                  <span className="auth-label">Roles</span>
                  <button type="button" className="button-link" onClick={openAddRole}>
                    Add role
                  </button>
                </div>

                <div className="tile" style={{ padding: "0.75rem" }}>
                  {roleOptions.map((r) => (
                    <label
                      key={r.key}
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                        padding: "0.25rem 0",
                      }}
                    >
                      <input type="checkbox" checked={roleChecked(r.key)} onChange={() => toggleRole(r.key)} />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Default app */}
              <div className="auth-field">
                <label className="auth-label" htmlFor="defaultApp">
                  Default app
                </label>
                <select
                  id="defaultApp"
                  className="auth-input"
                  value={defaultAppId ?? ""}
                  onChange={(e) => setDefaultAppId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">—</option>
                  {meta.apps.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.key})
                    </option>
                  ))}
                </select>
              </div>

              {/* Membership (single) */}
              <div className="tile" style={{ padding: "0.85rem" }}>
                <h4 style={{ marginTop: 0 }}>Membership (single)</h4>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="tier">
                    Membership tier
                  </label>
                  <select
                    id="tier"
                    className="auth-input"
                    value={membershipTierId ?? ""}
                    onChange={(e) => setMembershipTierId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">—</option>
                    {meta.tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} ({t.key})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="status">
                    Status
                  </label>
                  <input
                    id="status"
                    className="auth-input"
                    value={membershipStatus}
                    onChange={(e) => setMembershipStatus(e.target.value)}
                    placeholder="e.g. active"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="managerName">
                    Account manager name
                  </label>
                  <input
                    id="managerName"
                    className="auth-input"
                    value={membershipManagerName}
                    onChange={(e) => setMembershipManagerName(e.target.value)}
                    placeholder="Optional"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label" htmlFor="expiry">
                    Expiry (dd/mm/yyyy)
                  </label>
                  <input
                    id="expiry"
                    className="auth-input"
                    value={membershipExpiryText}
                    onChange={(e) => setMembershipExpiryText(e.target.value)}
                    placeholder="dd/mm/yyyy"
                    inputMode="numeric"
                    pattern="\\d{2}/\\d{2}/\\d{4}"
                    aria-describedby="expiryHint"
                  />
                  <span id="expiryHint" className="small">
                    Enter a date in dd/mm/yyyy format (e.g., 31/01/2026).
                  </span>
                </div>

                <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <input type="checkbox" checked={membershipIsActive} onChange={(e) => setMembershipIsActive(e.target.checked)} />
                  <span>Membership is active</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {message && (
          <p role="status" className="small">
            {message}
          </p>
        )}

        <div className="auth-actions">
          <button type="button" className="button-link button-link--primary" onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* ─────────────────────────────────────────────
            Danger zone
           ───────────────────────────────────────────── */}
        <div className="tile" style={{ padding: "0.95rem", borderColor: "#f0b4b4" }}>
          <h3 style={{ marginTop: 0 }}>Danger zone</h3>

          {/* Change password (self only) */}
          {canChangePassword && (
            <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
              <h4 style={{ margin: "0.25rem 0" }}>Change password</h4>

              <div className="auth-field">
                <label className="auth-label" htmlFor="currentPassword">
                  Current password
                </label>
                <input
                  id="currentPassword"
                  className="auth-input"
                  type="password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="newPassword">
                  New password
                </label>
                <input
                  id="newPassword"
                  className="auth-input"
                  type="password"
                  value={pwNext}
                  onChange={(e) => setPwNext(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="small" style={{ margin: 0 }}>
                  Minimum 8 characters.
                </p>
              </div>

              {pwMessage && (
                <p role="status" className="small">
                  {pwMessage}
                </p>
              )}

              <div className="auth-actions">
                <button
                  type="button"
                  className="button-link button-link--primary"
                  onClick={() => void changePassword()}
                  disabled={pwBusy}
                >
                  {pwBusy ? "Working…" : "Update password"}
                </button>
              </div>
            </div>
          )}

          {/* Admin editing other: reset password + suspend/delete */}
          {adminEditingOther && (
            <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem", marginTop: "1rem" }}>
              <h4 style={{ margin: "0.25rem 0" }}>Admin actions</h4>

              <div className="tile" style={{ padding: "0.75rem" }}>
                <div className="cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>Reset password</strong>
                    <p className="small" style={{ margin: 0 }}>
                      Generates a temporary password and stores it as a hashed value.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="button-link button-link--primary"
                    onClick={() => void resetPasswordForOtherUser()}
                    disabled={resetBusy}
                  >
                    {resetBusy ? "Working…" : "Generate"}
                  </button>
                </div>

                {tempPassword && (
                  <div className="tile" style={{ padding: "0.75rem", marginTop: "0.75rem" }}>
                    <p style={{ marginTop: 0 }}>
                      <strong>Temporary password:</strong>{" "}
                      <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{tempPassword}</span>
                    </p>
                    <button type="button" className="button-link" onClick={() => void copyTempPassword()}>
                      Copy to clipboard
                    </button>
                  </div>
                )}
              </div>

              <div className="cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>Suspend account</strong>
                  <p className="small" style={{ margin: 0 }}>
                    Coming soon.
                  </p>
                </div>
                <button type="button" className="button-link" aria-disabled="true" disabled>
                  Suspend (disabled)
                </button>
              </div>

              <div className="cluster" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong>Delete account</strong>
                  <p className="small" style={{ margin: 0 }}>
                    Permanently removes the user from the database. This cannot be undone.
                  </p>
                </div>
                <button type="button" className="button-link button-link--secondary" onClick={() => setDeleteOpen(true)}>
                  Delete user
                </button>
              </div>
            </div>
          )}

          {/* Non-admin self delete */}
          {nonAdminSelfDeleteAllowed && (
            <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem", marginTop: "1rem" }}>
              <h4 style={{ margin: "0.25rem 0" }}>Delete account</h4>
              <p className="small" style={{ marginTop: 0 }}>
                This permanently removes your account and access. This cannot be undone.
              </p>

              <button type="button" className="button-link button-link--secondary" onClick={() => setDeleteOpen(true)}>
                Delete my account
              </button>
            </div>
          )}

          {/* Admin self: no delete */}
          {isAdmin && editingSelf && (
            <div className="stack" style={{ ["--stack-gap" as any]: "0.5rem", marginTop: "1rem" }}>
              <h4 style={{ margin: "0.25rem 0" }}>Delete account</h4>
              <p className="small" style={{ marginTop: 0 }}>
                Admin accounts cannot be deleted directly. To delete this account, first remove the ADMIN role and save
                changes. You will be signed out after demotion.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────
          Modals
         ───────────────────────────────────────────── */}

      {/* Admin demotion confirmation modal */}
      <Modal
        title="Confirm admin demotion"
        description="Removing your ADMIN role will restrict your access. You will be signed out after saving, and must sign in again."
        isOpen={demoteConfirmOpen}
        onClose={() => {
          setDemoteConfirmOpen(false);
          setPendingSaveAfterDemoteConfirm(false);
        }}
        initialFocusSelector='button[data-autofocus="true"]'
      >
        <p>
          You have unchecked the <strong>ADMIN</strong> role for your own account. This change requires confirmation.
        </p>

        <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            className="button-link"
            onClick={() => {
              setDemoteConfirmOpen(false);
              setPendingSaveAfterDemoteConfirm(false);
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            className="button-link button-link--primary"
            data-autofocus="true"
            onClick={() => {
              setDemoteConfirmOpen(false);
              if (pendingSaveAfterDemoteConfirm) {
                setPendingSaveAfterDemoteConfirm(false);
                void saveImpl();
              }
            }}
          >
            I confirm, demote my account
          </button>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        title="Confirm deletion"
        description="This action cannot be undone."
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        initialFocusSelector='button[data-autofocus="true"]'
      >
        <p>{editingSelf ? "Are you sure you want to delete your account?" : "Are you sure you want to delete this user account?"}</p>

        <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="button-link" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>
          <button
            type="button"
            className="button-link button-link--primary"
            data-autofocus="true"
            onClick={() => void deleteAccountOrUser()}
            disabled={deleteBusy}
          >
            {deleteBusy ? "Deleting…" : "I confirm, delete"}
          </button>
        </div>
      </Modal>

      {/* Pending-only modals (no DB writes) */}
      {orgModalOpen && (
        <Modal title="Add organisation" isOpen={orgModalOpen} onClose={() => setOrgModalOpen(false)} initialFocusSelector="#newOrgName">
          <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="newOrgName">
                Organisation name
              </label>
              <input
                id="newOrgName"
                className="auth-input"
                value={orgModalName}
                onChange={(e) => setOrgModalName(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="newOrgType">
                Type
              </label>
              <select
                id="newOrgType"
                className="auth-input"
                value={orgModalType}
                onChange={(e) => setOrgModalType(e.target.value as PendingOrg["type"])}
              >
                <option value="UNIVERSITY">UNIVERSITY</option>
                <option value="INDUSTRY">INDUSTRY</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            <div className="auth-actions">
              <button type="button" className="button-link" onClick={() => setOrgModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="button-link button-link--primary" onClick={confirmAddOrg}>
                Add
              </button>
            </div>
          </div>
        </Modal>
      )}

      {roleModalOpen && (
        <Modal title="Add role" isOpen={roleModalOpen} onClose={() => setRoleModalOpen(false)} initialFocusSelector="#newRoleKey">
          <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="newRoleKey">
                Role key
              </label>
              <input
                id="newRoleKey"
                className="auth-input"
                value={roleModalKey}
                onChange={(e) => setRoleModalKey(e.target.value)}
                placeholder="e.g. ADMIN"
              />
              <p className="small" style={{ margin: 0 }}>
                Uppercase letters, numbers, and underscores recommended.
              </p>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="newRoleLabel">
                Role label
              </label>
              <input
                id="newRoleLabel"
                className="auth-input"
                value={roleModalLabel}
                onChange={(e) => setRoleModalLabel(e.target.value)}
                placeholder="e.g. Administrator"
              />
            </div>

            <div className="auth-actions">
              <button type="button" className="button-link" onClick={() => setRoleModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="button-link button-link--primary" onClick={confirmAddRole}>
                Add
              </button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
