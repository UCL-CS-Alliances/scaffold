// src/components/account/UserProfileForm.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { signOut } from "next-auth/react";

type Meta = {
  organisations: { id: number; name: string }[];
  roles: { id: number; key: string; label: string }[];
  tiers: { id: number; key: string; label: string; rank: number }[];
  apps: { id: number; key: string; name: string }[];
};

type AppsMeta = { apps: { id: number; key: string; name: string }[] };

type Mode = "self-edit" | "admin-edit";

type PendingOrg = {
  clientId: string;
  name: string;
  type: "UNIVERSITY" | "INDUSTRY" | "OTHER";
};

type PendingRole = {
  clientId: string;
  key: string; // GENERATED
  label: string;
};

function makeClientId(prefix: string) {
  return `${prefix}:pending:${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

function labelToRoleKey(label: string) {
  const normalized = label
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  const underscored = normalized
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return underscored;
}

export default function UserProfileForm(props: {
  mode: Mode;
  meId: string;
  targetUserId: string;
  meta?: Meta; // admin-only meta
  appsMeta?: AppsMeta; // apps list for everyone
  initialSelf?: { id: string; email: string; firstName: string; lastName: string };
  initialTempPassword?: string;
}) {
  const { mode, meId, targetUserId, meta, appsMeta, initialSelf, initialTempPassword } = props;

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

  // Default app (visible to all)
  const [defaultAppId, setDefaultAppId] = useState<number | null>(null);
  const [defaultAppTouched, setDefaultAppTouched] = useState(false);

  // Tracks the last preset we auto-applied in this session
  const lastAppliedPresetAppIdRef = useRef<number | null>(null);

  // Admin-only selections
  const [organisationChoice, setOrganisationChoice] = useState<
    { kind: "existing"; id: number } | { kind: "pending"; clientId: string } | null
  >(null);

  const [roleChoices, setRoleChoices] = useState<
    Array<{ kind: "existing"; key: string } | { kind: "pending"; clientId: string }>
  >([]);

  // Membership (admin-only)
  const [membershipTierId, setMembershipTierId] = useState<number | null>(null);
  const [membershipStatus, setMembershipStatus] = useState<string>("active");
  const [membershipManagerName, setMembershipManagerName] = useState<string>("");
  const [membershipExpiryText, setMembershipExpiryText] = useState<string>(""); // dd/mm/yyyy

  // Pending additions (admin-only)
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [pendingRoles, setPendingRoles] = useState<PendingRole[]>([]);

  // Modals
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalName, setOrgModalName] = useState("");
  const [orgModalType, setOrgModalType] = useState<PendingOrg["type"]>("INDUSTRY");

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalLabel, setRoleModalLabel] = useState("");

  // Danger zone state
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNext, setPwNext] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [demoteConfirmOpen, setDemoteConfirmOpen] = useState(false);
  const [pendingSaveAfterDemoteConfirm, setPendingSaveAfterDemoteConfirm] = useState(false);

  const [resetBusy, setResetBusy] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(initialTempPassword ?? null);

  const organisationOptions = useMemo(() => {
    const db = meta?.organisations ?? [];
    const pending = pendingOrgs.map((o) => ({
      id: `pending:${o.clientId}`,
      label: `${o.name} (new)`,
    }));
    const dbMapped = db.map((o) => ({ id: `existing:${o.id}`, label: o.name }));
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

  const selectedRoleKeys = useMemo(() => {
    const out: string[] = [];
    for (const c of roleChoices) {
      if (c.kind === "existing") out.push(c.key);
      if (c.kind === "pending") {
        const pr = pendingRoles.find((r) => r.clientId === c.clientId);
        if (pr?.key) out.push(pr.key);
      }
    }
    return out;
  }, [roleChoices, pendingRoles]);

  const isMemberRoleSelected = useMemo(() => {
    return isAdmin ? selectedRoleKeys.includes("MEMBER") : false;
  }, [isAdmin, selectedRoleKeys]);

  const isAdminRoleChecked = useMemo(() => {
    if (!isAdmin) return false;
    return selectedRoleKeys.includes("ADMIN");
  }, [isAdmin, selectedRoleKeys]);

  // Stage 1: role → default app preset (only when exactly one mapped role selected)
  const presetDefaultAppId = useMemo(() => {
    if (!isAdmin) return null; // only admins can change roles in this UI
    if (!appsMeta?.apps?.length) return null;
    if (selectedRoleKeys.length !== 1) return null;

    const onlyRole = selectedRoleKeys[0];

    const roleToAppKey: Record<string, string> = {
      STUDENT: "TALENT_DISCOVERY",
      MEMBER: "MEMBERSHIP_DASHBOARD",
      MODULE_LEADER: "IXN_WORKFLOW_MANAGER",
    };

    const appKey = roleToAppKey[onlyRole];
    if (!appKey) return null;

    const app = appsMeta.apps.find((a) => a.key === appKey);
    return app?.id ?? null;
  }, [appsMeta, isAdmin, selectedRoleKeys]);

  // Role change wins: apply preset when (and only when) the preset changes.
  // This prevents "snapping back" after a manual change unless roles change.
  useEffect(() => {
    if (presetDefaultAppId === null) return;

    if (lastAppliedPresetAppIdRef.current === presetDefaultAppId) return;

    setDefaultAppId(presetDefaultAppId);
    lastAppliedPresetAppIdRef.current = presetDefaultAppId;
  }, [presetDefaultAppId]);

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

        setDefaultAppId(data.user.defaultAppId ?? null);
        setDefaultAppTouched(false);
        lastAppliedPresetAppIdRef.current = null;

        // Clear pending items when switching targets
        setPendingOrgs([]);
        setPendingRoles([]);

        setPwCurrent("");
        setPwNext("");
        setPwMessage(null);

        // Temp password only belongs to redirected user; keep if present, otherwise clear
        setTempPassword(initialTempPassword ?? null);

        if (isAdmin) {
          if (data.user.organisationId) {
            setOrganisationChoice({ kind: "existing", id: data.user.organisationId });
          } else {
            setOrganisationChoice(null);
          }

          const keys: string[] = data.user.roleKeys ?? [];
          setRoleChoices(keys.map((k) => ({ kind: "existing", key: k })));

          setMembershipTierId(data.membershipEdit?.membershipTierId ?? null);
          setMembershipStatus((data.membershipEdit?.status ?? "active") || "active");
          setMembershipManagerName(data.membershipEdit?.managerName ?? "");
          setMembershipExpiryText(data.membershipEdit?.expiryText ?? "");
        }
      } catch (e: any) {
        setMessage(e?.message ?? "Could not load user.");
      } finally {
        setLoading(false);
      }
    }

    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setOrganisationChoice({ kind: "existing", id: Number(optionId.replace("existing:", "")) });
      return;
    }
    setOrganisationChoice({ kind: "pending", clientId: optionId.replace("pending:", "") });
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
    setRoleModalLabel("");
    setRoleModalOpen(true);
  }

  function confirmAddRole() {
    const label = roleModalLabel.trim();
    if (!label) return;

    const key = labelToRoleKey(label);
    if (!key) return;

    // Prevent duplicates against existing + pending keys
    const existsInDb = (meta?.roles ?? []).some((r) => r.key === key);
    const existsPending = pendingRoles.some((r) => r.key === key);
    if (existsInDb || existsPending) {
      setMessage(`Role "${label}" maps to key "${key}", which already exists.`);
      setRoleModalOpen(false);
      return;
    }

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
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNext }),
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
          defaultAppId, // IMPORTANT: needed for non-admin updates too
        },
      };

      if (isAdmin) {
        const derivedIsActive = (membershipStatus || "active") !== "suspended";

        payload.admin = {
          organisationChoice,
          defaultAppId, // still okay to send
          roleChoices,
          pending: { organisations: pendingOrgs, roles: pendingRoles },
          membership: isMemberRoleSelected
            ? {
                membershipTierId,
                status: (membershipStatus || "active").trim() || "active",
                managerName: membershipManagerName.trim() || null,
                expiryText: membershipExpiryText.trim() || null,
                isActive: derivedIsActive,
              }
            : {
                membershipTierId: null,
                status: null,
                managerName: null,
                expiryText: null,
                isActive: true,
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

      setPendingOrgs([]);
      setPendingRoles([]);

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

  const canChangePassword = editingSelf;
  const nonAdminSelfDeleteAllowed = !isAdmin && editingSelf;

  return (
    <section className="auth-card">
      <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem" }}>
        {/* Fundamentals */}
        <div className="tile" style={{ padding: "0.95rem" }}>
          <h2 style={{ marginTop: 0 }}>Fundamentals</h2>

          <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem" }}>
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

            {/* Admin fundamentals */}
            {isAdmin && meta && (
              <>
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
                        <input
                          type="checkbox"
                          checked={roleChecked(r.key)}
                          onChange={() => toggleRole(r.key)}
                        />
                        <span>{r.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Membership (admin-only, only if MEMBER role selected) */}
        {isAdmin && meta && isMemberRoleSelected && (
          <div className="tile" style={{ padding: "0.95rem" }}>
            <h3 style={{ marginTop: 0 }}>Membership</h3>

            <div className="stack" style={{ ["--stack-gap" as any]: "0.85rem" }}>
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
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="managerName">
                  Client experience manager
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
            </div>
          </div>
        )}

        {/* Advanced settings (visible to all if appsMeta exists) */}
        {appsMeta?.apps?.length ? (
          <div className="tile tile--gradient" style={{ padding: "0.95rem" }}>
            <h3 style={{ marginTop: 0 }}>Advanced settings</h3>
            <p className="small" style={{ marginTop: "0.25rem" }}>
              Choose your default app after signing in.
            </p>

            <div className="auth-field">
              <label className="auth-label" htmlFor="defaultApp">
                Default app
              </label>
              <select
                id="defaultApp"
                className="auth-input"
                value={defaultAppId ?? ""}
                onChange={(e) => {
                  setDefaultAppTouched(true);
                  // lastAppliedPresetAppIdRef.current = null; // optional: not used in "role change wins" approach
                  setDefaultAppId(e.target.value ? Number(e.target.value) : null);
                }}
              >
                <option value="">—</option>
                {appsMeta.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {message && (
          <p role="status" className="small">
            {message}
          </p>
        )}

        <div className="auth-actions">
          <button
            type="button"
            className="button-link button-link--primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

        {/* Danger zone */}
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
            <div
              className="stack"
              style={{ ["--stack-gap" as any]: "0.85rem", marginTop: "1rem" }}
            >
              <h4 style={{ margin: "0.25rem 0" }}>Admin actions</h4>

              {/* Password section with Reset + Copy */}
              <div className="tile" style={{ padding: "0.75rem" }}>
                <div
                  className="cluster"
                  style={{ justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <strong>Temporary password</strong>
                    <p className="small" style={{ margin: 0 }}>
                      Generate a new temporary password for this user.
                    </p>
                  </div>

                  <div className="cluster" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="button-link"
                      onClick={() => void copyTempPassword()}
                      disabled={!tempPassword}
                      aria-disabled={!tempPassword}
                    >
                      Copy
                    </button>

                    <button
                      type="button"
                      className="button-link button-link--primary"
                      onClick={() => void resetPasswordForOtherUser()}
                      disabled={resetBusy}
                    >
                      {resetBusy ? "Working…" : "Reset"}
                    </button>
                  </div>
                </div>

                {tempPassword ? (
                  <div className="tile" style={{ padding: "0.75rem", marginTop: "0.75rem" }}>
                    <p style={{ marginTop: 0 }}>
                      <strong>Temporary password:</strong>{" "}
                      <span style={{ fontFamily: "var(--font-mono, monospace)" }}>
                        {tempPassword}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="small" style={{ marginTop: "0.75rem" }}>
                    No temporary password available yet. Use Reset to generate one.
                  </p>
                )}
              </div>

              {/* Suspend section (wired to membership.status) */}
              <div className="tile" style={{ padding: "0.75rem" }}>
                <div>
                  <strong>Suspend account</strong>
                  <p className="small" style={{ margin: 0 }}>
                    This sets the membership status field (for MEMBER users).
                  </p>
                </div>

                <div className="auth-field" style={{ marginTop: "0.75rem" }}>
                  <label className="auth-label" htmlFor="suspendStatus">
                    Status
                  </label>
                  <select
                    id="suspendStatus"
                    className="auth-input"
                    value={membershipStatus || "active"}
                    onChange={(e) => setMembershipStatus(e.target.value)}
                    disabled={!isMemberRoleSelected}
                    aria-disabled={!isMemberRoleSelected}
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                  {!isMemberRoleSelected && (
                    <p className="small" style={{ margin: 0 }}>
                      Enable the MEMBER role to manage membership status.
                    </p>
                  )}
                </div>
              </div>

              {/* Delete */}
              <div
                className="cluster"
                style={{ justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <strong>Delete account</strong>
                  <p className="small" style={{ margin: 0 }}>
                    Permanently removes the user from the database. This cannot be undone.
                  </p>
                </div>
                <button
                  type="button"
                  className="button-link button-link--secondary"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete user
                </button>
              </div>
            </div>
          )}

          {/* Non-admin self delete */}
          {nonAdminSelfDeleteAllowed && (
            <div
              className="stack"
              style={{ ["--stack-gap" as any]: "0.75rem", marginTop: "1rem" }}
            >
              <h4 style={{ margin: "0.25rem 0" }}>Delete account</h4>
              <p className="small" style={{ marginTop: 0 }}>
                This permanently removes your account and access. This cannot be undone.
              </p>

              <button
                type="button"
                className="button-link button-link--secondary"
                onClick={() => setDeleteOpen(true)}
              >
                Delete my account
              </button>
            </div>
          )}

          {/* Admin self: no delete */}
          {isAdmin && editingSelf && (
            <div
              className="stack"
              style={{ ["--stack-gap" as any]: "0.5rem", marginTop: "1rem" }}
            >
              <h4 style={{ margin: "0.25rem 0" }}>Delete account</h4>
              <p className="small" style={{ marginTop: 0 }}>
                Admin accounts cannot be deleted directly. To delete this account, first remove the
                ADMIN role and save changes. You will be signed out after demotion.
              </p>
            </div>
          )}
        </div>
      </div>

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
          You have unchecked the <strong>ADMIN</strong> role for your own account. This change
          requires confirmation.
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
        <p>
          {editingSelf
            ? "Are you sure you want to delete your account?"
            : "Are you sure you want to delete this user account?"}
        </p>

        <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
          <button type="button" className="button-link" onClick={() => setDeleteOpen(false)}>
            Cancel
          </button>

          <button
            type="button"
            className="button-link button-link--secondary"
            data-autofocus="true"
            onClick={() => void deleteAccountOrUser()}
            disabled={deleteBusy}
          >
            {deleteBusy ? "Working…" : "Confirm delete"}
          </button>
        </div>
      </Modal>

      {/* Add organisation modal */}
      <Modal
        title="Add organisation"
        description="Create a new organisation and select it."
        isOpen={orgModalOpen}
        onClose={() => setOrgModalOpen(false)}
        initialFocusSelector="#orgName"
      >
        <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="orgName">
              Organisation name
            </label>
            <input
              id="orgName"
              className="auth-input"
              value={orgModalName}
              onChange={(e) => setOrgModalName(e.target.value)}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="orgType">
              Type
            </label>
            <select
              id="orgType"
              className="auth-input"
              value={orgModalType}
              onChange={(e) => setOrgModalType(e.target.value as PendingOrg["type"])}
            >
              <option value="INDUSTRY">Industry</option>
              <option value="UNIVERSITY">University</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div className="auth-actions">
            <button type="button" className="button-link" onClick={() => setOrgModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button-link button-link--primary"
              onClick={confirmAddOrg}
            >
              Add organisation
            </button>
          </div>
        </div>
      </Modal>

      {/* Add role modal */}
      <Modal
        title="Add role"
        description="Enter a role label. The system will generate a role key automatically."
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        initialFocusSelector="#roleLabel"
      >
        <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="roleLabel">
              Role label
            </label>
            <input
              id="roleLabel"
              className="auth-input"
              value={roleModalLabel}
              onChange={(e) => setRoleModalLabel(e.target.value)}
              placeholder="e.g. Module leader"
            />
            <p className="small" style={{ margin: 0 }}>
              Role key preview: <strong>{labelToRoleKey(roleModalLabel || "—") || "—"}</strong>
            </p>
          </div>

          <div className="auth-actions">
            <button type="button" className="button-link" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="button-link button-link--primary"
              onClick={confirmAddRole}
            >
              Add role
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
