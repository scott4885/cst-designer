import { redirect } from "next/navigation";

/**
 * /offices — canonical "Offices" list route.
 *
 * The office list lives on "/" (the dashboard). Users (and bookmarks) that
 * expect "/offices" would otherwise hit a Next.js 404. This page redirects to
 * "/" so the sidebar "Offices" item and any /offices URLs resolve cleanly.
 *
 * QA: closes D-P0-2 from Phase 4 visual-defect register.
 */
export default function OfficesIndexPage() {
  redirect("/");
}
