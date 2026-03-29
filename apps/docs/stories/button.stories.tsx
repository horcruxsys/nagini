import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@horcruxsys/nagini/ui/button";

const meta: Meta<typeof Button> = {
  component: Button,
};

export default meta;

type Story = StoryObj<typeof Button>;

/*
 *👇 Render functions are a framework specific feature to allow you control on how the component renders.
 * See https://storybook.js.org/docs/react/api/csf
 * to learn how to use render functions.
 */
export const Primary: Story = {
  render: (props) => <Button {...props}>Hello</Button>,
  name: "Button",
  args: {
    children: "Hello",
    appName: "docs",
    className: "storybook-button",
  },
};
