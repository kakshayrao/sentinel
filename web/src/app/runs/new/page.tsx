import { Suspense } from "react";

import { NewRunView } from "@/components/runs/new-run-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "New run" };

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewRunView />
    </Suspense>
  );
}
