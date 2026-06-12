import type { Meta, StoryObj } from "@storybook/react";
import { EntityRow } from "./EntityRow";

const meta: Meta<typeof EntityRow> = {
  title: "Admin/EntityRow",
  component: EntityRow,
};
export default meta;

type Story = StoryObj<typeof EntityRow>;

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
  },
};

export const Fresh: Story = { args: base };

export const Stale: Story = {
  args: { entity: { ...base.entity, freshness_state: "stale" } },
};

export const Tombstoned: Story = {
  args: {
    entity: {
      ...base.entity,
      tombstoned_at: new Date("2026-06-11T13:00:00Z").toISOString(),
    },
  },
};

export const NoTitle: Story = {
  args: { entity: { ...base.entity, title: null } },
};

export const Empty: Story = NoTitle;
export const Error: Story = Tombstoned;
