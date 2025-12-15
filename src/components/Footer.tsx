// src/components/Footer.tsx
"use client";

import Link from "next/link";
import { siteMeta } from "@/content/siteMeta";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" role="contentinfo">
      <div className="footer-inner footer-grid">
        {/* Row 1: copyright centered */}
        <div className="footer-row footer-row--top">
          <p className="footer-copy">&copy; {year} UCL Computer Science</p>
        </div>

        {/* Row 2: links left, version right */}
        <div className="footer-row footer-row--bottom">
          <nav aria-label="Footer">
            <ul className="footer-links">
              <li>
                <a
                  href="https://github.com/ucl-cs-alliances"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GitHub
                </a>
              </li>
              <li>
                <Link href="/release-notes">Release notes</Link>
              </li>
            </ul>
          </nav>

          <div className="version">
            <Link href="/release-notes/all">
              Version {siteMeta.version} ({siteMeta.status})
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
