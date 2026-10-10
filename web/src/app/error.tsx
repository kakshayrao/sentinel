"use client";

import { TriangleAlertIcon } from "lucide-react";

import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6">
      <EmptyState icon={<TriangleAlertIcon />} title="Something went wrong" description={error.message || "An unexpected error occurred."}>
        <Button onClick={() => retry()}>Try again</Button>
      </EmptyState>
    </div>
  );
}
