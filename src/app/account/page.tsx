// src/app/account/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import prisma from "@/lib/prisma";
import AccountPageClient from "./ui/AccountPageClient";

type AccountPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function AccountPage(props: AccountPageProps) {
  const session = await getServerAuthSession();
  const sessionUser = session?.user as any | undefined;

  if (!sessionUser?.id) redirect("/sign-in");

  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id as string },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!me) {
    return (
      <section className="content-section">
        <header className="content-header">
          <h1>Edit profile</h1>
        </header>
        <p>We could not find your user record.</p>
      </section>
    );
  }

  const roleKeys: string[] = sessionUser.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");

  const sp = props.searchParams ? await props.searchParams : undefined;

  const requestedUserId = pickFirst(sp?.userId);
  const tempPassword = pickFirst(sp?.tempPassword);

  const [users, meta] = isAdmin
    ? await Promise.all([
        prisma.user.findMany({
          select: {
            id: true,
            firstName: true,
            lastName: true,
            organisation: { select: { name: true } },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        }),
        Promise.all([
          prisma.organisation.findMany({
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          prisma.role.findMany({
            select: { id: true, key: true, label: true },
            orderBy: { key: "asc" },
          }),
          prisma.membershipTier.findMany({
            select: { id: true, key: true, label: true, rank: true },
            orderBy: { rank: "asc" },
          }),
          prisma.app.findMany({
            select: { id: true, key: true, name: true },
            orderBy: { name: "asc" },
          }),
        ]).then(([organisations, roles, tiers, apps]) => ({
          organisations,
          roles,
          tiers,
          apps,
        })),
      ])
    : [null, null];

  const initialSelectedUserId = isAdmin && requestedUserId ? requestedUserId : me.id;

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Edit profile</h1>
        <p>Update your details. Admins can also edit other user profiles.</p>
      </header>

      <AccountPageClient
        me={me}
        isAdmin={isAdmin}
        initialSelectedUserId={initialSelectedUserId}
        initialTempPassword={isAdmin ? tempPassword ?? null : null}
        adminData={
          isAdmin && users && meta
            ? {
                users: users.map((u) => ({
                  id: u.id,
                  label: `${u.firstName} ${u.lastName} (${u.organisation?.name ?? "No organisation"})`,
                })),
                meta,
              }
            : null
        }
      />
    </section>
  );
}
