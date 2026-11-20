import type { Metadata } from "next";
import { pageShareMeta } from "@/lib/eshop/shareMeta";
import { notFound } from "next/navigation";
import LandingPageView from "@/components/eshop/LandingPageView";
import { findLandingPage } from "@/lib/eshop/landingPages";

const page = findLandingPage("/polevky-pro-kavarny");

export const metadata: Metadata = page ? { title: page.title, description: page.description, alternates: { canonical: page.path }, ...pageShareMeta(page.title, page.description, page.path) } : {};

export default function Page() {
  if (!page) notFound();
  return <LandingPageView page={page} />;
}
