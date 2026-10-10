import { Suspense } from "react";

import { ModelsView } from "@/components/models/models-view";
import { PageSkeleton } from "@/components/states";

export const metadata = { title: "Models" };

export default function ModelsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ModelsView />
    </Suspense>
  );
}
