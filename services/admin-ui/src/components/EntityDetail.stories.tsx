import type { Meta, StoryObj } from "@storybook/react";
import { EntityDetail } from "./EntityDetail";

const meta: Meta<typeof EntityDetail> = {
  title: "Admin/EntityDetail",
  component: EntityDetail,
};
export default meta;

type Story = StoryObj<typeof EntityDetail>;

const base = {
  entity: {
    entity_id: "1e8f2173-e739-59ae-a873-f754d7f1bc3c",
    tenant: "default",
    source: "git",
    source_uri: "git://anthropic-cookbook/misc/prompt_caching.ipynb",
    title: "misc/prompt_caching.ipynb",
    classification: "internal",
    freshness_state: "fresh",
    updated_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    tombstoned_at: null,
    body: "# Prompt caching\n\nThis notebook walks through how prompt caching works...",
    content_hash: "abc123def456",
    metadata: { path: "misc/prompt_caching.ipynb", ext: ".ipynb", size: 4123 },
    source_revision: "abc",
    parent_entity_id: null,
    created_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    ingested_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    last_verified_at: new Date("2026-06-11T12:00:00Z").toISOString(),
    lineage: {
      parent: null,
      children: [
        { entity_id: "c1", title: "chunk 0", source_uri: "git://x#chunk=0" },
        { entity_id: "c2", title: "chunk 1", source_uri: "git://x#chunk=1" },
      ],
    },
    audit_appearances: [],
  },
  onTombstone: () => alert("tombstone"),
};

export const Default: Story = { args: base };

export const Empty: Story = {
  args: {
    entity: {
      ...base.entity,
      body: "",
      lineage: { parent: null, children: [] },
      metadata: {},
    },
  },
};

export const Tombstoned: Story = {
  args: {
    entity: {
      ...base.entity,
      tombstoned_at: new Date("2026-06-11T13:00:00Z").toISOString(),
    },
  },
};

export const Error: Story = {
  args: {
    entity: {
      ...base.entity,
      tombstoned_at: new Date("2026-06-11T13:00:00Z").toISOString(),
      audit_appearances: [
        {
          id: 42,
          created_at: new Date("2026-06-11T12:30:00Z").toISOString(),
          correlation_id: "failed-retrieval",
          tool: "retrieve_for_context",
          query: "failed request",
          outcome: "error",
        },
      ],
    },
  },
};
