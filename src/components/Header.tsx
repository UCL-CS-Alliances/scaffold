// src/components/Header.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { siteAnnouncement } from "@/content/siteMeta";
import { getServicesForAudience } from "@/content/services";

type MenuState = {
  students: boolean;
  researchers: boolean;
  partners: boolean;
  account: boolean;
};

export default function Header() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated";
  const user = session?.user;

const roleKeys = ((user as any)?.roleKeys ?? []) as string[];
const isAdmin = roleKeys.includes("ADMIN");

  const studentsServices = getServicesForAudience("students");
  const researchersServices = getServicesForAudience("researchers");
  const partnersServices = getServicesForAudience("partners");

  const [open, setOpen] = useState<MenuState>({
    students: false,
    researchers: false,
    partners: false,
    account: false,
  });

  function toggleMenu(key: keyof MenuState) {
    setOpen((prev) => ({
      students: false,
      researchers: false,
      partners: false,
      account: false,
      [key]: !prev[key],
    }));
  }

  function closeAllMenus() {
    setOpen({
      students: false,
      researchers: false,
      partners: false,
      account: false,
    });
  }

  // Close any open menu when Escape is pressed (keyboard accessibility)
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Esc") {
        closeAllMenus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="banner" role="banner">
      <div className="banner-top">
        <a
          className="logo"
          href="https://www.ucl.ac.uk/engineering/computer-science"
        >
          <img
            src="/images/UCL-Computer-Science-logo.jpg"
            alt="UCL Computer Science"
          />
        </a>
        <div className="team-name">ALLIANCES</div>
        <div className="announce-wrap">
          {siteAnnouncement.enabled && siteAnnouncement.text && (
            <div
              className="lcd-announcement"
              role="status"
              aria-live="polite"
            >
              <div className="lcd-text">{siteAnnouncement.text}</div>
              {siteAnnouncement.ctaLabel && siteAnnouncement.ctaHref && (
                <Link
                  className="btn btn--primary lcd-cta"
                  href={siteAnnouncement.ctaHref}
                >
                  {siteAnnouncement.ctaLabel}
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="banner-nav" onMouseLeave={closeAllMenus}>
        <nav className="nav-bar" aria-label="Primary">
          <ul className="nav-root" role="menubar">
            {/* Home */}
            <li className="nav-item" role="none">
              <Link
                className="nav-link"
                href="/"
                role="menuitem"
                aria-current={pathname === "/" ? "page" : undefined}
              >
                Home
              </Link>
            </li>

            {/* For students */}
            <li className="nav-item has-submenu" role="none">
              <button
                className="menu-button"
                id="btn-students"
                aria-haspopup="true"
                aria-expanded={open.students}
                aria-controls="menu-students"
                onClick={() => toggleMenu("students")}
              >
                For students
              </button>
              <ul
                className="menu-panel"
                id="menu-students"
                role="menu"
                aria-labelledby="btn-students"
                hidden={!open.students}
              >
                {studentsServices.map((svc) => {
                  const label = svc.navLabel ?? svc.title;

                  if (!svc.navActive) {
                    return (
                      <li key={svc.slug} role="none">
                        <span
                          role="menuitem"
                          className="nav-link disabled"
                          aria-disabled="true"
                          tabIndex={-1}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={svc.slug} role="none">
                      <Link
                        role="menuitem"
                        className="nav-link"
                        href={`/services/${svc.slug}`}
                        onClick={closeAllMenus}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {/* For researchers */}
            <li className="nav-item has-submenu" role="none">
              <button
                className="menu-button"
                id="btn-researchers"
                aria-haspopup="true"
                aria-expanded={open.researchers}
                aria-controls="menu-researchers"
                onClick={() => toggleMenu("researchers")}
              >
                For researchers
              </button>
              <ul
                className="menu-panel"
                id="menu-researchers"
                role="menu"
                aria-labelledby="btn-researchers"
                hidden={!open.researchers}
              >
                {researchersServices.map((svc) => {
                  const label = svc.navLabel ?? svc.title;

                  if (!svc.navActive) {
                    return (
                      <li key={svc.slug} role="none">
                        <span
                          role="menuitem"
                          className="nav-link disabled"
                          aria-disabled="true"
                          tabIndex={-1}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={svc.slug} role="none">
                      <Link
                        role="menuitem"
                        className="nav-link"
                        href={`/services/${svc.slug}`}
                        onClick={closeAllMenus}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {/* For partners */}
            <li className="nav-item has-submenu" role="none">
              <button
                className="menu-button"
                id="btn-partners"
                aria-haspopup="true"
                aria-expanded={open.partners}
                aria-controls="menu-partners"
                onClick={() => toggleMenu("partners")}
              >
                For partners
              </button>
              <ul
                className="menu-panel"
                id="menu-partners"
                role="menu"
                aria-labelledby="btn-partners"
                hidden={!open.partners}
              >
                {partnersServices.map((svc) => {
                  const label = svc.navLabel ?? svc.title;

                  if (!svc.navActive) {
                    return (
                      <li key={svc.slug} role="none">
                        <span
                          role="menuitem"
                          className="nav-link disabled"
                          aria-disabled="true"
                          tabIndex={-1}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={svc.slug} role="none">
                      <Link
                        role="menuitem"
                        className="nav-link"
                        href={`/services/${svc.slug}`}
                        onClick={closeAllMenus}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {/* Account / Sign in */}
            {isAuthenticated ? (
              <li className="nav-item has-submenu" role="none">
                <button
                  className="menu-button"
                  id="btn-account"
                  aria-haspopup="true"
                  aria-expanded={open.account}
                  aria-controls="menu-account"
                  onClick={() => toggleMenu("account")}
                >
                  Account
                </button>
                <ul
                  className="menu-panel"
                  id="menu-account"
                  role="menu"
                  aria-labelledby="btn-account"
                  hidden={!open.account}
                >
                  <li role="none">
                    <span
                      className="nav-link"
                      role="menuitem"
                      aria-disabled="true"
                    >
                      You are signed in as{" "}
                      {user?.name ?? user?.email ?? "Alliances user"}
                    </span>
                  </li>
{isAdmin && (
  <li role="none">
    <Link
      className="nav-link"
      role="menuitem"
      href="/account/add-user"
      onClick={closeAllMenus}
    >
      Add user
    </Link>
  </li>
)}

<li role="none">
  <Link
    className="nav-link"
    role="menuitem"
    href="/account"
    onClick={closeAllMenus}
  >
    Edit profile
  </Link>
</li>
                  <li role="none">
                  <button
                    type="button"
                    className="nav-link"
                    role="menuitem"
                    onClick={() => {
                      closeAllMenus();
                      signOut();
                    }}
                  >
                    Sign out
                  </button>
                  </li>
                </ul>
              </li>
            ) : (
              <li className="nav-item" role="none">
                <Link
                  className="nav-link"
                  href="/sign-in"
                  role="menuitem"
                  aria-current={pathname === "/sign-in" ? "page" : undefined}
                >
                  Sign in
                </Link>
              </li>
            )}

            {/* Contact */}
            <li className="nav-item" role="none">
              <Link
                className="nav-link"
                href="/contact"
                role="menuitem"
                aria-current={pathname === "/contact" ? "page" : undefined}
              >
                Contact us
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
