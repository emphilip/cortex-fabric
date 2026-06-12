import type { Meta, StoryObj } from "@storybook/react";
import { ConnectorCard } from "./ConnectorCard";

const meta: Meta<typeof ConnectorCard> = {
  title: "Admin/ConnectorCard",
  component: ConnectorCard,
};
export default meta;

type Story = StoryObj<typeof ConnectorCard>;

export const Supported: Story = {
  args: {
    connector: { name: "git", supported: true },
    lastRunSummary: "succeeded · 333 files / 2168 chunks · 14m ago",
  },
};

export const SupportedNoRuns: Story = {
  args: { connector: { name: "git", supported: true } },
};

export const Deferred: Story = {
  args: {
    connector: {
      name: "confluence",
      supported: false,
      reason: "deferred: ships with add-confluence-connector",
    },
  },
};

export const Empty: Story = SupportedNoRuns;
export const Error: Story = Deferred;
