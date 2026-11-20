import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPageView from "@/components/eshop/LandingPageView";
import { findLandingPage } from "@/lib/eshop/landingPages";

const page = findLandingPage("/veganske-polevky");

export const metadata: Metadata = page ? { title: page.title, description: page.description, alternates: { canonical: page.path } } : {};

export default function Page() {
  if (!page) notFound();
  return <LandingPageView page={page} />;
}
