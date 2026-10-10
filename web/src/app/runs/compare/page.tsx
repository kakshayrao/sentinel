import { Suspense } from "react";

import { CompareView } from "@/components/runs/compare-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Compare runs" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CompareView />
    </Suspense>
  );
}
