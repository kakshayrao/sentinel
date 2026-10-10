import { Suspense } from "react";

import { RunDetail } from "@/components/runs/run-detail";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Run" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RunDetail />
    </Suspense>
  );
}
