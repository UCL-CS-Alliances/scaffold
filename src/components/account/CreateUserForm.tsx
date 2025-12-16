// src/components/account/CreateUserForm.tsx
"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useRouter } from "next/navigation";

type Meta = {
  organisations: { id: number; name: string }[];
  roles: { id: number; key: string; label: string }[];
};

type PendingOrg = {
  clientId: string;
  name: string;
  type: "UNIVERSITY" | "INDUSTRY" | "OTHER";
};

type PendingRole = {
  clientId: string;
  key: string; // uppercased client-side
  label: string;
};

function makeClientId(prefix: string) {
  return `${prefix}:pending:${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

export default function CreateUserForm(props: { meta: Meta }) {
  const { meta } = props;
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Core fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  // Admin selections
  const [organisationChoice, setOrganisationChoice] = useState<
    { kind: "existing"; id: number } | { kind: "pending"; clientId: string } | null
  >(null);

  const [roleChoices, setRoleChoices] = useState<
    Array<{ kind: "existing"; key: string } | { kind: "pending"; clientId: string }>
  >([]);

  // Pending additions (created on save via update-user)
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrg[]>([]);
  const [pendingRoles, setPendingRoles] = useState<PendingRole[]>([]);

  // Modals
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgModalName, setOrgModalName] = useState("");
  const [orgModalType, setOrgModalType] = useState<PendingOrg["type"]>("INDUSTRY");

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [roleModalKey, setRoleModalKey] = useState("");
  const [roleModalLabel, setRoleModalLabel] = useState("");

  const organisationOptions = useMemo(() => {
    const dbMapped = meta.organisations.map((o) => ({
      id: `existing:${o.id}`,
      label: o.name,
    }));
    const pending = pendingOrgs.map((o) => ({
      id: `pending:${o.clientId}`,
      label: `${o.name} (new)`,
    }));
    return [...dbMapped, ...pending];
  }, [meta.organisations, pendingOrgs]);

  const roleOptions = useMemo(() => {
    const dbMapped = meta.roles.map((r) => ({
      key: `existing:${r.key}`,
      label: `${r.label} (${r.key})`,
    }));
    const pending = pendingRoles.map((r) => ({
      key: `pending:${r.clientId}`,
      label: `${r.label} (${r.key}) (new)`,
    }));
    return [...dbMapped, ...pending];
  }, [meta.roles, pendingRoles]);

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

  async function save() {
    setSaving(true);
    setMessage(null);

    try {
      // 1) Create user (server generates temp password)
      const r1 = await fetch("/api/account/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });

      const data1 = await r1.json();
      if (!r1.ok || !data1.ok) {
        setMessage(data1.error ?? "Could not create user.");
        return;
      }

      const newUserId = String(data1.userId ?? "");
      const tempPassword = String(data1.tempPassword ?? "");
      if (!newUserId) {
        setMessage("User created, but no user ID was returned.");
        return;
      }

      // 2) Immediately set org/roles via update-user
      const r2 = await fetch("/api/account/update-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "admin-edit",
          targetUserId: newUserId,
          user: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
          },
          admin: {
            organisationChoice,
            defaultAppId: null,
            roleChoices,
            pending: {
              organisations: pendingOrgs,
              roles: pendingRoles,
            },
            // no membership assignment on create (handled on edit page)
            membership: {
              membershipTierId: null,
              status: null,
              managerName: null,
              expiryText: null,
              isActive: true,
            },
          },
        }),
      });

      const data2 = await r2.json();
      if (!r2.ok || !data2.ok) {
        setMessage(data2.error ?? "User created, but could not apply organisation/roles.");
        return;
      }

      // 3) Redirect to edit profile with newly created user selected + temp password shown once
      const qs = new URLSearchParams({
        userId: newUserId,
      });

      // tempPassword can be empty if server chose not to return it for any reason
      if (tempPassword) qs.set("tempPassword", tempPassword);

      router.push(`/account?${qs.toString()}`);
    } catch {
      setMessage("Could not create user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="auth-card">
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
                style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.25rem 0" }}
              >
                <input type="checkbox" checked={roleChecked(r.key)} onChange={() => toggleRole(r.key)} />
                <span>{r.label}</span>
              </label>
            ))}
          </div>
        </div>

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
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </div>

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
            <button type="button" className="button-link button-link--primary" onClick={confirmAddOrg}>
              Add organisation
            </button>
          </div>
        </div>
      </Modal>

      {/* Add role modal */}
      <Modal
        title="Add role"
        description="Create a new role and select it."
        isOpen={roleModalOpen}
        onClose={() => setRoleModalOpen(false)}
        initialFocusSelector="#roleKey"
      >
        <div className="stack" style={{ ["--stack-gap" as any]: "0.75rem" }}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="roleKey">
              Role key
            </label>
            <input
              id="roleKey"
              className="auth-input"
              value={roleModalKey}
              onChange={(e) => setRoleModalKey(e.target.value)}
              placeholder="e.g. MEMBER"
            />
            <p className="small" style={{ margin: 0 }}>
              Use uppercase letters, numbers, and underscores.
            </p>
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="roleLabel">
              Role label
            </label>
            <input
              id="roleLabel"
              className="auth-input"
              value={roleModalLabel}
              onChange={(e) => setRoleModalLabel(e.target.value)}
              placeholder="e.g. Member"
            />
          </div>

          <div className="auth-actions">
            <button type="button" className="button-link" onClick={() => setRoleModalOpen(false)}>
              Cancel
            </button>
            <button type="button" className="button-link button-link--primary" onClick={confirmAddRole}>
              Add role
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
