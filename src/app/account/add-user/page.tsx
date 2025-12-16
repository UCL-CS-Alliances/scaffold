// src/app/account/add-user/page.tsx
import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/getServerAuthSession";
import prisma from "@/lib/prisma";
import CreateUserForm from "@/components/account/CreateUserForm";

export default async function AddUserPage() {
  const session = await getServerAuthSession();
  const user = session?.user as any | undefined;
  if (!user) redirect("/sign-in");

  const roleKeys: string[] = user.roleKeys ?? [];
  const isAdmin = roleKeys.includes("ADMIN");
  if (!isAdmin) redirect("/access-denied?reason=access-denied");

  const [organisations, roles] = await Promise.all([
    prisma.organisation.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      select: { id: true, key: true, label: true },
      orderBy: { key: "asc" },
    }),
  ]);

  return (
    <section className="content-section">
      <header className="content-header">
        <h1>Add user</h1>
        <p>Create a new user profile.</p>
      </header>

      <CreateUserForm meta={{ organisations, roles }} />
    </section>
  );
}
