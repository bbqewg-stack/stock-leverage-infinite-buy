"use client";

import dynamic from "next/dynamic";

const InfiniteBuyCalculator = dynamic(
  () => import("@/components/InfiniteBuyCalculator"),
  { ssr: false }
);

export default function Home() {
  return <InfiniteBuyCalculator />;
}
