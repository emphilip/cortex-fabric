"use client";

import type { RelationshipType } from "@opencg/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelationshipTypeBadge } from "./RelationshipTypeBadge";

export function VocabRow({ item }: { item: RelationshipType }) {
  const router = useRouter();
  const [description, setDescription] = useState(item.description);
  async function save() {
    await fetch(`/api/proxy/graph/vocab/${item.name}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description }),
    });
    router.refresh();
  }
  async function deprecate() {
    await fetch(`/api/proxy/graph/vocab/${item.name}/deprecate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "admin deprecation" }),
    });
    router.refresh();
  }
  return (
    <div className="grid grid-cols-[160px_1fr_auto] items-center gap-3 border-b px-2 py-2.5 text-sm">
      <RelationshipTypeBadge type={item.name} />
      <Input aria-label={`${item.name} description`} value={description} onChange={(event) => setDescription(event.target.value)} className="h-8" />
      <span className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={save}>Save</Button>
        <Button size="sm" variant="destructive" onClick={deprecate}>Deprecate</Button>
      </span>
    </div>
  );
}
