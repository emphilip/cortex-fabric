import type { Meta, StoryObj } from "@storybook/react";
import { IngestionRunRow } from "./IngestionRunRow";

const meta: Meta<typeof IngestionRunRow> = {
  title: "Admin/IngestionRunRow",
  component: IngestionRunRow,
};
export default meta;

type Story = StoryObj<typeof IngestionRunRow>;

const base = {
  run_id: "11111111-1111-4111-8111-111111111111",
  connector: "git",
  repo: "https://github.com/anthropics/anthropic-cookbook",
  started_at: new Date("2026-06-11T12:00:00Z").toISOString(),
};

export const Succeeded: Story = {
  args: {
    run: {
      ...base,
      finished_at: new Date("2026-06-11T12:01:30Z").toISOString(),
      status: "succeeded",
      parents: 333,
      chunks: 2168,
    },
  },
};

export const Running: Story = {
  args: { run: { ...base, status: "running" } },
};

export const Failed: Story = {
  args: {
    run: {
      ...base,
      finished_at: new Date("2026-06-11T12:00:05Z").toISOString(),
      status: "failed",
      error: "git clone refused — repository does not exist",
    },
  },
};

export const Queued: Story = {
  args: { run: { ...base, status: "queued" } },
};

export const Empty: Story = Queued;
export const Error: Story = Failed;
