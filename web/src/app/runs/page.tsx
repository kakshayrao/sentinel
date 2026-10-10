import { Suspense } from "react";

import { RunsView } from "@/components/runs/runs-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Runs" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RunsView />
    </Suspense>
  );
}
