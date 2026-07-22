# scaffold
Welcome to the repository for all Alliances Platform web app development. Initial experimentation and learning by Daniel.

---

## Local database seed data

The Prisma seed script (`prisma/seed.ts`) creates local/preview demo data only. Do not use these credentials in production.

Seeded baseline roles:

- `ADMIN`
- `MEMBER`
- `STUDENT`
- `MODULE_LEADER`

Seeded demo role accounts:

| Role | Email | Password | Default app |
| --- | --- | --- | --- |
| Admin | `admin@alliances.example.com` | `admin-demo` | Membership Dashboard |
| Student | `student@ucl.example.com` | `student-demo` | Talent Discovery |
| Module Leader | `module.leader@ucl.example.com` | `module-demo` | IXN Workflow Manager |

Seeded partner member accounts:

| Organisation | Email | Password | Tier | Default app |
| --- | --- | --- | --- | --- |
| Chanel | `partnerships@chanel.example.com` | `chanel-demo` | Platinum | Membership Dashboard |
| Microsoft | `engage@microsoft.example.com` | `msft-demo` | Silver | Membership Dashboard |
| Google | `partnerships@google.example.com` | `google-demo` | Gold | Membership Dashboard |
| Amazon | `collab@amazon.example.com` | `amazon-demo` | Silver | Membership Dashboard |
| Meta | `labs@meta.example.com` | `meta-demo` | Silver | Membership Dashboard |
| Apple | `talent@apple.example.com` | `apple-demo` | Bronze | Membership Dashboard |
| Google DeepMind | `ai@deepmind.example.com` | `deepmind-demo` | Platinum | Membership Dashboard |
| Chubb | `innovation@chubb.example.com` | `chubb-demo` | Bronze | Membership Dashboard |
| Siemens | `partners@siemens.example.com` | `siemens-demo` | Gold | Membership Dashboard |
| BBC | `rdi@bbc.example.com` | `bbc-demo` | Silver | Membership Dashboard |

The partner accounts are seeded from `prisma/members.yml`, assigned the `MEMBER` role, and given active memberships plus membership dashboard projection rows.

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
